import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Plan, Prisma, Subscription } from '@prisma/client';
import { isUUID } from 'class-validator';
import {
  PLAN_CURRENCY,
  type PlanCurrency,
} from '../../common/constants/plan-currency.js';
import {
  SUBSCRIPTION_STATUSES,
  type ReportedSubscriptionStatus,
} from '../../common/constants/subscription-status.js';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { pageBody, searchNeedle } from '../../common/validation/list-query.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from '../gyms/gyms.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { addOneMonthUtc, addTrialDays } from './billing-period.js';
import { SUBSCRIPTION_ERRORS as ERR } from './subscription-errors.js';
import {
  entitlementsFrom,
  isInEffect,
  pickCurrent,
  reportedStatus,
  whereReportedStatus,
  type Entitlements,
} from './subscription-state.js';

type Tx = Prisma.TransactionClient;
type SubscriptionWithPlan = Subscription & { plan: Plan };

const ADMIN_INCLUDE = {
  plan: true,
  gym: { select: { gymName: true, owner: { select: { email: true } } } },
} satisfies Prisma.SubscriptionInclude;

type AdminSubscriptionRow = Prisma.SubscriptionGetPayload<{
  include: typeof ADMIN_INCLUDE;
}>;

export interface SubscriptionResponse {
  id: string;
  status: ReportedSubscriptionStatus;
  planCode: string;
  planName: string;
  priceMonthlyPaise: number;
  currency: PlanCurrency;
  featureFlags: string[];
  maxMembers: number | null;
  maxStaff: number | null;
  maxBranches: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  /** True for a trial, including an expired one (requirement 10.7). */
  isTrial: boolean;
}

export interface AdminSubscriptionResponse extends SubscriptionResponse {
  gymId: string;
  gymName: string | null;
  ownerEmail: string;
}

