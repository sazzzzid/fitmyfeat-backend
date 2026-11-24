// Reported statuses. `trialing`, `pending_payment`, `active`, and `failed`
// are stored. `expired` is computed on read from the period end.
export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'pending_payment',
  'active',
  'failed',
  'expired',
] as const;

export type ReportedSubscriptionStatus =
  (typeof SUBSCRIPTION_STATUSES)[number];
