import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeStore,
  fakeFinanceService,
  fakeGymsService,
  fakeSubscriptionPrisma,
  makeGym,
  makePlan,
} from '../../../test/helpers/fake-subscription-prisma.js';
import { SubscriptionsService } from './subscriptions.service.js';

const DAY = 86_400_000;
const START = new Date('2026-11-22T10:00:00.000Z');

const limit = fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null });
const planValues = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((v) => /\S/.test(v)),
  priceMonthlyPaise: fc.integer({ min: 0, max: 10_000_000 }),
  featureFlags: fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/), {
    maxLength: 5,
  }),
  maxMembers: limit,
  maxStaff: limit,
  maxBranches: limit,
});

describe('Plan_Snapshot properties', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Feature: plan-subscription-engine, Property 8: Plan_Snapshot isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        planValues,
        planValues,
        fc.constantFrom('trial' as const, 'paid' as const),
        fc.integer({ min: 1, max: 25 }),
        async (a, b, start, elapsedDays) => {
          vi.setSystemTime(START);
          const store = createFakeStore();
          const gym = makeGym();
          const plan = makePlan({ ...a, code: 'pro', trialDays: 30 });
          store.gyms.push(gym);
          store.plans.push(plan);
          const prisma = fakeSubscriptionPrisma(store);
          const service = new SubscriptionsService(
            prisma,
            fakeGymsService(store),
            fakeFinanceService(prisma),
          );

          let id: string;
          if (start === 'trial') {
            id = (await service.startTrial(gym.ownerId, 'pro')).id;
          } else {
            id = (await service.requestPlan(gym.ownerId, 'pro')).id;
            await service.markPaid(id);
          }

          Object.assign(plan, b);
          vi.setSystemTime(new Date(START.getTime() + elapsedDays * DAY));

          const mine = await service.getMine(gym.ownerId);
          const entitlements = await service.getEntitlements(gym.ownerId);
          expect(mine.current).toMatchObject({
            id,
            planName: a.name,
            priceMonthlyPaise: a.priceMonthlyPaise,
            featureFlags: a.featureFlags,
            maxMembers: a.maxMembers,
            maxStaff: a.maxStaff,
            maxBranches: a.maxBranches,
          });
          expect(entitlements).toMatchObject({
            plan: { code: 'pro', name: a.name },
            featureFlags: a.featureFlags,
            maxMembers: a.maxMembers,
            maxStaff: a.maxStaff,
            maxBranches: a.maxBranches,
          });

          if (start === 'paid') {
            await service.markPaid(id);
            const renewed = await service.getEntitlements(gym.ownerId);
            expect(renewed).toMatchObject({
              plan: { code: 'pro', name: b.name },
              featureFlags: b.featureFlags,
              maxMembers: b.maxMembers,
              maxStaff: b.maxStaff,
              maxBranches: b.maxBranches,
            });
            const renewedMine = await service.getMine(gym.ownerId);
            expect(renewedMine.current?.priceMonthlyPaise).toBe(
              b.priceMonthlyPaise,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
