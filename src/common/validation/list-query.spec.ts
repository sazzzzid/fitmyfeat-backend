import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  parseOptionalDayRange,
  parseRequiredDayRange,
  searchNeedle,
  slicePage,
} from './list-query.js';

describe('list query', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns the full list and no cursor when limit is omitted', () => {
    expect(slicePage(rows, undefined, undefined, (row) => row.id)).toEqual({
      rows,
    });
  });

  it('walks every row once and ends with a null cursor', () => {
    const first = slicePage(rows, 2, undefined, (row) => row.id);
    expect(first.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = slicePage(rows, 2, first.nextCursor ?? undefined, (row) => row.id);
    expect(second.rows.map((row) => row.id)).toEqual(['c']);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects a cursor that is not from this list', () => {
    expect(() => slicePage(rows, 1, 'not-a-cursor', (row) => row.id)).toThrow(
      BadRequestException,
    );
  });

  it('treats a blank search as omitted and keeps other text', () => {
    expect(searchNeedle(undefined)).toBeUndefined();
    expect(searchNeedle('   ')).toBeUndefined();
    expect(searchNeedle(' Ann ')).toBe('ann');
  });

  it('accepts an inclusive range and rejects a bad or inverted one', () => {
    expect(parseOptionalDayRange(undefined, undefined)).toBeUndefined();
    expect(parseRequiredDayRange('2026-11-01', '2026-11-02')).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-02',
    });
    expect(() => parseOptionalDayRange('2026-11-02', '2026-11-01')).toThrow(
      BadRequestException,
    );
    expect(() => parseRequiredDayRange('2026-02-31', '2026-03-01')).toThrow(
      BadRequestException,
    );
  });
});
