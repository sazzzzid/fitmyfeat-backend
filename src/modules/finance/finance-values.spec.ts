import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  commissionPaise,
  parseExpense,
  parseFinanceRange,
  parseSettlementMonth,
  unpaidGap,
} from './finance-values.js';

describe('finance values', () => {
  it('computes commission and unpaid gaps', () => {
    expect(commissionPaise(100_000, 10)).toBe(10_000);
    expect(commissionPaise(1, 1)).toBe(0);
    expect(unpaidGap(100, 40)).toBe(60);
    expect(unpaidGap(100, 150)).toBe(0);
  });

  it('rejects expense edges and a range of 367 days', () => {
    expect(() => parseExpense({ category: '', amountPaise: 1, paidOn: '2026-11-22' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseExpense({ category: 'a', amountPaise: 1, paidOn: '2026-11-22' }),
    ).not.toThrow();
    expect(() =>
      parseExpense({
        category: 'a'.repeat(65),
        amountPaise: 1,
        paidOn: '2026-11-22',
      }),
    ).toThrow('Expense values are not valid');
    expect(() =>
      parseExpense({ category: 'Rent', amountPaise: 0, paidOn: '2026-11-22' }),
    ).toThrow('Expense values are not valid');
    expect(() =>
      parseExpense({ category: 'Rent', amountPaise: 1, paidOn: '2026-02-31' }),
    ).toThrow('Expense values are not valid');
    expect(() =>
      parseExpense({
        category: 'Rent',
        amountPaise: 1,
        paidOn: '2026-11-22',
        notes: 'n'.repeat(501),
      }),
    ).toThrow('Expense values are not valid');
    expect(() => parseFinanceRange('2026-01-01', '2027-01-02')).toThrow(
      'Finance range is not valid',
    );
  });

  it('rejects a future or malformed settlement month', () => {
    const now = new Date('2026-11-22T00:00:00.000Z');
    expect(() => parseSettlementMonth('2026-12', now)).toThrow(
      'Settlement month is not valid',
    );
    expect(() => parseSettlementMonth('2026-13', now)).toThrow(
      'Settlement month is not valid',
    );
    expect(parseSettlementMonth('2026-11', now).month).toBe('2026-11');
  });
});
