import { BadRequestException } from '@nestjs/common';

export const MEMBER_VALUES_INVALID = 'Member values are not valid';
export const PRODUCT_VALUES_INVALID = 'Membership product values are not valid';

const MAX_INT = 2_147_483_647;
const NOT_ONLY_WHITESPACE = /[^ \t\r\n]/;

export const PAYMENT_INVALID = 'Payment is not valid';
export const MEMBER_FILTER_INVALID = 'Member filter is not valid';

export const PAYMENT_METHODS = ['cash', 'upi', 'card'] as const;
export type PaymentMethodName = (typeof PAYMENT_METHODS)[number];

export const MEMBER_FILTERS = [
  'active',
  'expiring',
  'expired',
  'frozen',
  'none',
  'left',
] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export interface PaymentInput {
  amountReceivedPaise: number;
  paidOn: Date;
  method: PaymentMethodName;
}

export interface MemberValues {
  fullName: string;
  contact: string;
  notes: string | null;
}

export interface CreateMemberInput extends MemberValues {
  allowDuplicateContact: boolean;
}

export interface ProductValues {
  name: string;
  pricePaise: number;
  durationDays: number;
  isActive: boolean;
}

export function parseCreateMember(body: object): CreateMemberInput {
  const record = body as Record<string, unknown>;
  if (!isName(record.fullName, 100) || !isName(record.contact, 254)) {
    throw invalidMember();
  }
  if (
    record.allowDuplicateContact !== undefined &&
    typeof record.allowDuplicateContact !== 'boolean'
  ) {
    throw invalidMember();
  }
  return {
    fullName: record.fullName,
    contact: record.contact,
    notes: parseNotes(record.notes, true),
    allowDuplicateContact: record.allowDuplicateContact === true,
  };
}

export function parseUpdateMember(body: object): Partial<MemberValues> {
  const record = body as Record<string, unknown>;
  const values: Partial<MemberValues> = {};
  if (record.fullName !== undefined) {
    if (!isName(record.fullName, 100)) {
      throw invalidMember();
    }
    values.fullName = record.fullName;
  }
  if (record.contact !== undefined) {
    if (!isName(record.contact, 254)) {
      throw invalidMember();
    }
    values.contact = record.contact;
  }
  if (record.notes !== undefined) {
    values.notes = parseNotes(record.notes, false);
  }
  if (Object.keys(values).length === 0) {
    throw invalidMember();
  }
  return values;
}

export function parseCreateProduct(body: object): ProductValues {
  const record = body as Record<string, unknown>;
  if (
    !isName(record.name, 64) ||
    !isPrice(record.pricePaise) ||
    !isDuration(record.durationDays)
  ) {
    throw invalidProduct();
  }
  if (record.isActive !== undefined && typeof record.isActive !== 'boolean') {
    throw invalidProduct();
  }
  return {
    name: record.name,
    pricePaise: record.pricePaise,
    durationDays: record.durationDays,
    isActive: record.isActive ?? true,
  };
}

export function parseUpdateProduct(body: object): Partial<ProductValues> {
  const record = body as Record<string, unknown>;
  const values: Partial<ProductValues> = {};
  if (record.name !== undefined) {
    if (!isName(record.name, 64)) {
      throw invalidProduct();
    }
    values.name = record.name;
  }
  if (record.pricePaise !== undefined) {
    if (!isPrice(record.pricePaise)) {
      throw invalidProduct();
    }
    values.pricePaise = record.pricePaise;
  }
  if (record.durationDays !== undefined) {
    if (!isDuration(record.durationDays)) {
      throw invalidProduct();
    }
    values.durationDays = record.durationDays;
  }
  if (record.isActive !== undefined) {
    if (typeof record.isActive !== 'boolean') {
      throw invalidProduct();
    }
    values.isActive = record.isActive;
  }
  if (Object.keys(values).length === 0) {
    throw invalidProduct();
  }
  return values;
}

function parseNotes(value: unknown, allowMissing: boolean): string | null {
  if (value === undefined || value === null) {
    if (allowMissing || value === null) {
      return null;
    }
  }
  if (typeof value === 'string' && value.length <= 1000) {
    return value;
  }
  throw invalidMember();
}

function isName(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= max &&
    NOT_ONLY_WHITESPACE.test(value)
  );
}

function isPrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_INT
  );
}

function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3650;
}

function invalidMember(): BadRequestException {
  return new BadRequestException(MEMBER_VALUES_INVALID);
}

function invalidProduct(): BadRequestException {
  return new BadRequestException(PRODUCT_VALUES_INVALID);
}

const PAID_ON = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parsePayment(body: object): PaymentInput {
  const record = body as Record<string, unknown>;
  if (!isPrice(record.amountReceivedPaise) || !isMethod(record.method)) {
    throw invalidPayment();
  }
  const paidOn = parsePaidOn(record.paidOn);
  if (!paidOn) {
    throw invalidPayment();
  }
  return {
    amountReceivedPaise: record.amountReceivedPaise,
    paidOn,
    method: record.method,
  };
}

export function parseMemberFilter(status: unknown): MemberFilter | undefined {
  if (status === undefined) {
    return undefined;
  }
  if (
    typeof status === 'string' &&
    (MEMBER_FILTERS as readonly string[]).includes(status)
  ) {
    return status as MemberFilter;
  }
  throw new BadRequestException(MEMBER_FILTER_INVALID);
}

function parsePaidOn(value: unknown): Date | null {
  if (typeof value !== 'string' || !PAID_ON.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function isMethod(value: unknown): value is PaymentMethodName {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

function invalidPayment(): BadRequestException {
  return new BadRequestException(PAYMENT_INVALID);
}
