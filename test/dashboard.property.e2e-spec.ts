import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import fc from 'fast-check';
import request from 'supertest';
import {
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('dashboard counts', () => {
  let platform: GymPlatform;
  let sequence = 0;
  let sharedHash = '';

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
    sharedHash = await bcrypt.hash('shared-password', 12);
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    sequence = 0;
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('Feature: gym-saas-foundation, Property 10: Dashboard is four stored counts', async () => {
    const server = platform.app.getHttpServer();
    const admin = await adminToken(platform.app);
    const ownerRole = await platform.prisma.role.findUniqueOrThrow({
      where: { name: 'Gym_Owner' },
    });
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.array(
          fc.constantFrom('setup_in_progress', 'pending', 'active'),
          { minLength: 0, maxLength: 4 },
        ),
        async (extraUsers, statuses) => {
          const createdUsers = extraUsers + statuses.length;
          for (let index = 0; index < createdUsers; index += 1) {
            sequence += 1;
            const email = `dash${sequence}@gym.test`;
            const user = await platform.prisma.userAccount.create({
              data: {
                email,
                emailKey: email,
                passwordHash: sharedHash,
                roleId: ownerRole.id,
              },
            });
            const status = statuses[index];
            if (status) {
              await platform.prisma.gym.create({
                data: { ownerId: user.id, status },
              });
            }
          }
          const response = await request(server)
            .get('/dashboard')
            .set('Authorization', `Bearer ${admin}`)
            .expect(200);
          const [userCount, setupInProgressCount, pendingCount, activeCount] =
            await Promise.all([
              platform.prisma.userAccount.count(),
              platform.prisma.gym.count({ where: { status: 'setup_in_progress' } }),
              platform.prisma.gym.count({ where: { status: 'pending' } }),
              platform.prisma.gym.count({ where: { status: 'active' } }),
            ]);
          expect(response.body).toEqual({
            userCount,
            setupInProgressCount,
            pendingCount,
            activeCount,
          });
          expect(Object.keys(response.body)).toEqual([
            'userCount',
            'setupInProgressCount',
            'pendingCount',
            'activeCount',
          ]);
        },
      ),
      { numRuns: 100 },
    );
  }, 180_000);
});
