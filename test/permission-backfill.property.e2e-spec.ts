import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { PERMISSIONS } from '../src/common/constants/permissions.js';
import {
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

const PHASE_1 = [
  'view_dashboard',
  'manage_users',
  'manage_roles',
  'review_gyms',
  'create_gym',
  'manage_owner_profile',
  'manage_gym_setup',
] as const;

const PHASE_2 = [
  'view_plans',
  'manage_plans',
  'manage_subscriptions',
  'manage_gym_subscription',
] as const;

const DEFAULTS: Record<string, Record<(typeof PHASE_2)[number], boolean>> = {
  Super_Admin: {
    view_plans: false,
    manage_plans: true,
    manage_subscriptions: true,
    manage_gym_subscription: false,
  },
  Gym_Owner: {
    view_plans: true,
    manage_plans: false,
    manage_subscriptions: false,
    manage_gym_subscription: true,
  },
};

describe('permission backfill', () => {
  let platform: GymPlatform;

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  async function states(): Promise<Map<string, boolean>> {
    const rows = await platform.prisma.rolePermission.findMany({
      include: { role: true, permission: true },
    });
    return new Map(
      rows.map((row) => [`${row.role.name}:${row.permission.name}`, row.enabled]),
    );
  }

  it('Feature: plan-subscription-engine, Property 1: Permission defaults and backfill', async () => {
    const server = platform.app.getHttpServer();
    const admin = await adminToken(platform.app);
    let roleCounter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 }),
        fc.array(
          fc.record({
            role: fc.integer({ min: 0, max: 4 }),
            permission: fc.constantFrom(...PHASE_1),
            state: fc.constantFrom('enabled' as const, 'disabled' as const),
          }),
          { maxLength: 6 },
        ),
        async (newRoles, changes) => {
          for (let index = 0; index < newRoles; index += 1) {
            roleCounter += 1;
            await request(server)
              .post('/roles')
              .set('Authorization', `Bearer ${admin}`)
              .send({ name: `Custom_${roleCounter}` })
              .expect(201);
          }
          const roleNames = (await platform.prisma.role.findMany()).map(
            (role) => role.name,
          );
          for (const change of changes) {
            const roleName = roleNames[change.role % roleNames.length]!;
            const response = await request(server)
              .patch('/roles/permissions')
              .set('Authorization', `Bearer ${admin}`)
              .send({ roleName, permission: change.permission, state: change.state });
            expect([200, 400]).toContain(response.status);
          }

          // Simulate a database saved by Phase 1: no Phase 2 Permission rows.
          await platform.prisma.rolePermission.deleteMany({
            where: { permission: { name: { in: [...PHASE_2] } } },
          });
          await platform.prisma.permission.deleteMany({
            where: { name: { in: [...PHASE_2] } },
          });
          const before = await states();

          await platform.seed.seed();
          const after = await states();

          for (const [key, enabled] of before) {
            expect(after.get(key)).toBe(enabled);
          }
          for (const roleName of roleNames) {
            for (const permission of PHASE_2) {
              expect(after.get(`${roleName}:${permission}`)).toBe(
                DEFAULTS[roleName]?.[permission] ?? false,
              );
            }
          }
          expect(after.size).toBe(roleNames.length * PERMISSIONS.length);

          await platform.seed.seed();
          expect(await states()).toEqual(after);
        },
      ),
      { numRuns: 100 },
    );
  }, 180_000);
});
