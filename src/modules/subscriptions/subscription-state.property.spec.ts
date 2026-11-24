import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  entitlementsFrom,
  isInEffect,
  pickCurrent,
  reportedStatus,
  type SubscriptionWithPlanCode,
} from './subscription-state.js';

const NOW_MIN = Date.UTC(2026, 0, 1);
const NOW_MAX = Date.UTC(2030, 0, 1);
const DAY = 86_400_000;

const limit = fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null });

function rowArbitrary(index: number): fc.Arbitrary<SubscriptionWithPlanCode> {
  return fc
    .record({
      status: fc.constantFrom(
        'trialing' as const,
        'pending_payment' as const,
        'active' as const,
      ),
      start: fc.integer({ min: NOW_MIN - 400 * DAY, max: NOW_MAX }),
      length: fc.integer({ min: 0, max: 400 * DAY }),
      created: fc.integer({ min: NOW_MIN - 400 * DAY, max: NOW_MAX }),
      planName: fc.string({ minLength: 1, maxLength: 20 }),
      price: fc.integer({ min: 0, max: 1_000_000 }),
      flags: fc.uniqueArray(fc.constantFrom('attendance', 'diet', 'reports'), {
        maxLength: 3,
      }),
      maxMembers: limit,
      maxStaff: limit,
      maxBranches: limit,
      code: fc.constantFrom('basic', 'pro', 'enterprise'),
    })
    .map((value) => {
      const pending = value.status === 'pending_payment';
      return {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        gymId: 'gym',
        planId: `plan-${value.code}`,
        status: value.status,
        planName: pending ? null : value.planName,
        priceMonthlyPaise: pending ? null : value.price,
        featureFlags: pending ? [] : value.flags,
        maxMembers: pending ? null : value.maxMembers,
        maxStaff: pending ? null : value.maxStaff,
        maxBranches: pending ? null : value.maxBranches,
        currentPeriodStart: pending ? null : new Date(value.start),
        currentPeriodEnd: pending ? null : new Date(value.start + value.length),
        startedAt: pending ? null : new Date(value.start),
        expiredAt: pending ? null : new Date(value.start + value.length),
        createdAt: new Date(value.created),
        plan: { code: value.code },
      };
    });
}

const rowsArbitrary = fc
  .integer({ min: 0, max: 6 })
  .chain((count) =>
    fc.tuple(...Array.from({ length: count }, (_, index) => rowArbitrary(index))),
  );

describe('subscription state properties', () => {
  it('Feature: plan-subscription-engine, Property 10: Reported status and Entitlements follow the stored period', () => {
    fc.assert(
      fc.property(
        rowsArbitrary,
        fc.integer({ min: NOW_MIN, max: NOW_MAX }),
        (rows, nowMs) => {
          const now = new Date(nowMs);

          for (const row of rows) {
            const status = reportedStatus(row, now);
            if (row.status === 'pending_payment') {
              expect(status).toBe('pending_payment');
            } else if (row.currentPeriodEnd!.getTime() > nowMs) {
              expect(status).toBe(row.status);
            } else {
              expect(status).toBe('expired');
            }
          }

          const periodRows = rows.filter(
            (row) => row.status !== 'pending_payment',
          );
          const current = pickCurrent(rows);
          if (periodRows.length === 0) {
            expect(current).toBeNull();
          } else {
            const latestEnd = Math.max(
              ...periodRows.map((row) => row.currentPeriodEnd!.getTime()),
            );
            expect(current?.currentPeriodEnd?.getTime()).toBe(latestEnd);
          }

          const inEffect = rows.filter((row) => isInEffect(row, now));
          const entitlements = entitlementsFrom(rows, now);
          if (inEffect.length === 0) {
            expect(entitlements).toEqual({
              plan: null,
              status: null,
              featureFlags: [],
              maxMembers: 0,
              maxStaff: 0,
              maxBranches: 0,
              currentPeriodEnd: null,
            });
          } else {
            const source = pickCurrent(inEffect)!;
            expect(entitlements).toEqual({
              plan: { code: source.plan.code, name: source.planName },
              status: source.status,
              featureFlags: source.featureFlags,
              maxMembers: source.maxMembers,
              maxStaff: source.maxStaff,
              maxBranches: source.maxBranches,
              currentPeriodEnd: source.currentPeriodEnd!.toISOString(),
            });
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
