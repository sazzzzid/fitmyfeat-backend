import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Membership } from '@prisma/client';
import { isUUID } from 'class-validator';
import { parseFinanceRange } from '../finance/finance-values.js';
import { unpaidGap } from '../finance/finance-values.js';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from '../gyms/gyms.service.js';
import {
  dayKey,
  formatRupees,
  isExpiryDue,
  isInactiveDue,
  renderBody,
  utcDay,
} from './message-render.js';
import {
  CHANNELS,
  deliveryFor,
  parseCreateTemplate,
  parseUpdateTemplate,
  TRIGGERS,
  type AutomationTrigger,
  type ChannelName,
} from './message-values.js';

const TEMPLATE_NOT_FOUND = 'Message template was not found';
const TEMPLATE_INACTIVE = 'Message template is not active';
const TEMPLATE_NAME_USED = 'Message template name is already used';
const MEMBER_NOT_FOUND = 'Member was not found';
const MEMBER_LEFT = 'Member has left';
const GYM_NOT_ACTIVE = 'Communication requires an active gym';
const AUTOMATION_INVALID = 'Automation values are not valid';
const RUN_LIMIT = 100;

type MemberRow = {
  id: string;
  fullName: string;
  contact: string;
  createdAt: Date;
  leftAt: Date | null;
  membership: Membership | null;
  payments: Array<{ listPricePaise: number; amountReceivedPaise: number }>;
};

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymsService: GymsService,
  ) {}

  async listTemplates() {
    const rows = await this.prisma.messageTemplate.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { templates: rows.map(toTemplate) };
  }

  async createTemplate(body: object) {
    const input = parseCreateTemplate(body);
    try {
      const row = await this.prisma.messageTemplate.create({ data: input });
      return toTemplate(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(TEMPLATE_NAME_USED);
      }
      throw error;
    }
  }

  async updateTemplate(id: string, body: object) {
    const input = parseUpdateTemplate(body);
    if (!isUUID(id)) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND);
    }
    try {
      const updated = await this.prisma.messageTemplate.updateMany({
        where: { id },
        data: input,
      });
      if (updated.count === 0) {
        throw new NotFoundException(TEMPLATE_NOT_FOUND);
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(TEMPLATE_NAME_USED);
      }
      throw error;
    }
    const row = await this.prisma.messageTemplate.findUniqueOrThrow({ where: { id } });
    return toTemplate(row);
  }

  async analytics(from: unknown, to: unknown) {
    const range = parseFinanceRange(from, to);
    const rows = await this.prisma.message.groupBy({
      by: ['channel', 'status'],
      where: { createdAt: { gte: range.from, lt: range.toExclusive } },
      _count: { _all: true },
    });
    const channels = CHANNELS.map((channel) => ({
      channel,
      sent: count(rows, channel, 'sent'),
      failed: count(rows, channel, 'failed'),
    }));
    return {
      sent: channels.reduce((sum, row) => sum + row.sent, 0),
      failed: channels.reduce((sum, row) => sum + row.failed, 0),
      channels,
    };
  }

  async listMessages(ownerId: string, from: unknown, to: unknown) {
    const range = parseFinanceRange(from, to);
    const gymId = await this.requireActiveGym(ownerId);
    const rows = await this.prisma.message.findMany({
      where: { gymId, createdAt: { gte: range.from, lt: range.toExclusive } },
      include: { member: { select: { fullName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      messages: rows.map((row) => ({
        id: row.id,
        memberId: row.memberId,
        memberName: row.member.fullName,
        channel: row.channel,
        trigger: row.trigger,
        status: row.status,
        failureReason: row.failureReason,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async send(ownerId: string, body: object) {
    const record = body as { memberId?: unknown; templateId?: unknown };
    const memberId = record.memberId;
    const templateId = record.templateId;
    if (typeof memberId !== 'string' || !isUUID(memberId)) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    if (typeof templateId !== 'string' || !isUUID(templateId)) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND);
    }
    const gym = await this.requireGym(ownerId);
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId: gym.id },
      include: { membership: true, payments: true },
    });
    if (!member) {
      throw new NotFoundException(MEMBER_NOT_FOUND);
    }
    if (member.leftAt) {
      throw new ConflictException(MEMBER_LEFT);
    }
    const template = await this.prisma.messageTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND);
    }
    if (!template.isActive) {
      throw new ConflictException(TEMPLATE_INACTIVE);
    }
    const now = new Date();
    const rendered = this.render(template.body, gym.gymName, member);
    const delivery = deliveryFor(template.channel, member.contact);
    const row = await this.prisma.message.create({
      data: {
        gymId: gym.id,
        memberId: member.id,
        templateId: template.id,
        channel: template.channel,
        trigger: 'manual',
        status: delivery.status,
        failureReason: delivery.failureReason,
        body: rendered,
        sentOn: utcDay(now),
      },
      include: { member: { select: { fullName: true } } },
    });
    return {
      id: row.id,
      memberId: row.memberId,
      memberName: row.member.fullName,
      channel: row.channel,
      trigger: row.trigger,
      status: row.status,
      failureReason: row.failureReason,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async automations(ownerId: string) {
    const gymId = await this.requireActiveGym(ownerId);
    const rows = await this.prisma.gymAutomation.findMany({ where: { gymId } });
    return { automations: TRIGGERS.map((trigger) => toAutomation(trigger, rows)) };
  }

  async updateAutomations(ownerId: string, body: object) {
    const gymId = await this.requireActiveGym(ownerId);
    const record = body as Record<string, unknown>;
    const present = TRIGGERS.filter((trigger) => record[trigger] !== undefined);
    if (present.length === 0) {
      throw new BadRequestException(AUTOMATION_INVALID);
    }
    for (const trigger of present) {
      const value = parseAutomationValue(record[trigger]);
      if (!value.enabled) {
        await this.prisma.gymAutomation.deleteMany({ where: { gymId, trigger } });
        continue;
      }
      const template = await this.prisma.messageTemplate.findUnique({
        where: { id: value.templateId },
      });
      if (!template || !template.isActive) {
        throw new ConflictException(TEMPLATE_INACTIVE);
      }
      await this.prisma.gymAutomation.upsert({
        where: { gymId_trigger: { gymId, trigger } },
        create: { gymId, trigger, templateId: template.id, enabled: true },
        update: { templateId: template.id, enabled: true },
      });
    }
    return this.automations(ownerId);
  }

  async run(ownerId: string) {
    const gym = await this.requireGym(ownerId);
    return this.runGym(gym.id, gym.gymName, new Date());
  }

  async runForActiveGyms(now = new Date()): Promise<void> {
    const gyms = await this.prisma.gym.findMany({
      where: { status: 'active' },
      select: { id: true, gymName: true },
      orderBy: { id: 'asc' },
    });
    for (const gym of gyms) {
      await this.runGym(gym.id, gym.gymName, now);
    }
  }

  private async runGym(gymId: string, gymName: string | null, now: Date) {
    const sentOn = utcDay(now);
    const settings = await this.prisma.gymAutomation.findMany({
      where: { gymId, enabled: true },
      include: { template: true },
    });
    const active = settings.filter((row) => row.template.isActive);
    const members = await this.prisma.member.findMany({
      where: { gymId, leftAt: null },
      include: { membership: true, payments: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const existing = await this.prisma.message.findMany({
      where: { gymId, sentOn, trigger: { not: 'manual' } },
      select: { memberId: true, trigger: true },
    });
    const seen = new Set(existing.map((row) => `${row.memberId}:${row.trigger}`));
    const due: Array<{ member: MemberRow; trigger: AutomationTrigger; templateId: string; channel: ChannelName; body: string }> = [];
    for (const member of members) {
      for (const trigger of TRIGGERS) {
        const setting = active.find((row) => row.trigger === trigger);
        if (!setting || seen.has(`${member.id}:${trigger}`) || !matches(trigger, member, now)) {
          continue;
        }
        due.push({
          member,
          trigger,
          templateId: setting.templateId,
          channel: setting.template.channel,
          body: setting.template.body,
        });
      }
    }
    const batch = due.slice(0, RUN_LIMIT);
    let stored = 0;
    for (const item of batch) {
      const delivery = deliveryFor(item.channel, item.member.contact);
      try {
        await this.prisma.message.create({
          data: {
            gymId,
            memberId: item.member.id,
            templateId: item.templateId,
            channel: item.channel,
            trigger: item.trigger,
            status: delivery.status,
            failureReason: delivery.failureReason,
            body: this.render(item.body, gymName, item.member),
            sentOn,
          },
        });
        stored += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }
    return { stored, remaining: due.length - batch.length };
  }

  private render(template: string, gymName: string | null, member: MemberRow): string {
    const unpaid = member.payments.reduce(
      (sum, row) => sum + unpaidGap(row.listPricePaise, row.amountReceivedPaise),
      0,
    );
    return renderBody(template, {
      memberName: member.fullName,
      gymName: gymName ?? '',
      endDate: member.membership ? dayKey(member.membership.currentPeriodEnd) : '',
      unpaidAmount: formatRupees(unpaid),
    });
  }

  private async requireGym(ownerId: string) {
    const gym = await this.gymsService.getMine(ownerId);
    if (gym.status !== 'active') {
      throw new ConflictException(GYM_NOT_ACTIVE);
    }
    return gym;
  }

  private async requireActiveGym(ownerId: string): Promise<string> {
    return (await this.requireGym(ownerId)).id;
  }
}

function matches(trigger: AutomationTrigger, member: MemberRow, now: Date): boolean {
  if (trigger === 'expiry') {
    return isExpiryDue(member.membership, now);
  }
  if (trigger === 'payment') {
    return member.payments.some(
      (row) => unpaidGap(row.listPricePaise, row.amountReceivedPaise) > 0,
    );
  }
  return isInactiveDue(member.createdAt, member.membership, now);
}

function toTemplate(row: {
  id: string;
  channel: ChannelName;
  name: string;
  body: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    channel: row.channel,
    name: row.name,
    body: row.body,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAutomation(
  trigger: AutomationTrigger,
  rows: Array<{ trigger: string; enabled: boolean; templateId: string }>,
) {
  const row = rows.find((item) => item.trigger === trigger);
  return {
    trigger,
    enabled: row?.enabled ?? false,
    templateId: row?.templateId ?? null,
  };
}

function parseAutomationValue(
  value: unknown,
): { enabled: false } | { enabled: true; templateId: string } {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException(AUTOMATION_INVALID);
  }
  const record = value as { enabled?: unknown; templateId?: unknown };
  if (record.enabled === false) {
    return { enabled: false };
  }
  if (
    record.enabled === true &&
    typeof record.templateId === 'string' &&
    isUUID(record.templateId)
  ) {
    return { enabled: true, templateId: record.templateId };
  }
  throw new BadRequestException(AUTOMATION_INVALID);
}

function count(
  rows: Array<{ channel: string; status: string; _count: { _all: number } }>,
  channel: string,
  status: string,
): number {
  return rows.find((row) => row.channel === channel && row.status === status)?._count._all ?? 0;
}
