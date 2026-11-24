import { describe, expect, it } from 'vitest';
import { addDays, reportedStatus, unfreezeEnd } from './membership-state.js';

const start = new Date('2026-11-22T10:00:00.000Z');

describe('membership clock', () => {
  it('adds whole 24-hour days', () => {
    expect(addDays(start, 30).toISOString()).toBe('2026-12-22T10:00:00.000Z');
  });

  it('reports frozen after the stored end has passed', () => {
    const end = new Date('2026-11-23T10:00:00.000Z');
    expect(
      reportedStatus(
        {
          status: 'frozen',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          frozenAt: start,
        },
        new Date('2026-12-01T10:00:00.000Z'),
      ),
    ).toBe('frozen');
  });

  it('moves the end forward by the frozen duration', () => {
    const end = addDays(start, 10);
    const frozenAt = addDays(start, 2);
    const now = addDays(frozenAt, 5);
    expect(
      unfreezeEnd(
        {
          status: 'frozen',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          frozenAt,
        },
        now,
      ).toISOString(),
    ).toBe(addDays(end, 5).toISOString());
  });
});
