import { afterEach, describe, expect, it } from 'vitest';
import configuration from './configuration.js';

describe('commission percent', () => {
  const previous = process.env.COMMISSION_PERCENT;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.COMMISSION_PERCENT;
    } else {
      process.env.COMMISSION_PERCENT = previous;
    }
  });

  it('treats a missing or blank value as 0 and accepts 0 and 100', () => {
    delete process.env.COMMISSION_PERCENT;
    expect(configuration().commissionPercent).toBe(0);
    process.env.COMMISSION_PERCENT = '   ';
    expect(configuration().commissionPercent).toBe(0);
    process.env.COMMISSION_PERCENT = '0';
    expect(configuration().commissionPercent).toBe(0);
    process.env.COMMISSION_PERCENT = '100';
    expect(configuration().commissionPercent).toBe(100);
  });

  it('rejects 101', () => {
    process.env.COMMISSION_PERCENT = '101';
    expect(() => configuration()).toThrow(
      'COMMISSION_PERCENT is not a whole number from 0 to 100',
    );
  });
});
