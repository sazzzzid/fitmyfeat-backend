const DAY_MS = 86_400_000;

/**
 * One Billing_Period: the same UTC time of day in the next calendar month.
 * When the start day does not exist in that month, the result is the last
 * day of that month (Jan 31 -> Feb 28 or Feb 29).
 */
export function addOneMonthUtc(from: Date): Date {
  const nextMonthIndex = from.getUTCMonth() + 1;
  const year = from.getUTCFullYear() + Math.floor(nextMonthIndex / 12);
  const month = nextMonthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

export function addTrialDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
