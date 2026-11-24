import { BadRequestException } from '@nestjs/common';

export const TEMPLATE_VALUES_INVALID = 'Message template values are not valid';
export const CONTACT_CANNOT_RECEIVE = 'Contact cannot receive this channel';
export const NO_PUSH_DESTINATION = 'Member has no push destination';

const NOT_ONLY_WHITESPACE = /[^ \t\r\n]/;
const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;
export const PLACEHOLDERS = ['memberName', 'gymName', 'endDate', 'unpaidAmount'] as const;

export const CHANNELS = ['whatsapp', 'sms', 'push'] as const;
export type ChannelName = (typeof CHANNELS)[number];
export const TRIGGERS = ['expiry', 'payment', 'inactive'] as const;
export type AutomationTrigger = (typeof TRIGGERS)[number];

export interface TemplateInput {
  channel: ChannelName;
  name: string;
  body: string;
  isActive: boolean;
}

export interface TemplateUpdate {
  name?: string;
  body?: string;
  isActive?: boolean;
}

export function digitCount(contact: string): number {
  return contact.replace(/\D/g, '').length;
}

export function deliveryFor(
  channel: ChannelName,
  contact: string,
): { status: 'sent' | 'failed'; failureReason: string | null } {
  if (channel === 'push') {
    return { status: 'failed', failureReason: NO_PUSH_DESTINATION };
  }
  if (digitCount(contact) >= 8) {
    return { status: 'sent', failureReason: null };
  }
  return { status: 'failed', failureReason: CONTACT_CANNOT_RECEIVE };
}

export function parseCreateTemplate(body: object): TemplateInput {
  const record = body as Record<string, unknown>;
  if (!isChannel(record.channel) || !isName(record.name) || !isBody(record.body)) {
    throw new BadRequestException(TEMPLATE_VALUES_INVALID);
  }
  if (record.isActive !== undefined && typeof record.isActive !== 'boolean') {
    throw new BadRequestException(TEMPLATE_VALUES_INVALID);
  }
  return {
    channel: record.channel,
    name: record.name,
    body: record.body,
    isActive: record.isActive !== false,
  };
}

export function parseUpdateTemplate(body: object): TemplateUpdate {
  const record = body as Record<string, unknown>;
  if (record.channel !== undefined) {
    throw new BadRequestException(TEMPLATE_VALUES_INVALID);
  }
  const values: TemplateUpdate = {};
  if (record.name !== undefined) {
    if (!isName(record.name)) {
      throw new BadRequestException(TEMPLATE_VALUES_INVALID);
    }
    values.name = record.name;
  }
  if (record.body !== undefined) {
    if (!isBody(record.body)) {
      throw new BadRequestException(TEMPLATE_VALUES_INVALID);
    }
    values.body = record.body;
  }
  if (record.isActive !== undefined) {
    if (typeof record.isActive !== 'boolean') {
      throw new BadRequestException(TEMPLATE_VALUES_INVALID);
    }
    values.isActive = record.isActive;
  }
  if (Object.keys(values).length === 0) {
    throw new BadRequestException(TEMPLATE_VALUES_INVALID);
  }
  return values;
}

function isChannel(value: unknown): value is ChannelName {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}

function isName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    NOT_ONLY_WHITESPACE.test(value)
  );
}

function isBody(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 500) {
    return false;
  }
  const unknown = [...value.matchAll(PLACEHOLDER)].some(
    (match) => !(PLACEHOLDERS as readonly string[]).includes(match[1] ?? ''),
  );
  return !unknown;
}
