const DAY_MS = 86_400_000;

export interface RenderInput {
  memberName: string;
  gymName: string;
  endDate: string;
  unpaidAmount: string;
}

export function renderBody(template: string, input: RenderInput): string {
  return template
    .replaceAll('{{memberName}}', input.memberName)
    .replaceAll('{{gymName}}', input.gymName)
    .replaceAll('{{endDate}}', input.endDate)
    .replaceAll('{{unpaidAmount}}', input.unpaidAmount);
}

export function formatRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  return `${sign}${rupees}.${cents}`;
}

export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isExpiryDue(
  membership: { status: string; frozenAt: Date | null; currentPeriodEnd: Date } | null,
  now: Date,
): boolean {
  if (!membership || membership.status !== 'active' || membership.frozenAt) {
    return false;
  }
  const end = membership.currentPeriodEnd.getTime();
  return end > now.getTime() && end <= now.getTime() + 7 * DAY_MS;
}

export function isInactiveDue(
  createdAt: Date,
  membership: { status: string; frozenAt: Date | null; currentPeriodEnd: Date } | null,
  now: Date,
): boolean {
  if (membership?.status === 'frozen' || membership?.frozenAt) {
    return false;
  }
  const cutoff = now.getTime() - 14 * DAY_MS;
  if (!membership) {
    return createdAt.getTime() <= cutoff;
  }
  return membership.currentPeriodEnd.getTime() <= cutoff;
}
