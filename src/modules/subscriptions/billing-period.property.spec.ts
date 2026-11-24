import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeStore,
  fakeFinanceService,
  fakeGymsService,
  fakeSubscriptionPrisma,
  makeGym,
  makePlan,
} from '../../../test/helpers/fake-subscription-prisma.js';
import { addOneMonthUtc } from './billing-period.js';
import { SubscriptionsService } from './subscriptions.service.js';

const MIN = Date.UTC(2000, 0, 1);
const MAX = Date.UTC(2100, 0, 1);

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

describe('Billing_Period properties', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Feature: plan-subscription-engine, Property 9: Billing_Period arithmetic', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN, max: MAX }), (ms) => {
        const from = new Date(ms);
        const next = addOneMonthUtc(from);
        const targetMonth = (from.getUTCMonth() + 1) % 12;
        const targetYear =
          from.getUTCFullYear() + (from.getUTCMonth() === 11 ? 1 : 0);

        expect(next.getTime()).toBeGreaterThan(from.getTime());
        expect(next.getUTCFullYear()).toBe(targetYear);
        expect(next.getUTCMonth()).toBe(targetMonth);
        expect(next.getUTCDate()).toBe(
          Math.min(from.getUTCDate(), daysInMonth(targetYear, targetMonth)),
        );
        expect(next.getUTCHours()).toBe(from.getUTCHours());
        expect(next.getUTCMinutes()).toBe(from.getUTCMinutes());
        expect(next.getUTCSeconds()).toBe(from.getUTCSeconds());
        expect(next.getUTCMilliseconds()).toBe(from.getUTCMilliseconds());
      }),
      { numRuns: 1000 },
    );
  });

  it('Feature: plan-subscription-engine, Property 9: Renewal adds one Billing_Period from the end or from now', async () => {
    const base = Date.UTC(2026, 10, 22);
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: base - 400 * 86_400_000, max: base + 400 * 86_400_000 }),
        fc.integer({ min: 1, max: 60 * 86_400_000 }),
        async (endMs, lengthMs) => {
          vi.useFakeTimers({ toFake: ['Date'] });
          const now = new Date(base);
          vi.setSystemTime(now);
          const store = createFakeStore();
          const gym = makeGym();
          const plan = makePlan();
          store.gyms.push(gym);
          store.plans.push(plan);
          const end = new Date(endMs);
          const start = new Date(endMs - lengthMs);
          store.subscriptions.push({
            id: crypto.randomUUID(),
            gymId: gym.id,
            planId: plan.id,
            status: 'active',
            planName: plan.name,
            priceMonthlyPaise: plan.priceMonthlyPaise,
            featureFlags: [...plan.featureFlags],
            maxMembers: plan.maxMembers,
            maxStaff: plan.maxStaff,
            maxBranches: plan.maxBranches,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            startedAt: start,
            expiredAt: end,
            createdAt: start,
          });
          const prisma = fakeSubscriptionPrisma(store);
          const service = new SubscriptionsService(
            prisma,
            fakeGymsService(store),
            fakeFinanceService(prisma),
          );
          const [stored] = store.subscriptions;

          const renewed = await service.markPaid(stored!.id);

          if (endMs > now.getTime()) {
            expect(renewed.currentPeriodStart).toBe(start.toISOString());
            expect(renewed.currentPeriodEnd).toBe(
              addOneMonthUtc(end).toISOString(),
            );
          } else {
            expect(renewed.currentPeriodStart).toBe(now.toISOString());
            expect(renewed.currentPeriodEnd).toBe(
              addOneMonthUtc(now).toISOString(),
            );
          }
          vi.useRealTimers();
        },
      ),
      { numRuns: 200 },
    );
  });
});