export interface OwnSubscriptionResponse {
  current: SubscriptionResponse | null;
  pending: SubscriptionResponse | null;
  trialUsed: boolean;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymsService: GymsService,
    private readonly finance: FinanceService,
  ) {}

  async getMine(ownerId: string): Promise<OwnSubscriptionResponse> {
    const gym = await this.gymsService.getMine(ownerId);
    const rows = await this.prisma.subscription.findMany({
      where: { gymId: gym.id },
      include: { plan: true },
    });
    const now = new Date();
    const current = pickCurrent(rows);
    const pending = rows.find((row) => row.status === 'pending_payment');
    return {
      current: current ? toSubscriptionResponse(current, now) : null,
      pending: pending ? toSubscriptionResponse(pending, now) : null,
      trialUsed: rows.some((row) => row.status === 'trialing'),
    };
  }

  async getEntitlements(ownerId: string): Promise<Entitlements> {
    const gym = await this.gymsService.getMine(ownerId);
    return this.entitlementsForGym(gym.id);
  }

  /**
   * Read-only Entitlements. Phase 2 routes do not use this to allow or reject
   * an action. Phase 3 member creation reads maxMembers from it.
   */
  async entitlementsForGym(
    gymId: string,
    now: Date = new Date(),
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Entitlements> {
    const rows = await db.subscription.findMany({
      where: {
        gymId,
        status: { in: ['trialing', 'active'] },
        currentPeriodEnd: { gt: now },
      },
      include: { plan: { select: { code: true } } },
    });
    return entitlementsFrom(rows, now);
  }

  async startTrial(
    ownerId: string,
    planCode: unknown,
  ): Promise<SubscriptionResponse> {
    const code = requirePlanCode(planCode);
    const gymId = await this.requireActiveGym(ownerId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockGym(tx, gymId);
        const plan = await findAvailablePlan(tx, code);
        if (plan.trialDays === 0) {
          throw new ConflictException(ERR.noTrial);
        }
        const rows = await tx.subscription.findMany({ where: { gymId } });
        if (rows.some((row) => row.status === 'trialing')) {
          throw new ConflictException(ERR.trialUsed);
        }
        const now = new Date();
        if (rows.some((row) => isInEffect(row, now))) {
          throw new ConflictException(ERR.alreadyInEffect);
        }
        const periodEnd = addTrialDays(now, plan.trialDays);
        const created = await tx.subscription.create({
          data: {
            gymId,
            planId: plan.id,
            status: 'trialing',
            ...snapshotOf(plan),
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            startedAt: now,
            expiredAt: periodEnd,
          },
          include: { plan: true },
        });
        return toSubscriptionResponse(created, now);
      });
    } catch (error) {
      // Only subscriptions_one_trial_per_gym can be violated by this insert.
      if (isUniqueViolation(error)) {
        throw new ConflictException(ERR.trialUsed);
      }
      throw error;
    }
  }

  async requestPlan(
    ownerId: string,
    planCode: unknown,
  ): Promise<SubscriptionResponse> {
    const code = requirePlanCode(planCode);
    const gymId = await this.requireActiveGym(ownerId);
    return this.prisma.$transaction(async (tx) => {
      await lockGym(tx, gymId);
      const plan = await findAvailablePlan(tx, code);
      const now = new Date();
      const rows = await tx.subscription.findMany({ where: { gymId } });
      const inEffect = rows.find((row) => isInEffect(row, now));
      if (inEffect?.status === 'active' && inEffect.planId === plan.id) {
        throw new ConflictException(ERR.planInEffect);
      }
      const pending = rows.find((row) => row.status === 'pending_payment');
      const saved = pending
        ? await tx.subscription.update({
            where: { id: pending.id },
            data: { planId: plan.id },
            include: { plan: true },
          })
        : await tx.subscription.create({
            data: { gymId, planId: plan.id, status: 'pending_payment' },
            include: { plan: true },
          });
      return toSubscriptionResponse(saved, now);
    });
  }

  async markPaid(id: string): Promise<AdminSubscriptionResponse> {
    if (!isUUID(id)) {
      throw new NotFoundException(ERR.subscriptionNotFound);
    }
    const found = await this.prisma.subscription.findUnique({
      where: { id },
      select: { gymId: true },
    });
    if (!found) {
      throw new NotFoundException(ERR.subscriptionNotFound);
    }
    return this.prisma.$transaction(async (tx) => {
      await lockGym(tx, found.gymId);
      const row = await tx.subscription.findUnique({
        where: { id },
        include: { plan: true },
      });
      if (!row) {
        throw new NotFoundException(ERR.subscriptionNotFound);
      }
      const now = new Date();
      if (row.status === 'trialing') {
        throw new ConflictException(ERR.trialNotPayable);
      }
      if (row.status === 'pending_payment') {
        // The Subscription In_Effect ends now; remaining time is not credited.
        await tx.subscription.updateMany({
          where: {
            gymId: row.gymId,
            id: { not: row.id },
            status: { in: ['trialing', 'active'] },
            currentPeriodEnd: { gt: now },
          },
          data: { currentPeriodEnd: now, expiredAt: now },
        });
        const periodEnd = addOneMonthUtc(now);
        await tx.subscription.update({
          where: { id },
          data: {
            status: 'active',
            ...snapshotOf(row.plan),
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            startedAt: now,
            expiredAt: periodEnd,
          },
        });
      } else {
        const rows = await tx.subscription.findMany({
          where: { gymId: row.gymId, status: { in: ['trialing', 'active'] } },
        });
        if (pickCurrent(rows)?.id !== row.id || row.currentPeriodEnd === null) {
          throw new ConflictException(ERR.notCurrent);
        }
        const periodEnd = isInEffect(row, now)
          ? addOneMonthUtc(row.currentPeriodEnd ?? now)
          : addOneMonthUtc(now);
        const period = isInEffect(row, now)
          ? { currentPeriodEnd: periodEnd, expiredAt: periodEnd }
          : {
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              expiredAt: periodEnd,
            };
        await tx.subscription.update({
          where: { id },
          data: { ...snapshotOf(row.plan), ...period },
        });
      }
      const saved = await tx.subscription.findUniqueOrThrow({
        where: { id },
        include: ADMIN_INCLUDE,
      });
      await this.finance.recordPaidCharge(tx, {
        gymId: saved.gymId,
        subscriptionId: saved.id,
        amountPaise: saved.priceMonthlyPaise ?? 0,
        recordedAt: now,
      });
      return toAdminSubscriptionResponse(saved, now);
    });
  }

  async list(
    status?: string,
    query: { q?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ subscriptions: AdminSubscriptionResponse[]; nextCursor?: string | null }> {
    if (status !== undefined && !isReportedStatus(status)) {
      throw new BadRequestException(ERR.filterInvalid);
    }
    const needle = searchNeedle(query.q);
    const now = new Date();
    const rows = await this.prisma.subscription.findMany({
      where: status === undefined ? {} : whereReportedStatus(status, now),
      include: ADMIN_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const listed = rows
      .filter(
        (row) =>
          !needle ||
          (row.gym.gymName ?? '').toLowerCase().includes(needle) ||
          row.gym.owner.email.toLowerCase().includes(needle),
      )
      .map((row) => toAdminSubscriptionResponse(row, now));
    return pageBody(
      'subscriptions',
      listed,
      query.limit,
      query.cursor,
      (row) => row.id,
    );
  }

  private async requireActiveGym(ownerId: string): Promise<string> {
    const gym = await this.gymsService.getMine(ownerId);
    if (gym.status !== 'active') {
      throw new ConflictException(ERR.gymNotActive);
    }
    return gym.id;
  }
}

/**
 * Serializes every Subscription write for one Gym. The row is locked, not
 * written, so Phase 1 Gym data stays unchanged.
 */
async function lockGym(tx: Tx, gymId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "gyms" WHERE "id" = ${gymId}::uuid FOR UPDATE`;
}

function requirePlanCode(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(ERR.selectionInvalid);
  }
  return value;
}

async function findAvailablePlan(tx: Tx, code: string): Promise<Plan> {
  const plan = await tx.plan.findFirst({ where: { code, isActive: true } });
  if (!plan) {
    throw new NotFoundException(ERR.planNotFound);
  }
  return plan;
}

function snapshotOf(plan: Plan) {
  return {
    planName: plan.name,
    priceMonthlyPaise: plan.priceMonthlyPaise,
    featureFlags: [...plan.featureFlags],
    maxMembers: plan.maxMembers,
    maxStaff: plan.maxStaff,
    maxBranches: plan.maxBranches,
  };
}

function isReportedStatus(value: string): value is ReportedSubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/**
 * A trialing or active row reports its Plan_Snapshot. A Plan_Request has no
 * snapshot yet, so it reports its Plan's current values.
 */
function toSubscriptionResponse(
  row: SubscriptionWithPlan,
  now: Date,
): SubscriptionResponse {
  const values =
    row.status === 'pending_payment'
      ? {
          planName: row.plan.name,
          priceMonthlyPaise: row.plan.priceMonthlyPaise,
          featureFlags: row.plan.featureFlags,
          maxMembers: row.plan.maxMembers,
          maxStaff: row.plan.maxStaff,
          maxBranches: row.plan.maxBranches,
        }
      : {
          planName: row.planName ?? '',
          priceMonthlyPaise: row.priceMonthlyPaise ?? 0,
          featureFlags: row.featureFlags,
          maxMembers: row.maxMembers,
          maxStaff: row.maxStaff,
          maxBranches: row.maxBranches,
        };
  return {
    id: row.id,
    status: reportedStatus(row, now),
    planCode: row.plan.code,
    planName: values.planName,
    priceMonthlyPaise: values.priceMonthlyPaise,
    currency: PLAN_CURRENCY,
    featureFlags: [...values.featureFlags],
    maxMembers: values.maxMembers,
    maxStaff: values.maxStaff,
    maxBranches: values.maxBranches,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    isTrial: row.status === 'trialing',
  };
}

function toAdminSubscriptionResponse(
  row: AdminSubscriptionRow,
  now: Date,
): AdminSubscriptionResponse {
  return {
    ...toSubscriptionResponse(row, now),
    gymId: row.gymId,
    gymName: row.gym.gymName,
    ownerEmail: row.gym.owner.email,
  };
}
