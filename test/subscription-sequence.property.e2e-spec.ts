import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  activeGymOwner,
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  shiftGymPeriods,
  type GymPlatform,
} from './helpers/gym-platform.js';

const DAY = 86_400_000;
const CODES = ['basic', 'pro', 'enterprise'] as const;

type Operation =
  | { kind: 'trial'; planCode: (typeof CODES)[number] }
  | { kind: 'request'; planCode: (typeof CODES)[number] }
  | { kind: 'markPaid'; pick: number }
  | { kind: 'elapse'; days: number };

const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({ kind: fc.constant('trial' as const), planCode: fc.constantFrom(...CODES) }),
  fc.record({ kind: fc.constant('request' as const), planCode: fc.constantFrom(...CODES) }),
  fc.record({ kind: fc.constant('markPaid' as const), pick: fc.nat({ max: 10 }) }),
  fc.record({ kind: fc.constant('elapse' as const), days: fc.integer({ min: 1, max: 45 }) }),
);

describe('subscription operation sequences', () => {
  let platform: GymPlatform;

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    await platform.prisma.plan.update({
      where: { code: 'basic' },
      data: { isActive: true, trialDays: 0, priceMonthlyPaise: 49_900 },
    });
    await platform.prisma.plan.update({
      where: { code: 'pro' },
      data: { isActive: true, trialDays: 14, priceMonthlyPaise: 149_900 },
    });
    await platform.prisma.plan.update({
      where: { code: 'enterprise' },
      data: { isActive: true, trialDays: 30, priceMonthlyPaise: 499_900 },
    });
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('Feature: plan-subscription-engine, Property 7: Operation sequences keep one Subscription In_Effect and leave Phase 1 data alone', async () => {
    const server = platform.app.getHttpServer();
    const admin = await adminToken(platform.app);
    const adminAuth = { Authorization: `Bearer ${admin}` };
    let counter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.array(operation, { minLength: 1, maxLength: 8 }),
        async (operations) => {
          counter += 1;
          const { token, gymId } = await activeGymOwner(
            platform,
            `sequence-${counter}@gym.test`,
          );
          const auth = { Authorization: `Bearer ${token}` };
          const gyms = await platform.prisma.gym.findMany({ orderBy: { id: 'asc' } });
          const users = await platform.prisma.userAccount.findMany({
            orderBy: { id: 'asc' },
          });
          const profiles = await platform.prisma.ownerProfile.findMany({
            orderBy: { id: 'asc' },
          });
          const dashboard = (
            await request(server).get('/dashboard').set(adminAuth).expect(200)
          ).body;

          for (const step of operations) {
            let status = 200;
            if (step.kind === 'trial' || step.kind === 'request') {
              const path =
                step.kind === 'trial'
                  ? '/subscriptions/me/trial'
                  : '/subscriptions/me/plan-request';
              status = (
                await request(server)
                  .post(path)
                  .set(auth)
                  .send({ planCode: step.planCode })
              ).status;
            } else if (step.kind === 'markPaid') {
              const ids = (
                await platform.prisma.subscription.findMany({
                  where: { gymId },
                  orderBy: { createdAt: 'asc' },
                })
              ).map((row) => row.id);
              if (ids.length > 0) {
                status = (
                  await request(server)
                    .post(`/subscriptions/${ids[step.pick % ids.length]}/mark-paid`)
                    .set(adminAuth)
                ).status;
              }
            } else {
              await shiftGymPeriods(platform, gymId, step.days * DAY);
            }
            expect(status).toBeLessThan(500);

            const inEffect = await platform.prisma.subscription.count({
              where: {
                gymId,
                status: { in: ['trialing', 'active'] },
                currentPeriodEnd: { gt: new Date() },
              },
            });
            expect(inEffect).toBeLessThanOrEqual(1);
          }

          expect(
            await platform.prisma.gym.findMany({ orderBy: { id: 'asc' } }),
          ).toEqual(gyms);
          expect(
            await platform.prisma.userAccount.findMany({ orderBy: { id: 'asc' } }),
          ).toEqual(users);
          expect(
            await platform.prisma.ownerProfile.findMany({ orderBy: { id: 'asc' } }),
          ).toEqual(profiles);
          expect(
            (await request(server).get('/dashboard').set(adminAuth).expect(200)).body,
          ).toEqual(dashboard);
        },
      ),
      { numRuns: 50 },
    );
  }, 900_000);
});
