import { BadRequestException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RolesService } from './roles.service.js';

const locked = ['manage_plans', 'manage_subscriptions'] as const;

function serviceWith(states: Map<string, boolean>) {
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { roleId_permissionId: { permissionId: string } };
      data: { enabled: boolean };
    }) => {
      states.set(where.roleId_permissionId.permissionId, data.enabled);
      return data;
    },
  );
  const prisma = {
    role: {
      findUnique: async ({ where }: { where: { name: string } }) =>
        where.name === 'Super_Admin'
          ? { id: 'role-super', name: 'Super_Admin' }
          : null,
      findMany: async () => [
        {
          id: 'role-super',
          name: 'Super_Admin',
          permissions: [...states.entries()].map(([name, enabled]) => ({
            permission: { name },
            enabled,
          })),
        },
      ],
    },
    permission: {
      findUnique: async ({ where }: { where: { name: string } }) => ({
        id: where.name,
        name: where.name,
      }),
    },
    rolePermission: { update },
  };
  return {
    service: new RolesService(prisma as unknown as PrismaService),
    update,
  };
}

describe('Phase 2 role permission properties', () => {
  it('Feature: plan-subscription-engine, Property 2: Super_Admin cannot drop the Phase 2 management Permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...locked),
        fc.array(fc.boolean(), {
          minLength: PERMISSIONS.length,
          maxLength: PERMISSIONS.length,
        }),
        async (permission, flags) => {
          const states = new Map<string, boolean>(
            PERMISSIONS.map((name, index) => [
              name,
              name === permission ? true : (flags[index] ?? false),
            ]),
          );
          const before = new Map(states);

          const disabling = serviceWith(states);
          await expect(
            disabling.service.setPermission('Super_Admin', permission, 'disabled'),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(disabling.update).not.toHaveBeenCalled();
          expect(states).toEqual(before);

          const enabling = serviceWith(states);
          await enabling.service.setPermission(
            'Super_Admin',
            permission,
            'enabled',
          );
          expect(enabling.update).toHaveBeenCalledTimes(1);
          expect(
            enabling.update.mock.calls[0]?.[0].where.roleId_permissionId
              .permissionId,
          ).toBe(permission);
          for (const name of PERMISSIONS) {
            expect(states.get(name)).toBe(
              name === permission ? true : before.get(name),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
