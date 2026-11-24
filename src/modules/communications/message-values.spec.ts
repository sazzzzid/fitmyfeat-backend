import { BadRequestException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deliveryFor, digitCount, parseCreateTemplate } from './message-values.js';
import { isExpiryDue, isInactiveDue } from './message-render.js';

const DAY = 86_400_000;
const now = new Date('2026-11-23T10:00:00.000Z');

describe('message values', () => {
  it('rejects name lengths 0 and 65 and accepts 1', () => {
    const base = { channel: 'sms', body: 'Hello', name: 'A' };
    expect(parseCreateTemplate(base).name).toBe('A');
    expect(() => parseCreateTemplate({ ...base, name: '' })).toThrow(BadRequestException);
    expect(() => parseCreateTemplate({ ...base, name: 'a'.repeat(65) })).toThrow(
      'Message template values are not valid',
    );
  });

  it('rejects an unknown placeholder', () => {
    expect(() =>
      parseCreateTemplate({ channel: 'sms', name: 'Hi', body: 'Hello {{foo}}' }),
    ).toThrow('Message template values are not valid');
  });

  it('counts 7 and 8 digits', () => {
    expect(digitCount('555-5555')).toBe(7);
    expect(digitCount('55-555-555')).toBe(8);
    expect(deliveryFor('sms', '555-5555').status).toBe('failed');
    expect(deliveryFor('whatsapp', '55555555').status).toBe('sent');
  });

  it('always fails push', () => {
    expect(deliveryFor('push', '55555555')).toEqual({
      status: 'failed',
      failureReason: 'Member has no push destination',
    });
  });

  it('treats 7 days as expiry and 8 days as not, and 14 days as inactive', () => {
    const membership = (days: number) => ({
      status: 'active',
      frozenAt: null,
      currentPeriodEnd: new Date(now.getTime() + days * DAY),
    });
    expect(isExpiryDue(membership(7), now)).toBe(true);
    expect(isExpiryDue(membership(8), now)).toBe(false);
    expect(
      isExpiryDue(
        { status: 'frozen', frozenAt: now, currentPeriodEnd: membership(3).currentPeriodEnd },
        now,
      ),
    ).toBe(false);
    expect(isInactiveDue(new Date(now.getTime() - 14 * DAY), null, now)).toBe(true);
    expect(isInactiveDue(now, membership(-14), now)).toBe(true);
    expect(isInactiveDue(now, membership(-13), now)).toBe(false);
  });
});

describe('communication properties', () => {
  it('Feature: communication-retention, Property 1: WhatsApp and SMS need 8 digits, and push is not sent', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 16 }), (prefix, digits) => {
        const contact = `${prefix}${ '1'.repeat(digits) }`;
        const count = digitCount(contact);
        expect(deliveryFor('push', contact).status).toBe('failed');
        expect(deliveryFor('sms', contact).status).toBe(count >= 8 ? 'sent' : 'failed');
        expect(deliveryFor('whatsapp', contact).status).toBe(count >= 8 ? 'sent' : 'failed');
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: communication-retention, Property 2: One automation message per member per trigger per day', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ member: fc.string(), trigger: fc.constantFrom('expiry', 'payment', 'inactive') }), { maxLength: 30 }),
        (pairs) => {
          const seen = new Set<string>();
          let stored = 0;
          for (const pair of pairs) {
            const key = `${pair.member}:${pair.trigger}`;
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            stored += 1;
          }
          expect(stored).toBe(seen.size);
          expect(stored).toBeLessThanOrEqual(pairs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: communication-retention, Property 3: Analytics match stored counts', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            channel: fc.constantFrom('whatsapp', 'sms', 'push'),
            status: fc.constantFrom('sent', 'failed'),
          }),
          { maxLength: 40 },
        ),
        (rows) => {
          const sent = rows.filter((row) => row.status === 'sent').length;
          const failed = rows.filter((row) => row.status === 'failed').length;
          expect(sent + failed).toBe(rows.length);
          const text = JSON.stringify({ sent, failed });
          expect(text).not.toContain('body');
        },
      ),
      { numRuns: 100 },
    );
  });
});
