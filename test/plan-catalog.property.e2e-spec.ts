import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

function byPriceThenCode(
  a: { code: string; priceMonthlyPaise: number },
  b: { code: string; priceMonthlyPaise: number },
): number {
  if (a.priceMonthlyPaise !== b.priceMonthlyPaise) {
    return a.priceMonthlyPaise - b.priceMonthlyPaise;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

describe('plan catalog', () => {
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

  it('Feature: plan-subscription-engine, Property 4: The owner catalog shows exactly the Available_Plans', async () => {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email: 'catalog@gym.test', password: 'owner-password' })
      .expect(201);
    const owner = await signIn(platform.app, 'catalog@gym.test', 'owner-password');
    const admin = await adminToken(platform.app);

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            code: fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/),
            priceMonthlyPaise: fc.constantFrom(0, 100, 49_900, 149_900),
            isActive: fc.boolean(),
          }),
          { selector: (plan) => plan.code, maxLength: 8 },
        ),
        async (plans) => {
          await platform.prisma.plan.deleteMany();
          await platform.prisma.plan.createMany({
            data: plans.map((plan) => ({
              ...plan,
              name: plan.code.toUpperCase(),
              trialDays: 0,
              featureFlags: [],
              maxMembers: null,
              maxStaff: null,
              maxBranches: null,
            })),
          });

          const available = await request(server)
            .get('/plans')
            .set('Authorization', `Bearer ${owner}`)
            .expect(200);
          const all = await request(server)
            .get('/plans/all')
            .set('Authorization', `Bearer ${admin}`)
            .expect(200);

          const expectedAll = [...plans].sort(byPriceThenCode);
          expect(
            all.body.plans.map((plan: { code: string; isActive: boolean }) => [
              plan.code,
              plan.isActive,
            ]),
          ).toEqual(expectedAll.map((plan) => [plan.code, plan.isActive]));
          expect(
            available.body.plans.map((plan: { code: string }) => plan.code),
          ).toEqual(
            expectedAll.filter((plan) => plan.isActive).map((plan) => plan.code),
          );
        },
      ),
      { numRuns: 100 },
    );
  }, 180_000);
});
