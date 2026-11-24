import { BadRequestException } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import {
  PLAN_CURRENCY,
  type PlanCurrency,
} from '../../common/constants/plan-currency.js';

export const PLAN_VALUES_INVALID = 'Plan values are not valid';

const MAX_INT = 2_147_483_647;
const MAX_TRIAL_DAYS = 365;
const MAX_FEATURE_FLAGS = 50;
const PLAN_CODE = /^[a-z][a-z0-9_]{0,31}$/;
const FEATURE_FLAG = /^[a-z][a-z0-9_]{0,63}$/;
const NOT_ONLY_WHITESPACE = /[^ \t\r\n]/;

export interface PlanValues {
  name: string;
  priceMonthlyPaise: number;
  trialDays: number;
  featureFlags: string[];
  maxMembers: number | null;
  maxStaff: number | null;
  maxBranches: number | null;
  isActive: boolean;
}

export interface NewPlanValues extends PlanValues {
  code: string;
}

export interface PlanResponse {
  code: string;
  name: string;
  priceMonthlyPaise: number;
  currency: PlanCurrency;
  trialDays: number;
  featureFlags: string[];
  maxMembers: number | null;
  maxStaff: number | null;
  maxBranches: number | null;
  isActive: boolean;
}

const PLAN_FIELDS = [
  'name',
  'priceMonthlyPaise',
  'trialDays',
  'featureFlags',
  'maxMembers',
  'maxStaff',
  'maxBranches',
  'isActive',
] as const satisfies ReadonlyArray<keyof PlanValues>;

const FIELD_RULES: Record<keyof PlanValues, (value: unknown) => boolean> = {
  name: isPlanName,
  priceMonthlyPaise: (value) => isIntegerInRange(value, 0, MAX_INT),
  trialDays: (value) => isIntegerInRange(value, 0, MAX_TRIAL_DAYS),
  featureFlags: isFeatureFlagList,
  maxMembers: isPlanLimit,
  maxStaff: isPlanLimit,
  maxBranches: isPlanLimit,
  isActive: (value) => typeof value === 'boolean',
};

/**
 * Validates a Plan creation body. `undefined` means the field was not
 * submitted. Every field except `isActive` is required; `null` is a value
 * only for the three limits, where it means unlimited.
 */
export function parseCreatePlan(body: object): NewPlanValues {
  const record = body as Record<string, unknown>;
  if (!isPlanCode(record.code)) {
    throw invalidPlanValues();
  }
  const values = { isActive: true } as PlanValues;
  for (const field of PLAN_FIELDS) {
    const value = record[field];
    if (value === undefined) {
      if (field === 'isActive') {
        continue;
      }
      throw invalidPlanValues();
    }
    assign(values, field, value);
  }
  return { code: record.code, ...values };
}

/**
 * Validates a Plan update body and returns only the submitted fields. At
 * least one field must be present, and the Plan_Code cannot change.
 */
export function parseUpdatePlan(body: object): Partial<PlanValues> {
  const record = body as Record<string, unknown>;
  if (record.code !== undefined) {
    throw invalidPlanValues();
  }
  const values: Partial<PlanValues> = {};
  let present = false;
  for (const field of PLAN_FIELDS) {
    const value = record[field];
    if (value === undefined) {
      continue;
    }
    present = true;
    assign(values, field, value);
  }
  if (!present) {
    throw invalidPlanValues();
  }
  return values;
}

export function isPlanCode(value: unknown): value is string {
  return typeof value === 'string' && PLAN_CODE.test(value);
}

export function toPlanResponse(plan: Plan): PlanResponse {
  return {
    code: plan.code,
    name: plan.name,
    priceMonthlyPaise: plan.priceMonthlyPaise,
    currency: PLAN_CURRENCY,
    trialDays: plan.trialDays,
    featureFlags: [...plan.featureFlags],
    maxMembers: plan.maxMembers,
    maxStaff: plan.maxStaff,
    maxBranches: plan.maxBranches,
    isActive: plan.isActive,
  };
}

function assign(
  values: Partial<PlanValues>,
  field: keyof PlanValues,
  value: unknown,
): void {
  if (!FIELD_RULES[field](value)) {
    throw invalidPlanValues();
  }
  (values as Record<string, unknown>)[field] = Array.isArray(value)
    ? [...(value as string[])]
    : value;
}

function isPlanName(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    NOT_ONLY_WHITESPACE.test(value)
  );
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isPlanLimit(value: unknown): boolean {
  return value === null || isIntegerInRange(value, 0, MAX_INT);
}

function isFeatureFlagList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_FEATURE_FLAGS) {
    return false;
  }
  const seen = new Set<string>();
  for (const flag of value) {
    if (typeof flag !== 'string' || !FEATURE_FLAG.test(flag) || seen.has(flag)) {
      return false;
    }
    seen.add(flag);
  }
  return true;
}

function invalidPlanValues(): BadRequestException {
  return new BadRequestException(PLAN_VALUES_INVALID);
}
