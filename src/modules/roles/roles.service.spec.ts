import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RolesService } from './roles.service.js';

describe('RolesService', () => {
  const roles = new Map<string, { id: string; name: string }>([
    ['Super_Admin', { id: 'role-super', name: 'Super_Admin' }],
  ]);
  const states = new Map<string, boolean>(
    PERMISSIONS.map((name) => [name, name !== 'create_gym']),
  );
  const roleCreate = vi.fn(async ({ data }: { data: { name: string } }) => {
    if (roles.has(data.name)) {
      throw new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }
    const role = { id: `role-${data.name}`, name: data.name };
    roles.set(data.name, role);
    return role;
  });
  const permissionRows = vi.fn(async () => {
    return [...states.entries()].map(([name, enabled]) => ({
      permission: { name },
      enabled,
    }));
  });
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { roleId_permissionId: { roleId: string; permissionId: string } };
      data: { enabled: boolean };
    }) => {
      states.set(where.roleId_permissionId.permissionId, data.enabled);
      return data;
    },
  );
  const prisma = {
    role: {
      findMany: vi.fn(async () =>
        [...roles.values()].map((role) => ({
          ...role,
          permissions: [...states.entries()].map(([name, enabled]) => ({
            permission: { name },
            enabled,
          })),
        })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { name: string } }) => {
        return roles.get(where.name) ?? null;
      }),
      create: roleCreate,
    },
    permission: {
      findMany: vi.fn(async () =>
        PERMISSIONS.map((name) => ({ id: name, name })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { name: string } }) => {
        return states.has(where.name) ? { id: where.name, name: where.name } : null;
      }),
    },
    rolePermission: {
      createMany: vi.fn(async () => ({ count: 7 })),
      update,
      findMany: permissionRows,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };

  const service = new RolesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    roles.clear();
    roles.set('Super_Admin', { id: 'role-super', name: 'Super_Admin' });
    for (const name of PERMISSIONS) {
      states.set(name, name !== 'create_gym');
    }
    update.mockClear();
    roleCreate.mockClear();
  });

  it('rejects an invalid role name', async () => {
    await expect(service.create('')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(' leading')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(roleCreate).not.toHaveBeenCalled();
  });

  it('treats role names as case-sensitive', async () => {
    const created = await service.create('super_admin');
    expect(created.name).toBe('super_admin');
    await expect(service.create('Super_Admin')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(roles.has('Super_Admin')).toBe(true);
  });

  it('rejects an unknown permission, a missing state, and an unknown role', async () => {
    const before = new Map(states);
    await expect(
      service.setPermission('Super_Admin', 'not_a_permission', 'enabled'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setPermission('Super_Admin', 'create_gym', 'maybe'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setPermission('Missing', 'create_gym', 'enabled'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
    expect(states).toEqual(before);
  });

  it.each(['manage_plans', 'manage_subscriptions'])(
    'rejects disabling %s on Super_Admin without a write',
    async (permission) => {
      const before = new Map(states);
      await expect(
        service.setPermission('Super_Admin', permission, 'disabled'),
      ).rejects.toThrow(
        'manage_plans and manage_subscriptions cannot be disabled on Super_Admin',
      );
      expect(update).not.toHaveBeenCalled();
      expect(states).toEqual(before);
    },
  );

  it.each(['manage_plans', 'manage_subscriptions'])(
    'allows enabling %s on Super_Admin',
    async (permission) => {
      await service.setPermission('Super_Admin', permission, 'enabled');
      expect(update).toHaveBeenCalledTimes(1);
      expect(states.get(permission)).toBe(true);
    },
  );

  it('does not lock manage_members on Super_Admin', async () => {
    await service.setPermission('Super_Admin', 'manage_members', 'disabled');
    expect(states.get('manage_members')).toBe(false);
    await service.setPermission('Super_Admin', 'manage_members', 'enabled');
    expect(states.get('manage_members')).toBe(true);
  });

  it('does not lock manage_staff on Super_Admin', async () => {
    await service.setPermission('Super_Admin', 'manage_staff', 'disabled');
    expect(states.get('manage_staff')).toBe(false);
    await service.setPermission('Super_Admin', 'manage_staff', 'enabled');
    expect(states.get('manage_staff')).toBe(true);
  });

  it('rejects disabling manage_platform_finance on Super_Admin', async () => {
    await expect(
      service.setPermission('Super_Admin', 'manage_platform_finance', 'disabled'),
    ).rejects.toThrow(
      'manage_platform_finance cannot be disabled on Super_Admin',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects disabling manage_message_templates on Super_Admin', async () => {
    update.mockClear();
    await expect(
      service.setPermission('Super_Admin', 'manage_message_templates', 'disabled'),
    ).rejects.toThrow(
      'manage_message_templates cannot be disabled on Super_Admin',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('creates a role with manage_staff disabled', async () => {
    const created = await service.create('Front_Desk');
    expect(created.permissions.manage_staff).toBe('disabled');
  });

  it('keeps the Phase 1 lock message for the Phase 1 locked permissions', async () => {
    await expect(
      service.setPermission('Super_Admin', 'review_gyms', 'disabled'),
    ).rejects.toThrow(
      'view_dashboard, manage_users, manage_roles, and review_gyms cannot be disabled on Super_Admin',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('does not lock the Phase 2 management permissions on other roles', async () => {
    roles.set('Gym_Owner', { id: 'role-owner', name: 'Gym_Owner' });
    await service.setPermission('Gym_Owner', 'manage_plans', 'disabled');
    await service.setPermission('Gym_Owner', 'manage_subscriptions', 'disabled');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('updates one permission and leaves the other ten states untouched', async () => {
    const before = new Map(states);
    await service.setPermission('Super_Admin', 'create_gym', 'enabled');
    expect(states.get('create_gym')).toBe(true);
    for (const name of PERMISSIONS) {
      if (name === 'create_gym') {
        continue;
      }
      expect(states.get(name)).toBe(before.get(name));
    }
    expect(update).toHaveBeenCalledTimes(1);
  });
});
