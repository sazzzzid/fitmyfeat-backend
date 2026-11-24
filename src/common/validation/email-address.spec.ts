import { describe, expect, it } from 'vitest';
import {
  classifyEmail,
  isValidEmailAddress,
  toEmailKey,
  trimPhase1Edges,
} from './email-address.js';

describe('email address helper', () => {
  it('keeps internal spaces and does not use a broad trim', () => {
    expect(trimPhase1Edges('  a b@c.com  ')).toBe('a b@c.com');
    expect(trimPhase1Edges('\t\r\na@b.c\n')).toBe('a@b.c');
    expect(trimPhase1Edges('\u00a0a@b.c\u00a0')).toBe('\u00a0a@b.c\u00a0');
  });

  it('treats an empty value after the phase 1 trim as required', () => {
    expect(classifyEmail('   ')).toEqual({ status: 'required' });
    expect(classifyEmail('\t\r\n')).toEqual({ status: 'required' });
    expect(classifyEmail(undefined)).toEqual({ status: 'required' });
  });

  it('rejects length boundaries and accepts 3 and 254', () => {
    expect(isValidEmailAddress('a@')).toBe(false);
    expect(isValidEmailAddress('a@b')).toBe(true);
    expect(isValidEmailAddress(`${'a'.repeat(252)}@b`)).toBe(true);
    expect(isValidEmailAddress(`${'a'.repeat(253)}@b`)).toBe(false);
  });

  it('folds only ASCII letters in the email key', () => {
    expect(toEmailKey('AbC@ExAmPle.com')).toBe('abc@example.com');
    expect(toEmailKey('İ@b.c')).toBe('İ@b.c');
    expect(classifyEmail(' AbC@Example.com ').status).toBe('valid');
    const classified = classifyEmail(' AbC@Example.com ');
    expect(classified).toEqual({
      status: 'valid',
      email: 'AbC@Example.com',
      emailKey: 'abc@example.com',
    });
  });

  it('rejects an internal space, a missing side, and more than one @', () => {
    expect(classifyEmail('a b@c.com').status).toBe('invalid');
    expect(classifyEmail('@b.com').status).toBe('invalid');
    expect(classifyEmail('a@').status).toBe('invalid');
    expect(classifyEmail('a@@b.com').status).toBe('invalid');
  });
});
