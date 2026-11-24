import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseCreateStaff, parseTemplateUpdate, parseUpdateStaff } from './staff-values.js';

const valid = {
  email: 'ria@gym.test',
  password: 'staff-password',
  fullName: 'Ria Sen',
  title: 'trainer',
  template: 'Staff',
};

describe('staff values', () => {
  it('rejects a missing field, a blank name, and lengths outside 1 to 100', () => {
    expect(() => parseCreateStaff({ ...valid, fullName: undefined })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreateStaff({ ...valid, fullName: '   ' })).toThrow(
      'Staff values are not valid',
    );
    expect(() => parseCreateStaff({ ...valid, fullName: '' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseCreateStaff({ ...valid, fullName: 'a'.repeat(101) }),
    ).toThrow(BadRequestException);
    expect(parseCreateStaff({ ...valid, fullName: 'a' }).fullName).toBe('a');
    expect(parseCreateStaff({ ...valid, fullName: 'a'.repeat(100) }).fullName).toBe(
      'a'.repeat(100),
    );
  });

  it('rejects password lengths 0 and 129', () => {
    expect(() => parseCreateStaff({ ...valid, password: '' })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreateStaff({ ...valid, password: 'a'.repeat(129) })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a title or template outside the three names', () => {
    expect(() => parseCreateStaff({ ...valid, title: 'coach' })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreateStaff({ ...valid, template: 'Intern' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects an update with no fields or with a template and a flag', () => {
    expect(() => parseUpdateStaff({})).toThrow('Staff values are not valid');
    expect(() => parseUpdateStaff({ template: 'Owner', view: true })).toThrow(
      'Staff values are not valid',
    );
    expect(parseUpdateStaff({ template: 'Owner' })).toEqual({ template: 'Owner' });
    expect(parseUpdateStaff({ view: false })).toEqual({ view: false });
  });

  it('rejects an empty or non-boolean template update', () => {
    expect(() => parseTemplateUpdate({})).toThrow('Role template values are not valid');
    expect(() => parseTemplateUpdate({ view: 'yes' })).toThrow(
      'Role template values are not valid',
    );
    expect(parseTemplateUpdate({ manage: true })).toEqual({ manage: true });
  });
});
