import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, reportedStatus, unfreezeEnd, type MembershipClock } from './membership-state.js';

const DAY = 86_400_000;

describe('membership properties', () => {
  it('Feature: core-gym-management, Property 2: One Membership, and renew follows the period', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3650 }),
        fc.integer({ min: -40, max: 400 }),
        (durationDays, endOffset) => {
          const now = new Date('2026-11-22T10:00:00.000Z');
          const end = new Date(now.getTime() + endOffset * DAY);
          if (end.getTime() > now.getTime()) {
            expect(addDays(end, durationDays).getTime() - end.getTime()).toBe(durationDays * DAY);
          } else {
            expect(addDays(now, durationDays).getTime() - now.getTime()).toBe(durationDays * DAY);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: core-gym-management, Property 3: Freeze pauses the clock', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 100 }),
        (daysLeft, frozenDays) => {
          const now = new Date('2026-06-01T00:00:00.000Z');
          const end = addDays(now, daysLeft);
          const row: MembershipClock = {
            status: 'frozen',
            currentPeriodStart: addDays(now, -1),
            currentPeriodEnd: end,
            frozenAt: now,
          };
          expect(row.currentPeriodEnd).toEqual(end);
          const later = addDays(now, frozenDays);
          expect(unfreezeEnd(row, later).getTime() - end.getTime()).toBe(frozenDays * DAY);
          expect(reportedStatus(row, addDays(end, 5))).toBe('frozen');
        },
      ),
      { numRuns: 100 },
    );
  });
});
