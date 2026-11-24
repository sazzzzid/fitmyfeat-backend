import { describe, expect, it } from 'vitest';
import { addOneMonthUtc, addTrialDays } from './billing-period.js';

describe('addOneMonthUtc', () => {
  it('clamps Jan 31 to the last day of February', () => {
    expect(addOneMonthUtc(new Date('2026-01-31T10:00:00.000Z'))).toEqual(
      new Date('2026-02-28T10:00:00.000Z'),
    );
  });

  it('uses Feb 29 in a leap year', () => {
    expect(addOneMonthUtc(new Date('2028-01-31T10:00:00.000Z'))).toEqual(
      new Date('2028-02-29T10:00:00.000Z'),
    );
  });

  it('rolls December into January of the next year', () => {
    expect(addOneMonthUtc(new Date('2026-12-15T00:00:00.000Z'))).toEqual(
      new Date('2027-01-15T00:00:00.000Z'),
    );
  });

  it('keeps the time of day to the millisecond', () => {
    expect(addOneMonthUtc(new Date('2026-03-10T23:59:59.999Z'))).toEqual(
      new Date('2026-04-10T23:59:59.999Z'),
    );
  });

  it('keeps a clamped day on the next renewal', () => {
    const february = addOneMonthUtc(new Date('2026-01-31T10:00:00.000Z'));
    expect(addOneMonthUtc(february)).toEqual(
      new Date('2026-03-28T10:00:00.000Z'),
    );
  });
});

describe('addTrialDays', () => {
  it('adds whole 24-hour days', () => {
    expect(addTrialDays(new Date('2026-11-22T10:00:00.000Z'), 14)).toEqual(
      new Date('2026-12-06T10:00:00.000Z'),
    );
  });
});
