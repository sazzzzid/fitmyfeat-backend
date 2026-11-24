export const GYM_STATUSES = ['setup_in_progress', 'pending', 'active'] as const;

export type GymStatus = (typeof GYM_STATUSES)[number];
