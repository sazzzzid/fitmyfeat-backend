import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import {
  pageBody,
  parseOptionalDayRange,
  QUERY_INVALID,
  searchNeedle,
} from '../../common/validation/list-query.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from '../gyms/gyms.service.js';
import {
  commissionPaise,
  parseChargeStatus,
  parseExpense,
  parseFinanceRange,
  parseSettlementMonth,
  unpaidGap,
  type ChargeStatusName,
} from './finance-values.js';
import { reportedStatus } from '../members/membership-state.js';

type Tx = Prisma.TransactionClient;

const CHARGE_NOT_FOUND = 'Platform charge was not found';
const CHARGE_CANNOT_REFUND = 'Platform charge cannot be refunded';
const CHARGE_REFUNDED = 'Platform charge is already refunded';
const ONLY_PENDING = 'Only a pending payment can be marked failed';
const SUBSCRIPTION_NOT_FOUND = 'Subscription was not found';
const SETTLEMENT_EXISTS = 'Settlement already exists';
const GYM_NOT_ACTIVE = 'Gym finance requires an active gym';
const PAYMENT_NOT_FOUND = 'Payment was not found';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymsService: GymsService,
    private readonly config: ConfigService,
  ) {}

  async recordPaidCharge(
    tx: Tx,
    input: {
      gymId: string;
      subscriptionId: string;
      amountPaise: number;
      recordedAt: Date;
    },
  ): Promise<void> {
    const commissionPercent = this.percent();
    await tx.platformCharge.create({
      data: {
        gymId: input.gymId,
        subscriptionId: input.subscriptionId,
        amountPaise: input.amountPaise,
        commissionPercent,
        commissionPaise: commissionPaise(input.amountPaise, commissionPercent),
        status: 'paid',
        recordedAt: input.recordedAt,
      },
    });
  }

  async listPayments(
    status: unknown,
    query: {
      from?: string;
      to?: string;
      gymId?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ) {
    const parsed = parseChargeStatus(status);
    const range = parseOptionalDayRange(query.from, query.to);
    if (query.gymId !== undefined && !isUUID(query.gymId)) {
      throw new BadRequestException(QUERY_INVALID);
    }
    const rows = await this.prisma.platformCharge.findMany({
      where: {
        ...(parsed ? { status: parsed } : {}),
        ...(query.gymId ? { gymId: query.gymId } : {}),
        ...(range
          ? { recordedAt: { gte: range.start, lt: range.endExclusive } }
          : {}),
      },
      include: {
        gym: { select: { gymName: true } },
        subscription: {
          select: { planName: true, plan: { select: { name: true } } },
        },
      },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    });
    const payments = rows.map((row) => ({
      ...toCharge(row),
      gymName: row.gym.gymName,
      planName: row.subscription.planName ?? row.subscription.plan.name,
    }));
    return pageBody('payments', payments, query.limit, query.cursor, (row) => row.id);
  }

  async refund(id: string) {
    if (!isUUID(id)) {
      throw new NotFoundException(CHARGE_NOT_FOUND);
    }
    const now = new Date();
    try {
      const updated = await this.prisma.platformCharge.updateMany({
        where: { id, status: 'paid' },
        data: { status: 'refunded', refundedAt: now },
      });
      if (updated.count === 1) {
        const row = await this.prisma.platformCharge.findUniqueOrThrow({
          where: { id },
        });
        return toCharge(row);
      }
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
    const existing = await this.prisma.platformCharge.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(CHARGE_NOT_FOUND);
    }
    if (existing.status === 'refunded') {
      throw new ConflictException(CHARGE_REFUNDED);
    }
    throw new ConflictException(CHARGE_CANNOT_REFUND);
  }

  async failSubscription(id: string) {
    if (!isUUID(id)) {
      throw new NotFoundException(SUBSCRIPTION_NOT_FOUND);
    }
    const found = await this.prisma.subscription.findUnique({
      where: { id },
      select: { gymId: true },
    });
    if (!found) {
      throw new NotFoundException(SUBSCRIPTION_NOT_FOUND);
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "gyms" WHERE "id" = ${found.gymId}::uuid FOR UPDATE`;
      const row = await tx.subscription.findUnique({
        where: { id },
        include: { plan: true },
      });
      if (!row) {
        throw new NotFoundException(SUBSCRIPTION_NOT_FOUND);
      }
      if (row.status !== 'pending_payment') {
        throw new ConflictException(ONLY_PENDING);
      }
      await tx.subscription.update({
        where: { id },
        data: { status: 'failed' },
      });
      const charge = await tx.platformCharge.create({
        data: {
          gymId: row.gymId,
          subscriptionId: row.id,
          amountPaise: row.plan.priceMonthlyPaise,
          commissionPercent: 0,
          commissionPaise: 0,
          status: 'failed',
          recordedAt: now,
        },
      });
      return toCharge(charge);
    });
  }

  async listSettlements() {
    const rows = await this.prisma.settlement.findMany({
      orderBy: { month: 'desc' },
    });
    return {
      settlements: rows.map((row) => ({
        id: row.id,
        month: row.month,
        amountPaise: row.amountPaise,
        settledAt: row.settledAt.toISOString(),
      })),
    };
  }

  async settle(actorId: string, body: object) {
    const month = parseSettlementMonth(
      (body as { month?: unknown }).month,
      new Date(),
    );
    const charges = await this.prisma.platformCharge.findMany({
      where: {
        status: 'paid',
        recordedAt: { gte: month.start, lt: month.end },
      },
    });
    const amountPaise = charges.reduce((sum, row) => sum + row.commissionPaise, 0);
    try {
      const row = await this.prisma.settlement.create({
        data: {
          month: month.month,
          amountPaise,
          actorUserId: actorId,
        },
      });
      return {
        id: row.id,
        month: row.month,
        amountPaise: row.amountPaise,
        settledAt: row.settledAt.toISOString(),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(SETTLEMENT_EXISTS);
      }
      throw error;
    }
  }

  async platformReport(from: unknown, to: unknown) {
    const range = parseFinanceRange(from, to);
    const rows = await this.prisma.platformCharge.findMany({
      where: {
        OR: [
          { recordedAt: { gte: range.from, lt: range.toExclusive } },
          { refundedAt: { gte: range.from, lt: range.toExclusive } },
        ],
      },
    });
    let revenuePaise = 0;
    let refundedPaise = 0;
    let commissionPaise = 0;
    let failedPaise = 0;
    let failedCount = 0;
    for (const row of rows) {
      const recorded = inRange(row.recordedAt, range);
      const refunded = row.refundedAt !== null && inRange(row.refundedAt, range);
      if (recorded && (row.status === 'paid' || row.status === 'refunded')) {
        revenuePaise += row.amountPaise;
      }
      if (recorded && row.status === 'paid') {
        commissionPaise += row.commissionPaise;
      }
      if (recorded && row.status === 'failed') {
        failedPaise += row.amountPaise;
        failedCount += 1;
      }
      if (refunded) {
        refundedPaise += row.amountPaise;
      }
    }
    return {
      revenuePaise,
      refundedPaise,
      commissionPaise,
      failedPaise,
      failedCount,
      netPaise: revenuePaise - refundedPaise,
    };
  }

  async income(
    ownerId: string,
    query: { from?: string; to?: string; limit?: number; cursor?: string } = {},
  ) {
    const gymId = await this.requireActiveGym(ownerId);
    const range = parseOptionalDayRange(query.from, query.to);
    const rows = await this.prisma.membershipPayment.findMany({
      where: {
        gymId,
        ...(range ? { paidOn: { gte: range.start, lt: range.endExclusive } } : {}),
      },
      include: {
        member: { select: { fullName: true } },
        membership: { select: { productName: true } },
      },
      orderBy: [{ paidOn: 'asc' }, { id: 'asc' }],
    });
    return pageBody(
      'payments',
      rows.map(toIncome),
      query.limit,
      query.cursor,
      (row) => row.id,
    );
  }

  async listExpenses(
    ownerId: string,
    query: { from?: string; to?: string; limit?: number; cursor?: string } = {},
  ) {
    const gymId = await this.requireActiveGym(ownerId);
    const range = parseOptionalDayRange(query.from, query.to);
    const rows = await this.prisma.expense.findMany({
      where: {
        gymId,
        ...(range ? { paidOn: { gte: range.start, lt: range.endExclusive } } : {}),
      },
      orderBy: [{ paidOn: 'asc' }, { id: 'asc' }],
    });
    return pageBody(
      'expenses',
      rows.map(toExpense),
      query.limit,
      query.cursor,
      (row) => row.id,
    );
  }

  async createExpense(ownerId: string, body: object) {
    const input = parseExpense(body);
    const gymId = await this.requireActiveGym(ownerId);
    const row = await this.prisma.expense.create({
      data: { gymId, ...input },
    });
    return toExpense(row);
  }

  async outstanding(
    ownerId: string,
    query: { q?: string; limit?: number; cursor?: string } = {},
  ) {
    const gymId = await this.requireActiveGym(ownerId);
    const needle = searchNeedle(query.q);
    const now = new Date();
    const rows = await this.prisma.membershipPayment.findMany({
      where: { gymId },
      include: {
        member: {
          select: {
            fullName: true,
            membership: {
              select: {
                status: true,
                productName: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                frozenAt: true,
              },
            },
          },
        },
      },
    });
    const byMember = new Map<
      string,
      {
        memberId: string;
        fullName: string;
        unpaidPaise: number;
        productName: string | null;
        dueOn: string | null;
        membershipStatus: 'active' | 'frozen' | 'expired' | 'none';
      }
    >();
    for (const row of rows) {
      const gap = unpaidGap(row.listPricePaise, row.amountReceivedPaise);
      if (gap === 0) {
        continue;
      }
      if (needle && !row.member.fullName.toLowerCase().includes(needle)) {
        continue;
      }
      const current = byMember.get(row.memberId) ?? {
        memberId: row.memberId,
        fullName: row.member.fullName,
        unpaidPaise: 0,
        ...membershipDetail(row.member.membership, now),
      };
      current.unpaidPaise += gap;
      byMember.set(row.memberId, current);
    }
    const members = [...byMember.values()].sort(
      (a, b) => b.unpaidPaise - a.unpaidPaise || (a.memberId < b.memberId ? -1 : 1),
    );
    return {
      totalPaise: members.reduce((sum, row) => sum + row.unpaidPaise, 0),
      ...pageBody('members', members, query.limit, query.cursor, (row) => row.memberId),
    };
  }

  async ledger(ownerId: string, from: unknown, to: unknown) {
    const range = parseFinanceRange(from, to);
    const gymId = await this.requireActiveGym(ownerId);
    const payments = await this.prisma.membershipPayment.findMany({
      where: { gymId, paidOn: { gte: range.from, lt: range.toExclusive } },
      include: { member: { select: { fullName: true } } },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { gymId, paidOn: { gte: range.from, lt: range.toExclusive } },
    });
    const lines = [
      ...payments.map((row) => ({
        id: row.id,
        kind: 'income' as const,
        paidOn: dayString(row.paidOn),
        amountPaise: row.amountReceivedPaise,
        label: row.member.fullName,
      })),
      ...expenses.map((row) => ({
        id: row.id,
        kind: 'expense' as const,
        paidOn: dayString(row.paidOn),
        amountPaise: row.amountPaise,
        label: row.category,
      })),
    ].sort((a, b) => {
      if (a.paidOn !== b.paidOn) {
        return a.paidOn < b.paidOn ? -1 : 1;
      }
      if (a.kind !== b.kind) {
        return a.kind === 'expense' ? -1 : 1;
      }
      return a.id < b.id ? -1 : 1;
    });
    let balancePaise = 0;
    return {
      entries: lines.map((line) => {
        balancePaise += line.kind === 'income' ? line.amountPaise : -line.amountPaise;
        return { ...line, balancePaise };
      }),
    };
  }

  async invoice(ownerId: string, paymentId: string) {
    const payment = await this.paymentForGym(ownerId, paymentId);
    return {
      paymentId: payment.id,
      gymName: payment.gym.gymName ?? '',
      memberName: payment.member.fullName,
      productName: payment.membership.productName,
      listPricePaise: payment.listPricePaise,
      amountReceivedPaise: payment.amountReceivedPaise,
      paidOn: dayString(payment.paidOn),
      method: payment.method,
    };
  }

  async receipt(ownerId: string, paymentId: string) {
    const payment = await this.paymentForGym(ownerId, paymentId);
    return {
      paymentId: payment.id,
      gymName: payment.gym.gymName ?? '',
      memberName: payment.member.fullName,
      amountReceivedPaise: payment.amountReceivedPaise,
      paidOn: dayString(payment.paidOn),
      method: payment.method,
    };
  }

  async gymReport(ownerId: string, from: unknown, to: unknown) {
    const range = parseFinanceRange(from, to);
    const gymId = await this.requireActiveGym(ownerId);
    const payments = await this.prisma.membershipPayment.findMany({
      where: { gymId, paidOn: { lte: new Date(`${range.toDay}T00:00:00.000Z`) } },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { gymId, paidOn: { gte: range.from, lt: range.toExclusive } },
    });
    let incomePaise = 0;
    let outstandingPaise = 0;
    for (const row of payments) {
      if (row.paidOn >= range.from) {
        incomePaise += row.amountReceivedPaise;
      }
      outstandingPaise += unpaidGap(row.listPricePaise, row.amountReceivedPaise);
    }
    const expensePaise = expenses.reduce((sum, row) => sum + row.amountPaise, 0);
    return {
      incomePaise,
      expensePaise,
      netPaise: incomePaise - expensePaise,
      outstandingPaise,
    };
  }

  private percent(): number {
    return this.config.get<number>('commissionPercent') ?? 0;
  }

  private async requireActiveGym(ownerId: string): Promise<string> {
    const gym = await this.gymsService.getMine(ownerId);
    if (gym.status !== 'active') {
      throw new ConflictException(GYM_NOT_ACTIVE);
    }
    return gym.id;
  }

  private async paymentForGym(ownerId: string, paymentId: string) {
    const gymId = await this.requireActiveGym(ownerId);
    if (!isUUID(paymentId)) {
      throw new NotFoundException(PAYMENT_NOT_FOUND);
    }
    const payment = await this.prisma.membershipPayment.findFirst({
      where: { id: paymentId, gymId },
      include: {
        member: { select: { fullName: true } },
        membership: { select: { productName: true } },
        gym: { select: { gymName: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException(PAYMENT_NOT_FOUND);
    }
    return payment;
  }
}

function inRange(
  value: Date,
  range: { from: Date; toExclusive: Date },
): boolean {
  return value >= range.from && value < range.toExclusive;
}

function dayString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function membershipDetail(
  membership: {
    status: 'active' | 'frozen';
    productName: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    frozenAt: Date | null;
  } | null,
  now: Date,
): {
  productName: string | null;
  dueOn: string | null;
  membershipStatus: 'active' | 'frozen' | 'expired' | 'none';
} {
  if (!membership) {
    return { productName: null, dueOn: null, membershipStatus: 'none' };
  }
  return {
    productName: membership.productName,
    dueOn: dayString(membership.currentPeriodEnd),
    membershipStatus: reportedStatus(membership, now),
  };
}

function toCharge(row: {
  id: string;
  gymId: string;
  subscriptionId: string;
  amountPaise: number;
  commissionPercent: number;
  commissionPaise: number;
  status: ChargeStatusName;
  recordedAt: Date;
  refundedAt: Date | null;
}) {
  return {
    id: row.id,
    gymId: row.gymId,
    subscriptionId: row.subscriptionId,
    amountPaise: row.amountPaise,
    commissionPercent: row.commissionPercent,
    commissionPaise: row.commissionPaise,
    status: row.status,
    recordedAt: row.recordedAt.toISOString(),
    refundedAt: row.refundedAt?.toISOString() ?? null,
  };
}

function toExpense(row: {
  id: string;
  category: string;
  amountPaise: number;
  paidOn: Date;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    category: row.category,
    amountPaise: row.amountPaise,
    paidOn: dayString(row.paidOn),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toIncome(row: {
  id: string;
  memberId: string;
  action: string;
  listPricePaise: number;
  amountReceivedPaise: number;
  paidOn: Date;
  method: string;
  createdAt: Date;
  member: { fullName: string };
  membership: { productName: string };
}) {
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.member.fullName,
    productName: row.membership.productName,
    action: row.action,
    listPricePaise: row.listPricePaise,
    amountReceivedPaise: row.amountReceivedPaise,
    paidOn: dayString(row.paidOn),
    method: row.method,
    createdAt: row.createdAt.toISOString(),
  };
}
