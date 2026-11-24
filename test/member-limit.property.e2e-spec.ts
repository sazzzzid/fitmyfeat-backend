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

describe('member seat limit', () => {
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

  it('Feature: core-gym-management, Property 1: Seat limit blocks creates only', async () => {
    const server = platform.app.getHttpServer();
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    let counter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.integer({ min: 0, max: 5 }), { nil: null }),
        fc.integer({ min: 0, max: 5 }),
        async (maxMembers, existing) => {
          counter += 1;
          const owner = await activeGymOwner(platform, `limit-${counter}@gym.test`);
          const end = new Date(Date.now() + 30 * 86_400_000);
          await platform.prisma.subscription.create({
            data: {
              gymId: owner.gymId,
              planId: plan.id,
              status: 'active',
              planName: 'Pro',
              priceMonthlyPaise: 100,
              featureFlags: [],
              maxMembers,
              maxStaff: null,
              maxBranches: null,
              currentPeriodStart: new Date(),
              currentPeriodEnd: end,
            },
          });
          const auth = { Authorization: `Bearer ${owner.token}` };
          for (let index = 0; index < existing; index += 1) {
            const response = await request(server)
              .post('/members')
              .set(auth)
              .send({ fullName: `Member ${index}`, contact: `c${index}` });
            if (maxMembers !== null && index >= maxMembers) {
              expect(response.status).toBe(409);
            } else {
              expect(response.status).toBe(201);
            }
          }
          const count = await platform.prisma.member.count({ where: { gymId: owner.gymId } });
          expect(count).toBe(maxMembers === null ? existing : Math.min(existing, maxMembers));

          if (maxMembers !== null && count === maxMembers) {
            const [first, second] = await Promise.all([
              request(server).post('/members').set(auth).send({ fullName: 'One', contact: '1' }),
              request(server).post('/members').set(auth).send({ fullName: 'Two', contact: '2' }),
            ]);
            expect(first.status).toBe(409);
            expect(second.status).toBe(409);
            expect(await platform.prisma.member.count({ where: { gymId: owner.gymId } })).toBe(maxMembers);
          }

          if (count > 0) {
            const member = await platform.prisma.member.findFirstOrThrow({
              where: { gymId: owner.gymId },
            });
            await request(server)
              .patch(`/members/${member.id}`)
              .set(auth)
              .send({ contact: 'updated' })
              .expect(200);
          }
        },
      ),
      { numRuns: 20 },
    );
  }, 180_000);
});
