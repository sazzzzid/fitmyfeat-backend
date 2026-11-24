import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISSIONS,
  type Permission,
} from '../../common/constants/permissions.js';
import { ROLE_NAMES } from '../../common/constants/role-names.js';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const LOCKED_SUPER_ADMIN_PERMISSIONS = new Set<Permission>([
  'view_dashboard',
  'manage_users',
  'manage_roles',
  'review_gyms',
]);

// Phase 2 (AI_RULES.md §63.3) locks two more Permissions on Super_Admin. They
// keep a separate message so the Phase 1 error text does not change.
const LOCKED_PHASE_2_SUPER_ADMIN_PERMISSIONS = new Set<Permission>([
  'manage_plans',
  'manage_subscriptions',
]);

const LOCKED_PHASE_5_SUPER_ADMIN_PERMISSIONS = new Set<Permission>([
  'manage_platform_finance',
]);

const LOCKED_PHASE_6_SUPER_ADMIN_PERMISSIONS = new Set<Permission>([
  'manage_message_templates',
]);

const INVALID_PERMISSION = 'Permission change is not valid';
const LOCKED_MESSAGE =
  'view_dashboard, manage_users, manage_roles, and review_gyms cannot be disabled on Super_Admin';
const LOCKED_PHASE_2_MESSAGE =
  'manage_plans and manage_subscriptions cannot be disabled on Super_Admin';
const LOCKED_PHASE_5_MESSAGE =
  'manage_platform_finance cannot be disabled on Super_Admin';
const LOCKED_PHASE_6_MESSAGE =
  'manage_message_templates cannot be disabled on Super_Admin';

export interface RoleView {
  name: string;
  permissions: Record<Permission, 'enabled' | 'disabled'>;
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<{ roles: RoleView[] }> {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });
    return {
      roles: roles.map((role) => ({
        name: role.name,
        permissions: permissionStates(
          role.permissions.map((row) => ({
            name: row.permission.name,
            enabled: row.enabled,
          })),
        ),
      })),
    };
  }

  async create(name: unknown): Promise<RoleView> {
    if (!isValidRoleName(name)) {
      throw new BadRequestException('Role name is not valid');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({ data: { name } });
        const permissions = await tx.permission.findMany({
          where: { name: { in: [...PERMISSIONS] } },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
            enabled: false,
          })),
        });
        return {
          name: role.name,
          permissions: permissionStates([]),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Role name is already used');
      }
      throw error;
    }
  }

  async setPermission(
    roleName: unknown,
    permission: unknown,
    state: unknown,
  ): Promise<RoleView> {
    if (
      typeof roleName !== 'string' ||
      typeof permission !== 'string' ||
      (state !== 'enabled' && state !== 'disabled') ||
      !isPermissionName(permission)
    ) {
      throw new BadRequestException(INVALID_PERMISSION);
    }
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });
    if (!role) {
      throw new NotFoundException('Role was not found');
    }
    if (
      role.name === ROLE_NAMES.superAdmin &&
      LOCKED_SUPER_ADMIN_PERMISSIONS.has(permission) &&
      state === 'disabled'
    ) {
      throw new BadRequestException(LOCKED_MESSAGE);
    }
    if (
      role.name === ROLE_NAMES.superAdmin &&
      LOCKED_PHASE_2_SUPER_ADMIN_PERMISSIONS.has(permission) &&
      state === 'disabled'
    ) {
      throw new BadRequestException(LOCKED_PHASE_2_MESSAGE);
    }
    if (
      role.name === ROLE_NAMES.superAdmin &&
      LOCKED_PHASE_5_SUPER_ADMIN_PERMISSIONS.has(permission) &&
      state === 'disabled'
    ) {
      throw new BadRequestException(LOCKED_PHASE_5_MESSAGE);
    }
    if (
      role.name === ROLE_NAMES.superAdmin &&
      LOCKED_PHASE_6_SUPER_ADMIN_PERMISSIONS.has(permission) &&
      state === 'disabled'
    ) {
      throw new BadRequestException(LOCKED_PHASE_6_MESSAGE);
    }
    const permissionRow = await this.prisma.permission.findUnique({
      where: { name: permission },
    });
    if (!permissionRow) {
      throw new BadRequestException(INVALID_PERMISSION);
    }
    await this.prisma.rolePermission.update({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permissionRow.id,
        },
      },
      data: { enabled: state === 'enabled' },
    });
    const roles = await this.list();
    const updated = roles.roles.find((item) => item.name === role.name);
    if (!updated) {
      throw new NotFoundException('Role was not found');
    }
    return updated;
  }
}

function isValidRoleName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length >= 1 &&
    name.length <= 64 &&
    !name.startsWith(' ') &&
    !name.endsWith(' ') &&
    /[^ ]/.test(name)
  );
}

function isPermissionName(name: string): name is Permission {
  return (PERMISSIONS as readonly string[]).includes(name);
}

function permissionStates(
  rows: Array<{ name: string; enabled: boolean }>,
): Record<Permission, 'enabled' | 'disabled'> {
  const states = {} as Record<Permission, 'enabled' | 'disabled'>;
  for (const name of PERMISSIONS) {
    const row = rows.find((item) => item.name === name);
    states[name] = row?.enabled ? 'enabled' : 'disabled';
  }
  return states;
}
