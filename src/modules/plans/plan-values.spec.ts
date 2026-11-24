import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  PLAN_VALUES_INVALID,
  parseCreatePlan,
  parseUpdatePlan,
} from './plan-values.js';

const valid = {
  code: 'pro',
  name: 'Pro',
  priceMonthlyPaise: 149_900,
  trialDays: 14,
  featureFlags: ['attendance', 'diet_plans'],
  maxMembers: 500,
  maxStaff: 10,
  maxBranches: null,
};

function rejects(run: () => unknown): void {
  expect(run).toThrow(BadRequestException);
  expect(run).toThrow(PLAN_VALUES_INVALID);
}

describe('parseCreatePlan', () => {
  it('returns the submitted values and defaults isActive to true', () => {
    expect(parseCreatePlan(valid)).toEqual({ ...valid, isActive: true });
    expect(parseCreatePlan({ ...valid, isActive: false }).isActive).toBe(false);
  });

  it('checks the Plan_Code pattern and its length', () => {
    expect(parseCreatePlan({ ...valid, code: 'a' }).code).toBe('a');
    const longest = `a${'b'.repeat(31)}`;
    expect(parseCreatePlan({ ...valid, code: longest }).code).toBe(longest);
    rejects(() => parseCreatePlan({ ...valid, code: `${longest}c` }));
    rejects(() => parseCreatePlan({ ...valid, code: 'Pro' }));
    rejects(() => parseCreatePlan({ ...valid, code: '1pro' }));
    rejects(() => parseCreatePlan({ ...valid, code: 'pro-plan' }));
    rejects(() => parseCreatePlan({ ...valid, code: '' }));
  });

  it('checks the Plan name length and content', () => {
    rejects(() => parseCreatePlan({ ...valid, name: '' }));
    expect(parseCreatePlan({ ...valid, name: 'P' }).name).toBe('P');
    expect(parseCreatePlan({ ...valid, name: 'n'.repeat(64) }).name).toBe(
      'n'.repeat(64),
    );
    rejects(() => parseCreatePlan({ ...valid, name: 'n'.repeat(65) }));
    rejects(() => parseCreatePlan({ ...valid, name: ' \t\r\n' }));
    expect(parseCreatePlan({ ...valid, name: ' Pro ' }).name).toBe(' Pro ');
  });

  it('checks the price range', () => {
    rejects(() => parseCreatePlan({ ...valid, priceMonthlyPaise: -1 }));
    expect(parseCreatePlan({ ...valid, priceMonthlyPaise: 0 }).priceMonthlyPaise).toBe(0);
    expect(
      parseCreatePlan({ ...valid, priceMonthlyPaise: 2_147_483_647 })
        .priceMonthlyPaise,
    ).toBe(2_147_483_647);
    rejects(() => parseCreatePlan({ ...valid, priceMonthlyPaise: 2_147_483_648 }));
    rejects(() => parseCreatePlan({ ...valid, priceMonthlyPaise: 10.5 }));
    rejects(() => parseCreatePlan({ ...valid, priceMonthlyPaise: '100' }));
  });

  it('checks the trial length range', () => {
    expect(parseCreatePlan({ ...valid, trialDays: 0 }).trialDays).toBe(0);
    expect(parseCreatePlan({ ...valid, trialDays: 365 }).trialDays).toBe(365);
    rejects(() => parseCreatePlan({ ...valid, trialDays: 366 }));
    rejects(() => parseCreatePlan({ ...valid, trialDays: -1 }));
  });

  it('checks Feature_Flags count, pattern, and duplicates', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => `flag_${index}`);
    expect(parseCreatePlan({ ...valid, featureFlags: fifty }).featureFlags).toEqual(fifty);
    rejects(() =>
      parseCreatePlan({ ...valid, featureFlags: [...fifty, 'flag_50'] }),
    );
    rejects(() =>
      parseCreatePlan({ ...valid, featureFlags: ['attendance', 'attendance'] }),
    );
    rejects(() => parseCreatePlan({ ...valid, featureFlags: ['Attendance'] }));
    rejects(() => parseCreatePlan({ ...valid, featureFlags: ['a'.repeat(65)] }));
    rejects(() => parseCreatePlan({ ...valid, featureFlags: 'attendance' }));
    expect(parseCreatePlan({ ...valid, featureFlags: [] }).featureFlags).toEqual([]);
  });

  it('treats null as unlimited and undefined as missing for each limit', () => {
    for (const field of ['maxMembers', 'maxStaff', 'maxBranches'] as const) {
      expect(parseCreatePlan({ ...valid, [field]: null })[field]).toBeNull();
      expect(parseCreatePlan({ ...valid, [field]: 0 })[field]).toBe(0);
      rejects(() => parseCreatePlan({ ...valid, [field]: undefined }));
      rejects(() => parseCreatePlan({ ...valid, [field]: -1 }));
      rejects(() => parseCreatePlan({ ...valid, [field]: 1.5 }));
    }
  });

  it('requires every field except isActive', () => {
    for (const field of Object.keys(valid)) {
      rejects(() => parseCreatePlan({ ...valid, [field]: undefined }));
    }
    rejects(() => parseCreatePlan({ ...valid, isActive: 'yes' }));
  });
});

describe('parseUpdatePlan', () => {
  it('returns only the submitted fields', () => {
    expect(parseUpdatePlan({ priceMonthlyPaise: 99_900 })).toEqual({
      priceMonthlyPaise: 99_900,
    });
    expect(parseUpdatePlan({ isActive: false, maxStaff: null })).toEqual({
      isActive: false,
      maxStaff: null,
    });
  });

  it('rejects an update with no fields', () => {
    rejects(() => parseUpdatePlan({}));
  });

  it('rejects an invalid value and a Plan_Code change', () => {
    rejects(() => parseUpdatePlan({ trialDays: 366 }));
    rejects(() => parseUpdatePlan({ name: '   ' }));
    rejects(() => parseUpdatePlan({ code: 'other', name: 'Other' }));
  });
});
