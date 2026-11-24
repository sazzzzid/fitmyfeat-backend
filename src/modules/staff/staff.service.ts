import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Gym, Prisma, RoleTemplate, StaffMember } from '@prisma/client';
import bcrypt from 'bcrypt';
import { isUUID } from 'class-validator';
import { ROLE_NAMES } from '../../common/constants/role-names.js';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import {
  pageBody,
  parseOptionalDayRange,
} from '../../common/validation/list-query.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService, type GymResponse } from '../gyms/gyms.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import {
  parseAuditScope,
  parseCreateStaff,
  parseTemplateUpdate,
  parseUpdateStaff,
  type StaffUpdateInput,
} from './staff-values.js';

type Tx = Prisma.TransactionClient;

const GYM_NOT_ACTIVE = 'Staff management requires an active gym';
const GYM_NOT_FOUND = 'Gym was not found';
const TEMPLATE_NOT_FOUND = 'Role template was not found';
const STAFF_NOT_FOUND = 'Staff member was not found';
const STAFF_LIMIT = 'Staff limit reached';
const ALREADY_DISABLED = 'Staff member is already disabled';
const NOT_DISABLED = 'Staff member is not disabled';
const STAFF_DISABLED = 'Staff account is disabled';
const EMAIL_USED = 'Email_Address is already used';

const staffInclude = {
  user: { select: { email: true } },
  template: { select: { name: true } },
} as const;

type StaffRow = StaffMember & {
  user: { email: string };
  template: { name: string };
};

export interface StaffResponse {
  id: string;
  email: string;
  fullName: string;
  title: StaffMember['title'];
  template: string;
  view: boolean;
  create: boolean;
  manage: boolean;
  disabled: boolean;
  createdAt: string;
}

export interface TemplateResponse {
  name: string;
  view: boolean;
  create: boolean;
  manage: boolean;
}

