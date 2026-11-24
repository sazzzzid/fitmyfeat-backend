import { BadRequestException } from '@nestjs/common';
import { isValidEmailAddress } from '../../common/validation/email-address.js';

export const PROFILE_VALUES_INVALID = 'Gym profile values are not valid';

export const OPTIONAL_PROFILE_FIELDS = [
  'contactEmail',
  'description',
  'mapsUrl',
] as const;

export type OptionalProfileField = (typeof OPTIONAL_PROFILE_FIELDS)[number];

const HTTPS_PREFIX = /^https:\/\//i;
const DESCRIPTION_MAX = 500;
const MAPS_URL_MAX = 2048;

export function parseOptionalProfileValue(
  field: OptionalProfileField,
  value: unknown,
): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !isOptionalProfileString(field, value)) {
    throw new BadRequestException(PROFILE_VALUES_INVALID);
  }
  return value;
}

function isOptionalProfileString(
  field: OptionalProfileField,
  value: string,
): boolean {
  if (field === 'contactEmail') {
    return isValidEmailAddress(value);
  }
  if (field === 'description') {
    return value.length >= 1 && value.length <= DESCRIPTION_MAX;
  }
  return isMapsUrl(value);
}

function isMapsUrl(value: string): boolean {
  if (
    value.length < 1 ||
    value.length > MAPS_URL_MAX ||
    !HTTPS_PREFIX.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}
