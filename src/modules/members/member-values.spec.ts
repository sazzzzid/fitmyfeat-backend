import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  MEMBER_VALUES_INVALID,
  PRODUCT_VALUES_INVALID,
  parseCreateMember,
  parseCreateProduct,
  parseUpdateMember,
  parseUpdateProduct,
} from './member-values.js';

function rejects(run: () => unknown, message: string): void {
  expect(run).toThrow(BadRequestException);
  expect(run).toThrow(message);
}

describe('member values', () => {
  const valid = { fullName: 'Asha Rao', contact: '555-0100' };

  it('stores a member and treats omitted notes as null', () => {
    expect(parseCreateMember(valid)).toEqual({
      ...valid,
      notes: null,
      allowDuplicateContact: false,
    });
    expect(parseCreateMember({ ...valid, notes: null }).notes).toBeNull();
    expect(parseCreateMember({ ...valid, notes: '' }).notes).toBe('');
    expect(parseCreateMember({ ...valid, notes: 'n'.repeat(1000) }).notes).toHaveLength(1000);
  });

  it('checks name and contact bounds', () => {
    rejects(() => parseCreateMember({ ...valid, fullName: '' }), MEMBER_VALUES_INVALID);
    expect(parseCreateMember({ ...valid, fullName: 'A' }).fullName).toBe('A');
    expect(parseCreateMember({ ...valid, fullName: 'n'.repeat(100) }).fullName).toHaveLength(100);
    rejects(() => parseCreateMember({ ...valid, fullName: 'n'.repeat(101) }), MEMBER_VALUES_INVALID);
    rejects(() => parseCreateMember({ ...valid, fullName: ' \t' }), MEMBER_VALUES_INVALID);
    rejects(() => parseCreateMember({ ...valid, contact: ' \t' }), MEMBER_VALUES_INVALID);
    expect(parseCreateMember({ ...valid, contact: 'c'.repeat(254) }).contact).toHaveLength(254);
    rejects(() => parseCreateMember({ ...valid, contact: 'c'.repeat(255) }), MEMBER_VALUES_INVALID);
    rejects(() => parseCreateMember({ ...valid, notes: 'n'.repeat(1001) }), MEMBER_VALUES_INVALID);
  });

  it('requires at least one field on update', () => {
    rejects(() => parseUpdateMember({}), MEMBER_VALUES_INVALID);
    expect(parseUpdateMember({ notes: null })).toEqual({ notes: null });
    expect(parseUpdateMember({ fullName: 'Bea' })).toEqual({ fullName: 'Bea' });
  });
});

describe('membership product values', () => {
  const valid = { name: 'Monthly', pricePaise: 150_000, durationDays: 30 };

  it('defaults isActive to true', () => {
    expect(parseCreateProduct(valid)).toEqual({ ...valid, isActive: true });
  });

  it('checks duration and price bounds', () => {
    rejects(() => parseCreateProduct({ ...valid, durationDays: 0 }), PRODUCT_VALUES_INVALID);
    expect(parseCreateProduct({ ...valid, durationDays: 1 }).durationDays).toBe(1);
    expect(parseCreateProduct({ ...valid, durationDays: 3650 }).durationDays).toBe(3650);
    rejects(() => parseCreateProduct({ ...valid, durationDays: 3651 }), PRODUCT_VALUES_INVALID);
    rejects(() => parseCreateProduct({ ...valid, name: '   ' }), PRODUCT_VALUES_INVALID);
    rejects(() => parseCreateProduct({ ...valid, pricePaise: -1 }), PRODUCT_VALUES_INVALID);
    rejects(() => parseUpdateProduct({}), PRODUCT_VALUES_INVALID);
  });
});