export interface AuditResponse {
  id: string;
  action: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  detail: Prisma.JsonValue;
  createdAt: string;
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymsService: GymsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async list(ownerId: string): Promise<{ staff: StaffResponse[] }> {
    const gymId = await this.requireActiveGym(ownerId);
    const rows = await this.prisma.staffMember.findMany({
      where: { gymId },
      include: staffInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { staff: rows.map(toStaff) };
  }

  async create(ownerId: string, body: object): Promise<StaffResponse> {
    const input = parseCreateStaff(body);
    const gymId = await this.requireActiveGym(ownerId);
    const role = await this.prisma.role.findUnique({
      where: { name: ROLE_NAMES.gymStaff },
    });
    if (!role) {
      throw new Error('Gym_Staff role is not seeded');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockGym(tx, gymId);
        const template = await this.requireTemplate(tx, input.template);
        await this.assertSeat(tx, gymId);
        const user = await tx.userAccount.create({
          data: {
            email: input.email,
            emailKey: input.emailKey,
            passwordHash,
            roleId: role.id,
          },
        });
        const staff = await tx.staffMember.create({
          data: {
            userId: user.id,
            gymId,
            fullName: input.fullName,
            title: input.title,
            templateId: template.id,
            canView: template.canView,
            canCreate: template.canCreate,
            canManage: template.canManage,
          },
          include: staffInclude,
        });
        await tx.auditLog.create({
          data: {
            gymId,
            actorUserId: ownerId,
            action: 'staff_created',
            targetType: 'staff',
            targetId: staff.id,
            detail: {
              email: staff.user.email,
              fullName: staff.fullName,
              title: staff.title,
              template: staff.template.name,
              view: staff.canView,
              create: staff.canCreate,
              manage: staff.canManage,
            },
          },
        });
        return toStaff(staff);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(EMAIL_USED);
      }
      throw error;
    }
  }

  async update(
    ownerId: string,
    staffId: string,
    body: object,
  ): Promise<StaffResponse> {
    const input = parseUpdateStaff(body);
    const gymId = await this.requireActiveGym(ownerId);
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireStaff(tx, gymId, staffId);
      const next = await this.nextStaff(tx, existing, input);
      if (input.password !== undefined) {
        const passwordHash = await bcrypt.hash(input.password, 12);
        await tx.userAccount.update({
          where: { id: existing.userId },
          data: { passwordHash },
        });
      }
      const staff = await tx.staffMember.update({
        where: { id: existing.id },
        data: {
          fullName: next.fullName,
          title: next.title,
          templateId: next.templateId,
          canView: next.canView,
          canCreate: next.canCreate,
          canManage: next.canManage,
        },
        include: staffInclude,
      });
      const detail: Record<string, Prisma.InputJsonValue> = {
        before: next.before,
        after: next.after,
      };
      if (input.password !== undefined) {
        detail.passwordChanged = true;
      }
      await tx.auditLog.create({
        data: {
          gymId,
          actorUserId: ownerId,
          action: 'staff_updated',
          targetType: 'staff',
          targetId: staff.id,
          detail,
        },
      });
      return toStaff(staff);
    });
  }

  async disable(ownerId: string, staffId: string): Promise<StaffResponse> {
    const gymId = await this.requireActiveGym(ownerId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireStaff(tx, gymId, staffId);
      if (existing.disabledAt) {
        throw new ConflictException(ALREADY_DISABLED);
      }
      const staff = await tx.staffMember.update({
        where: { id: existing.id },
        data: { disabledAt: now },
        include: staffInclude,
      });
      await this.auditStaffState(tx, ownerId, staff, 'staff_disabled');
      return toStaff(staff);
    });
  }

  async enable(ownerId: string, staffId: string): Promise<StaffResponse> {
    const gymId = await this.requireActiveGym(ownerId);
    return this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      const existing = await this.requireStaff(tx, gymId, staffId);
      if (!existing.disabledAt) {
        throw new ConflictException(NOT_DISABLED);
      }
      await this.assertSeat(tx, gymId);
      const staff = await tx.staffMember.update({
        where: { id: existing.id },
        data: { disabledAt: null },
        include: staffInclude,
      });
      await this.auditStaffState(tx, ownerId, staff, 'staff_enabled');
      return toStaff(staff);
    });
  }

  async listTemplates(): Promise<{ templates: TemplateResponse[] }> {
    const rows = await this.prisma.roleTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return { templates: rows.map(toTemplate) };
  }

  async updateTemplate(
    actorId: string,
    name: string,
    body: object,
  ): Promise<TemplateResponse> {
    const input = parseTemplateUpdate(body);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.roleTemplate.findUnique({ where: { name } });
      if (!template) {
        throw new NotFoundException(TEMPLATE_NOT_FOUND);
      }
      const updated = await tx.roleTemplate.update({
        where: { id: template.id },
        data: {
          canView: input.view ?? template.canView,
          canCreate: input.create ?? template.canCreate,
          canManage: input.manage ?? template.canManage,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: 'template_updated',
          targetType: 'role_template',
          targetId: updated.id,
          detail: {
            name: updated.name,
            before: flagsOf(template),
            after: flagsOf(updated),
          },
        },
      });
      return toTemplate(updated);
    });
  }

  async listAudit(
    actorId: string,
    scope: unknown,
    query: { from?: string; to?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ entries: AuditResponse[]; nextCursor?: string | null }> {
    const parsed = parseAuditScope(scope);
    const range = parseOptionalDayRange(query.from, query.to);
    const where =
      parsed === 'platform'
        ? { gymId: null }
        : { gymId: await this.requireActiveGym(actorId) };
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...where,
        ...(range
          ? { createdAt: { gte: range.start, lt: range.endExclusive } }
          : {}),
      },
      include: { actor: { select: { email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const entries = rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorEmail: row.actor.email,
      targetType: row.targetType,
      targetId: row.targetId,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    }));
    return pageBody('entries', entries, query.limit, query.cursor, (row) => row.id);
  }

  async gymForCaller(userId: string): Promise<GymResponse> {
    const owned = await this.prisma.gym.findUnique({
      where: { ownerId: userId },
    });
    if (owned) {
      return toGymResponse(owned);
    }
    const staff = await this.prisma.staffMember.findUnique({
      where: { userId },
      include: { gym: true },
    });
    if (!staff) {
      throw new NotFoundException(GYM_NOT_FOUND);
    }
    if (staff.disabledAt) {
      throw new ForbiddenException(STAFF_DISABLED);
    }
    return toGymResponse(staff.gym);
  }

  private async requireActiveGym(ownerId: string): Promise<string> {
    const gym = await this.gymsService.getMine(ownerId);
    if (gym.status !== 'active') {
      throw new ConflictException(GYM_NOT_ACTIVE);
    }
    return gym.id;
  }

  private async requireTemplate(tx: Tx, name: string): Promise<RoleTemplate> {
    const template = await tx.roleTemplate.findUnique({ where: { name } });
    if (!template) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND);
    }
    return template;
  }

  private async requireStaff(
    tx: Tx,
    gymId: string,
    staffId: string,
  ): Promise<StaffRow> {
    if (!isUUID(staffId)) {
      throw new NotFoundException(STAFF_NOT_FOUND);
    }
    const staff = await tx.staffMember.findFirst({
      where: { id: staffId, gymId },
      include: staffInclude,
    });
    if (!staff) {
      throw new NotFoundException(STAFF_NOT_FOUND);
    }
    return staff;
  }

  private async assertSeat(tx: Tx, gymId: string): Promise<void> {
    const entitlements = await this.subscriptions.entitlementsForGym(
      gymId,
      new Date(),
      tx,
    );
    const count = await tx.staffMember.count({
      where: { gymId, disabledAt: null },
    });
    if (entitlements.maxStaff !== null && count >= entitlements.maxStaff) {
      throw new ConflictException(STAFF_LIMIT);
    }
  }

  private async nextStaff(
    tx: Tx,
    existing: StaffRow,
    input: StaffUpdateInput,
  ): Promise<{
    fullName: string;
    title: StaffMember['title'];
    templateId: string;
    canView: boolean;
    canCreate: boolean;
    canManage: boolean;
    before: Record<string, Prisma.InputJsonValue>;
    after: Record<string, Prisma.InputJsonValue>;
  }> {
    let templateId = existing.templateId;
    let templateName = existing.template.name;
    let canView = existing.canView;
    let canCreate = existing.canCreate;
    let canManage = existing.canManage;
    if (input.template !== undefined) {
      const template = await this.requireTemplate(tx, input.template);
      templateId = template.id;
      templateName = template.name;
      canView = template.canView;
      canCreate = template.canCreate;
      canManage = template.canManage;
    }
    if (input.view !== undefined) {
      canView = input.view;
    }
    if (input.create !== undefined) {
      canCreate = input.create;
    }
    if (input.manage !== undefined) {
      canManage = input.manage;
    }
    const fullName = input.fullName ?? existing.fullName;
    const title = input.title ?? existing.title;
    const before: Record<string, Prisma.InputJsonValue> = {};
    const after: Record<string, Prisma.InputJsonValue> = {};
    if (fullName !== existing.fullName) {
      before.fullName = existing.fullName;
      after.fullName = fullName;
    }
    if (title !== existing.title) {
      before.title = existing.title;
      after.title = title;
    }
    if (templateName !== existing.template.name) {
      before.template = existing.template.name;
      after.template = templateName;
    }
    if (canView !== existing.canView) {
      before.view = existing.canView;
      after.view = canView;
    }
    if (canCreate !== existing.canCreate) {
      before.create = existing.canCreate;
      after.create = canCreate;
    }
    if (canManage !== existing.canManage) {
      before.manage = existing.canManage;
      after.manage = canManage;
    }
    return {
      fullName,
      title,
      templateId,
      canView,
      canCreate,
      canManage,
      before,
      after,
    };
  }

  private async auditStaffState(
    tx: Tx,
    actorId: string,
    staff: StaffRow,
    action: 'staff_disabled' | 'staff_enabled',
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        gymId: staff.gymId,
        actorUserId: actorId,
        action,
        targetType: 'staff',
        targetId: staff.id,
        detail: { email: staff.user.email, fullName: staff.fullName },
      },
    });
  }
}

function toStaff(staff: StaffRow): StaffResponse {
  return {
    id: staff.id,
    email: staff.user.email,
    fullName: staff.fullName,
    title: staff.title,
    template: staff.template.name,
    view: staff.canView,
    create: staff.canCreate,
    manage: staff.canManage,
    disabled: staff.disabledAt !== null,
    createdAt: staff.createdAt.toISOString(),
  };
}

function toTemplate(template: RoleTemplate): TemplateResponse {
  return {
    name: template.name,
    view: template.canView,
    create: template.canCreate,
    manage: template.canManage,
  };
}

function flagsOf(template: RoleTemplate): Prisma.InputJsonObject {
  return {
    view: template.canView,
    create: template.canCreate,
    manage: template.canManage,
  };
}

function toGymResponse(gym: Gym): GymResponse {
  return {
    id: gym.id,
    status: gym.status,
    gymName: gym.gymName,
    address: gym.address,
    contact: gym.contact,
    timing: gym.timing,
    logoValue: gym.logoValue,
    contactEmail: gym.contactEmail,
    description: gym.description,
    mapsUrl: gym.mapsUrl,
  };
}

async function lockGym(tx: Tx, gymId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "gyms" WHERE "id" = ${gymId}::uuid FOR UPDATE`;
}
