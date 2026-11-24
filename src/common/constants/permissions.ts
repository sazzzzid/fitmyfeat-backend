export const PERMISSIONS = [
  'view_dashboard',
  'manage_users',
  'manage_roles',
  'review_gyms',
  'create_gym',
  'manage_owner_profile',
  'manage_gym_setup',
  'view_plans',
  'manage_plans',
  'manage_subscriptions',
  'manage_gym_subscription',
  'manage_members',
  'manage_staff',
  'manage_platform_finance',
  'manage_gym_finance',
  'manage_message_templates',
  'manage_communications',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
