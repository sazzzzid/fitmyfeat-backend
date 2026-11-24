import { BadRequestException } from '@nestjs/common';

export const FINANCE_FILTER_INVALID = 'Finance filter is not valid';
export const FINANCE_RANGE_INVALID = 'Finance range is not valid';
export const EXPENSE_VALUES_INVALID = 'Expense values are not valid';
export const SETTLEMENT_MONTH_INVALID = 'Settlement month is not valid';

const DAY = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
const MONTH = /^[0-9]{4}-(?:0[1-9]|1[0-2])$/;
const NOT_ONLY_WHITESPACE = /[^ \t\r\n]/;
const MAX_INT = 2_147_483_647;

export const CHARGE_STATUSES = ['paid', 'failed', 'refunded'] as const;
export type ChargeStatusName = (typeof CHARGE_STATUSES)[number];

export interface FinanceRange {
  from: Date;
  toExclusive: Date;
  toDay: string;
}

export interface ExpenseInput {
  category: string;
  amountPaise: number;
  paidOn: Date;
  notes: string | null;
}

export function commissionPaise(amountPaise: number, percent: number): number {
  return Math.floor((amountPaise * percent) / 100);
}

export function parseChargeStatus(status: unknown): ChargeStatusName | undefined {
  if (status === undefined) {
    return undefined;
  }
  if (
    typeof status === 'string' &&
    (CHARGE_STATUSES as readonly string[]).includes(status)
  ) {
    return status as ChargeStatusName;
  }
  throw new BadRequestException(FINANCE_FILTER_INVALID);
}

export function parseFinanceRange(from: unknown, to: unknown): FinanceRange {
  if (!isDay(from) || !isDay(to) || from > to) {
    throw new BadRequestException(FINANCE_RANGE_INVALID);
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (
    !sameDay(start, from) ||
    !sameDay(end, to) ||
    (end.getTime() - start.getTime()) / 86_400_000 + 1 > 366
  ) {
    throw new BadRequestException(FINANCE_RANGE_INVALID);
  }
  const toExclusive = new Date(end.getTime() + 86_400_000);
  return { from: start, toExclusive, toDay: to };
}

export function parseSettlementMonth(
  month: unknown,
  now: Date,
): { month: string; start: Date; end: Date } {
  if (typeof month !== 'string' || !MONTH.test(month)) {
    throw new BadRequestException(SETTLEMENT_MONTH_INVALID);
  }
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  if (start.getUTCMonth() !== monthIndex) {
    throw new BadRequestException(SETTLEMENT_MONTH_INVALID);
  }
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (month > current) {
    throw new BadRequestException(SETTLEMENT_MONTH_INVALID);
  }
  return {
    month,
    start,
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

export function parseExpense(body: object): ExpenseInput {
  const record = body as Record<string, unknown>;
  if (
    typeof record.category !== 'string' ||
    record.category.length < 1 ||
    record.category.length > 64 ||
    !NOT_ONLY_WHITESPACE.test(record.category) ||
    !isPaise(record.amountPaise) ||
    !isDay(record.paidOn)
  ) {
    throw new BadRequestException(EXPENSE_VALUES_INVALID);
  }
  const paidOn = new Date(`${record.paidOn}T00:00:00.000Z`);
  if (!sameDay(paidOn, record.paidOn)) {
    throw new BadRequestException(EXPENSE_VALUES_INVALID);
  }
  let notes: string | null = null;
  if (record.notes !== undefined && record.notes !== null) {
    if (typeof record.notes !== 'string' || record.notes.length > 500) {
      throw new BadRequestException(EXPENSE_VALUES_INVALID);
    }
    notes = record.notes;
  }
  return {
    category: record.category,
    amountPaise: record.amountPaise,
    paidOn,
    notes,
  };
}

export function unpaidGap(listPricePaise: number, amountReceivedPaise: number): number {
  return Math.max(0, listPricePaise - amountReceivedPaise);
}

function isPaise(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_INT
  );
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY.test(value);
}

function sameDay(date: Date, day: string): boolean {
  return date.toISOString().slice(0, 10) === day;
}
