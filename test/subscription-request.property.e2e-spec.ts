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

const CODES = ['basic', 'pro', 'enterprise'] as const;

describe('plan requests', () => {
  let platform: GymPlatform;

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    await platform.prisma.plan.updateMany({ data: { isActive: true } });
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('Feature: plan-subscription-engine, Property 6: One Plan_Request per Gym', async () => {
    const server = platform.app.getHttpServer();
    const planIds = new Map(
      (await platform.prisma.plan.findMany()).map((plan) => [plan.code, plan.id]),
    );
    let counter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...CODES), { minLength: 1, maxLength: 4 }),
        fc.array(fc.constantFrom(...CODES), { minLength: 2, maxLength: 4 }),
        async (sequence, batch) => {
          counter += 1;
          const { token, gymId } = await activeGymOwner(
            platform,
            `request-${counter}@gym.test`,
          );
          const auth = { Authorization: `Bearer ${token}` };
          const pendingRows = () =>
            platform.prisma.subscription.findMany({
              where: { gymId, status: 'pending_payment' },
            });

          for (const planCode of sequence) {
            await request(server)
              .post('/subscriptions/me/plan-request')
              .set(auth)
              .send({ planCode })
              .expect(201);
            const rows = await pendingRows();
            expect(rows).toHaveLength(1);
            expect(rows[0]?.planId).toBe(planIds.get(planCode));
          }

          const responses = await Promise.all(
            batch.map((planCode) =>
              request(server)
                .post('/subscriptions/me/plan-request')
                .set(auth)
                .send({ planCode }),
            ),
          );
          for (const response of responses) {
            expect(response.status).toBe(201);
          }
          const rows = await pendingRows();
          expect(rows).toHaveLength(1);
          expect(batch.map((code) => planIds.get(code))).toContain(rows[0]?.planId);
          expect(await platform.prisma.subscription.count({ where: { gymId } })).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  }, 600_000);
});
