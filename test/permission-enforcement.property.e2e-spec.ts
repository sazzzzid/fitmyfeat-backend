import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { PERMISSIONS, type Permission } from '../src/common/constants/permissions.js';
import {
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

const routes: Record<Permission, { method: 'get' | 'post'; path: string }> = {
  view_dashboard: { method: 'get', path: '/dashboard' },
  manage_users: { method: 'get', path: '/users' },
  manage_roles: { method: 'get', path: '/roles' },
  review_gyms: { method: 'get', path: '/gyms/pending' },
  create_gym: { method: 'post', path: '/gyms' },
  manage_owner_profile: { method: 'get', path: '/owner-profile' },
  manage_gym_setup: { method: 'get', path: '/gyms/me' },
  view_plans: { method: 'get', path: '/plans' },
  manage_plans: { method: 'get', path: '/plans/all' },
  manage_subscriptions: { method: 'get', path: '/subscriptions' },
  manage_gym_subscription: { method: 'get', path: '/subscriptions/me' },
  manage_members: { method: 'get', path: '/members' },
  manage_staff: { method: 'get', path: '/staff' },
  manage_platform_finance: { method: 'get', path: '/platform-finance/report' },
  manage_gym_finance: { method: 'get', path: '/gym-finance/income' },
  manage_message_templates: { method: 'get', path: '/message-templates' },
  manage_communications: { method: 'get', path: '/gym-communications/messages' },
};

describe('permission enforcement', () => {
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

  it('Feature: gym-saas-foundation, Property 8: Permission reads use RolePermission after the token is issued', async () => {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email: 'member@gym.test', password: 'member-password' })
      .expect(201);
    const ownerToken = await signIn(
      platform.app,
      'member@gym.test',
      'member-password',
    );
    const admin = await adminToken(platform.app);
    const usersBefore = await platform.prisma.userAccount.count();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...PERMISSIONS),
        fc.constantFrom('enabled' as const, 'disabled' as const),
        async (permission, state) => {
          await request(server)
            .patch('/roles/permissions')
            .set('Authorization', `Bearer ${admin}`)
            .send({ roleName: 'Gym_Owner', permission, state })
            .expect(200);
          const row = await platform.prisma.rolePermission.findFirstOrThrow({
            where: {
              role: { name: 'Gym_Owner' },
              permission: { name: permission },
            },
          });
          expect(row.enabled).toBe(state === 'enabled');
          const route = routes[permission];
          const response = await request(server)
            [route.method](route.path)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({});
          if (!row.enabled) {
            expect(response.status).toBe(403);
            expect(response.body.message).toBe('Permission is disabled');
          } else {
            expect(response.status).not.toBe(403);
          }
          expect(response.status).not.toBe(401);
          const open = await request(server).get('/dashboard');
          expect(open.status).toBe(401);
          expect(open.body).toEqual({
            statusCode: 401,
            message: 'Authenticated_Session is required',
          });
          expect(await platform.prisma.userAccount.count()).toBe(usersBefore);
        },
      ),
      { numRuns: 100 },
    );
  }, 180_000);
});
