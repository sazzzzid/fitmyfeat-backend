import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  activeGymOwner,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('staff seat limit', () => {
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

  it('Feature: staff-permissions, Property 1: Seat limit blocks creates and enables only', async () => {
    const server = platform.app.getHttpServer();
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    let counter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
        fc.integer({ min: 0, max: 5 }),
        async (maxStaff, existing) => {
          counter += 1;
          const owner = await activeGymOwner(platform, `staff-limit-${counter}@gym.test`);
          const end = new Date(Date.now() + 30 * 86_400_000);
          await platform.prisma.subscription.create({
            data: {
              gymId: owner.gymId,
              planId: plan.id,
              status: 'active',
              planName: 'Pro',
              priceMonthlyPaise: 100,
              featureFlags: [],
              maxMembers: null,
              maxStaff,
              maxBranches: null,
              currentPeriodStart: new Date(),
              currentPeriodEnd: end,
            },
          });
          const auth = { Authorization: `Bearer ${owner.token}` };
          for (let index = 0; index < existing; index += 1) {
            const response = await request(server)
              .post('/staff')
              .set(auth)
              .send(staffBody(`s-${counter}-${index}@gym.test`));
            if (maxStaff !== null && index >= maxStaff) {
              expect(response.status).toBe(409);
            } else {
              expect(response.status).toBe(201);
            }
          }
          const activeCount = () =>
            platform.prisma.staffMember.count({
              where: { gymId: owner.gymId, disabledAt: null },
            });
          expect(await activeCount()).toBe(
            maxStaff === null ? existing : Math.min(existing, maxStaff),
          );

          const count = await activeCount();
          if (maxStaff !== null && count < maxStaff) {
            const room = maxStaff - count;
            const [first, second] = await Promise.all([
              request(server).post('/staff').set(auth).send(staffBody(`a-${counter}@gym.test`)),
              request(server).post('/staff').set(auth).send(staffBody(`b-${counter}@gym.test`)),
            ]);
            const successes = [first, second].filter((response) => response.status === 201);
            expect(successes).toHaveLength(Math.min(2, room));
            expect(await activeCount()).toBe(count + successes.length);
          }
          if (maxStaff !== null && (await activeCount()) >= maxStaff) {
            const [first, second] = await Promise.all([
              request(server).post('/staff').set(auth).send(staffBody(`c-${counter}@gym.test`)),
              request(server).post('/staff').set(auth).send(staffBody(`d-${counter}@gym.test`)),
            ]);
            expect(first.status).toBe(409);
            expect(second.status).toBe(409);
          }

          const stored = await platform.prisma.staffMember.findFirst({
            where: { gymId: owner.gymId },
          });
          if (stored) {
            await platform.prisma.subscription.updateMany({
              where: { gymId: owner.gymId, status: 'active' },
              data: { maxStaff: 0 },
            });
            await request(server)
              .patch(`/staff/${stored.id}`)
              .set(auth)
              .send({ fullName: 'Updated Name' })
              .expect(200);
            if (!stored.disabledAt) {
              await request(server).post(`/staff/${stored.id}/disable`).set(auth).expect(200);
              await request(server)
                .post(`/staff/${stored.id}/enable`)
                .set(auth)
                .expect(409);
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  }, 180_000);
});

function staffBody(email: string) {
  return {
    email,
    password: 'staff-password',
    fullName: 'Ria Sen',
    title: 'trainer',
    template: 'Staff',
  };
}
