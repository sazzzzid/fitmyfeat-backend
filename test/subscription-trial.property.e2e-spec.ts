import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  activeGymOwner,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  shiftGymPeriods,
  type GymPlatform,
} from './helpers/gym-platform.js';

const DAY = 86_400_000;

describe('subscription trials', () => {
  let platform: GymPlatform;

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    await platform.prisma.plan.updateMany({
      where: { code: { in: ['pro', 'enterprise'] } },
      data: { isActive: true, trialDays: 7 },
    });
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('Feature: plan-subscription-engine, Property 5: One trial per Gym', async () => {
    const server = platform.app.getHttpServer();
    let counter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }),
        fc.integer({ min: 2, max: 5 }),
        async (trialDays, attempts) => {
          counter += 1;
          await platform.prisma.plan.update({
            where: { code: 'pro' },
            data: { trialDays },
          });
          const { token, gymId } = await activeGymOwner(
            platform,
            `trial-${counter}@gym.test`,
          );
          const auth = { Authorization: `Bearer ${token}` };

          const responses = await Promise.all(
            Array.from({ length: attempts }, () =>
              request(server)
                .post('/subscriptions/me/trial')
                .set(auth)
                .send({ planCode: 'pro' }),
            ),
          );
          expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
          for (const response of responses.filter((r) => r.status !== 201)) {
            expect(response.status).toBe(409);
            expect(response.body.message).toBe('Trial already used');
          }
          expect(
            await platform.prisma.subscription.count({
              where: { gymId, status: 'trialing' },
            }),
          ).toBe(1);

          await shiftGymPeriods(platform, gymId, (trialDays + 1) * DAY);
          for (const planCode of ['pro', 'enterprise']) {
            const later = await request(server)
              .post('/subscriptions/me/trial')
              .set(auth)
              .send({ planCode });
            expect(later.status).toBe(409);
            expect(later.body.message).toBe('Trial already used');
          }
          expect(await platform.prisma.subscription.count({ where: { gymId } })).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  }, 600_000);
});
