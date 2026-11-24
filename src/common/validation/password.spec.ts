import { describe, expect, it } from 'vitest';
import { isAcceptedRegistrationPassword } from './password.js';

describe('registration password helper', () => {
  it('counts spaces and does not strip them', () => {
    expect(isAcceptedRegistrationPassword('')).toBe(false);
    expect(isAcceptedRegistrationPassword(' ')).toBe(true);
    expect(isAcceptedRegistrationPassword('a'.repeat(128))).toBe(true);
    expect(isAcceptedRegistrationPassword(' '.repeat(128))).toBe(true);
    expect(isAcceptedRegistrationPassword('a'.repeat(129))).toBe(false);
    expect(isAcceptedRegistrationPassword(` ${'a'.repeat(128)}`)).toBe(false);
  });
});
