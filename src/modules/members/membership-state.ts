const DAY_MS = 86_400_000;

export type StoredMembershipState = 'active' | 'frozen';
export type ReportedMembershipStatus = 'active' | 'frozen' | 'expired';

export interface MembershipClock {
  status: StoredMembershipState;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  frozenAt: Date | null;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

export function isInEffect(row: MembershipClock, now: Date): boolean {
  return row.status === 'active' && row.currentPeriodEnd.getTime() > now.getTime();
}

export function reportedStatus(
  row: MembershipClock,
  now: Date,
): ReportedMembershipStatus {
  if (row.status === 'frozen') {
    return 'frozen';
  }
  return isInEffect(row, now) ? 'active' : 'expired';
}

export function unfreezeEnd(row: MembershipClock, now: Date): Date {
  const frozenFor = now.getTime() - (row.frozenAt?.getTime() ?? now.getTime());
  return new Date(row.currentPeriodEnd.getTime() + frozenFor);
}

const SEVEN_DAYS_MS = 7 * DAY_MS;

export function matchesMemberFilter(
  leftAt: Date | null,
  membership: MembershipClock | null,
  status: 'active' | 'expiring' | 'expired' | 'frozen' | 'none' | 'left' | undefined,
  now: Date,
): boolean {
  const left = leftAt !== null;
  if (status === 'left') {
    return left;
  }
  if (left) {
    return false;
  }
  if (status === undefined) {
    return true;
  }
  if (status === 'none') {
    return membership === null;
  }
  if (membership === null) {
    return false;
  }
  const inEffect = isInEffect(membership, now);
  if (status === 'frozen') {
    return membership.status === 'frozen';
  }
  if (status === 'expired') {
    return membership.status === 'active' && !inEffect;
  }
  if (status === 'active') {
    return inEffect;
  }
  const horizon = now.getTime() + SEVEN_DAYS_MS;
  return inEffect && membership.currentPeriodEnd.getTime() <= horizon;
}
