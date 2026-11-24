export const ROLE_NAMES = {
  superAdmin: 'Super_Admin',
  gymOwner: 'Gym_Owner',
  gymStaff: 'Gym_Staff',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];
