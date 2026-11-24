import type { Prisma, Subscription } from '@prisma/client';
import type { ReportedSubscriptionStatus } from '../../common/constants/subscription-status.js';

type PeriodRow = Pick<
  Subscription,
  'id' | 'status' | 'currentPeriodEnd' | 'createdAt'
>;

export type SubscriptionWithPlanCode = Subscription & {
  plan: { code: string };
};

export interface Entitlements {
  plan: { code: string; name: string } | null;
  status: 'trialing' | 'active' | null;
  featureFlags: string[];
  maxMembers: number | null;
  maxStaff: number | null;
  maxBranches: number | null;
  currentPeriodEnd: string | null;
}

/** A trialing or active row whose period ends after `now`. */
export function isInEffect(
  row: Pick<Subscription, 'status' | 'currentPeriodEnd'>,
  now: Date,
): boolean {
  return (
    (row.status === 'trialing' || row.status === 'active') &&
    row.currentPeriodEnd !== null &&
    row.currentPeriodEnd.getTime() > now.getTime()
  );
}

export function reportedStatus(
  row: Pick<Subscription, 'status' | 'currentPeriodEnd'>,
  now: Date,
): ReportedSubscriptionStatus {
  if (row.status === 'pending_payment') {
    return 'pending_payment';
  }
  if (row.status === 'failed') {
    return 'failed';
  }
  return isInEffect(row, now) ? row.status : 'expired';
}

/**
 * The Current_Subscription: the trialing or active row with the latest
 * period end. Ties cannot happen through the API; they are broken by the
 * later createdAt and then the larger id so the choice is still stable.
 */
export function pickCurrent<T extends PeriodRow>(rows: readonly T[]): T | null {
  let current: T | null = null;
  for (const row of rows) {
    if (
      row.status === 'pending_payment' ||
      row.status === 'failed' ||
      row.currentPeriodEnd === null
    ) {
      continue;
    }
    if (current === null || isLater(row, current)) {
      current = row;
    }
  }
  return current;
}

export function whereReportedStatus(
  status: ReportedSubscriptionStatus,
  now: Date,
): Prisma.SubscriptionWhereInput {
  switch (status) {
    case 'pending_payment':
      return { status: 'pending_payment' };
    case 'trialing':
      return { status: 'trialing', currentPeriodEnd: { gt: now } };
    case 'active':
      return { status: 'active', currentPeriodEnd: { gt: now } };
    case 'expired':
      return {
        status: { in: ['trialing', 'active'] },
        currentPeriodEnd: { lte: now },
      };
    case 'failed':
      return { status: 'failed' };
  }
}

export function emptyEntitlements(): Entitlements {
  return {
    plan: null,
    status: null,
    featureFlags: [],
    maxMembers: 0,
    maxStaff: 0,
    maxBranches: 0,
    currentPeriodEnd: null,
  };
}

/**
 * Entitlements come only from the Plan_Snapshot of the row In_Effect, never
 * from the Plan's current values.
 */
export function entitlementsFrom(
  rows: readonly SubscriptionWithPlanCode[],
  now: Date,
): Entitlements {
  const inEffect = pickCurrent(rows.filter((row) => isInEffect(row, now)));
  if (
    inEffect === null ||
    inEffect.status === 'pending_payment' ||
    inEffect.status === 'failed' ||
    inEffect.currentPeriodEnd === null
  ) {
    return emptyEntitlements();
  }
  return {
    plan: { code: inEffect.plan.code, name: inEffect.planName ?? '' },
    status: inEffect.status,
    featureFlags: [...inEffect.featureFlags],
    maxMembers: inEffect.maxMembers,
    maxStaff: inEffect.maxStaff,
    maxBranches: inEffect.maxBranches,
    currentPeriodEnd: inEffect.currentPeriodEnd.toISOString(),
  };
}

function isLater(row: PeriodRow, current: PeriodRow): boolean {
  const byEnd =
    (row.currentPeriodEnd?.getTime() ?? 0) -
    (current.currentPeriodEnd?.getTime() ?? 0);
  if (byEnd !== 0) {
    return byEnd > 0;
  }
  const byCreated = row.createdAt.getTime() - current.createdAt.getTime();
  if (byCreated !== 0) {
    return byCreated > 0;
  }
  return row.id > current.id;
}
