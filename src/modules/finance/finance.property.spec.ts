import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { commissionPaise, unpaidGap } from './finance-values.js';

describe('finance properties', () => {
  it('Feature: finance-billing, Property 1: Commission is copied onto the charge', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (amount, percent, later) => {
          const stored = {
            commissionPercent: percent,
            commissionPaise: commissionPaise(amount, percent),
          };
          expect(stored.commissionPaise).toBe(Math.floor((amount * percent) / 100));
          expect(stored.commissionPaise).toBeLessThanOrEqual(amount);
          expect(stored.commissionPercent).toBe(percent);
          expect(stored.commissionPercent).not.toBe(later === percent ? percent + 1 : later);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: finance-billing, Property 2: Outstanding ignores negative gaps and other gyms', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            gym: fc.constantFrom('a', 'b'),
            list: fc.integer({ min: 0, max: 10_000 }),
            received: fc.integer({ min: 0, max: 10_000 }),
          }),
          { maxLength: 20 },
        ),
        (rows) => {
          const total = rows
            .filter((row) => row.gym === 'a')
            .reduce((sum, row) => sum + unpaidGap(row.list, row.received), 0);
          const other = rows
            .filter((row) => row.gym === 'b')
            .reduce((sum, row) => sum + unpaidGap(row.list, row.received), 0);
          expect(total).toBeGreaterThanOrEqual(0);
          expect(total + other).toBe(
            rows.reduce((sum, row) => sum + unpaidGap(row.list, row.received), 0),
          );
          for (const row of rows) {
            if (row.received >= row.list) {
              expect(unpaidGap(row.list, row.received)).toBe(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: finance-billing, Property 3: Ledger balance equals income minus expense', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5_000 }), { maxLength: 15 }),
        fc.array(fc.integer({ min: 1, max: 5_000 }), { maxLength: 15 }),
        (income, expenses) => {
          const finalBalance =
            income.reduce((sum, value) => sum + value, 0) -
            expenses.reduce((sum, value) => sum + value, 0);
          let running = 0;
          for (const value of expenses) {
            running -= value;
          }
          for (const value of income) {
            running += value;
          }
          expect(running).toBe(finalBalance);
        },
      ),
      { numRuns: 100 },
    );
  });
});
