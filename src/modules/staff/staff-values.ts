import { BadRequestException } from '@nestjs/common';
import {
  ROLE_TEMPLATE_NAMES,
  type RoleTemplateName,
} from '../../common/constants/role-templates.js';
import { classifyEmail } from '../../common/validation/email-address.js';
import { isAcceptedRegistrationPassword } from '../../common/validation/password.js';

export const STAFF_VALUES_INVALID = 'Staff values are not valid';
export const TEMPLATE_VALUES_INVALID = 'Role template values are not valid';
export const AUDIT_SCOPE_INVALID = 'Audit log scope is not valid';

const NOT_ONLY_WHITESPACE = /[^ \t\r\n]/;

export const STAFF_TITLES = ['trainer', 'reception', 'accountant'] as const;
export type StaffTitleName = (typeof STAFF_TITLES)[number];

export interface StaffCreateInput {
  email: string;
  emailKey: string;
  password: string;
  fullName: string;
  title: StaffTitleName;
  template: RoleTemplateName;
}

export interface StaffUpdateInput {
  fullName?: string;
  title?: StaffTitleName;
  template?: RoleTemplateName;
  view?: boolean;
  create?: boolean;
  manage?: boolean;
  password?: string;
}

export interface TemplateUpdateInput {
  view?: boolean;
  create?: boolean;
  manage?: boolean;
}

export function parseCreateStaff(body: object): StaffCreateInput {
  const record = body as Record<string, unknown>;
  const email = classifyEmail(record.email);
  if (
    email.status !== 'valid' ||
    !isAcceptedRegistrationPassword(record.password) ||
    !isFullName(record.fullName) ||
    !isTitle(record.title) ||
    !isTemplateName(record.template)
  ) {
    throw new BadRequestException(STAFF_VALUES_INVALID);
  }
  return {
    email: email.email,
    emailKey: email.emailKey,
    password: record.password,
    fullName: record.fullName,
    title: record.title,
    template: record.template,
  };
}

export function parseUpdateStaff(body: object): StaffUpdateInput {
  const record = body as Record<string, unknown>;
  const values: StaffUpdateInput = {};
  if (record.fullName !== undefined) {
    if (!isFullName(record.fullName)) {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.fullName = record.fullName;
  }
  if (record.title !== undefined) {
    if (!isTitle(record.title)) {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.title = record.title;
  }
  if (record.template !== undefined) {
    if (!isTemplateName(record.template)) {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.template = record.template;
  }
  if (record.view !== undefined) {
    if (typeof record.view !== 'boolean') {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.view = record.view;
  }
  if (record.create !== undefined) {
    if (typeof record.create !== 'boolean') {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.create = record.create;
  }
  if (record.manage !== undefined) {
    if (typeof record.manage !== 'boolean') {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.manage = record.manage;
  }
  if (record.password !== undefined) {
    if (!isAcceptedRegistrationPassword(record.password)) {
      throw new BadRequestException(STAFF_VALUES_INVALID);
    }
    values.password = record.password;
  }
  const hasFlag =
    values.view !== undefined ||
    values.create !== undefined ||
    values.manage !== undefined;
  if (Object.keys(values).length === 0 || (values.template !== undefined && hasFlag)) {
    throw new BadRequestException(STAFF_VALUES_INVALID);
  }
  return values;
}

export function parseTemplateUpdate(body: object): TemplateUpdateInput {
  const record = body as Record<string, unknown>;
  const values: TemplateUpdateInput = {};
  for (const key of ['view', 'create', 'manage'] as const) {
    if (record[key] === undefined) {
      continue;
    }
    if (typeof record[key] !== 'boolean') {
      throw new BadRequestException(TEMPLATE_VALUES_INVALID);
    }
    values[key] = record[key];
  }
  if (Object.keys(values).length === 0) {
    throw new BadRequestException(TEMPLATE_VALUES_INVALID);
  }
  return values;
}

export function parseAuditScope(scope: unknown): 'platform' | 'gym' {
  if (scope !== 'platform' && scope !== 'gym') {
    throw new BadRequestException(AUDIT_SCOPE_INVALID);
  }
  return scope;
}

function isFullName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 100 &&
    NOT_ONLY_WHITESPACE.test(value)
  );
}

function isTitle(value: unknown): value is StaffTitleName {
  return (STAFF_TITLES as readonly string[]).includes(value as string);
}

function isTemplateName(value: unknown): value is RoleTemplateName {
  return (ROLE_TEMPLATE_NAMES as readonly string[]).includes(value as string);
}
