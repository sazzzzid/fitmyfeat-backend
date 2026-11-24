import { BadRequestException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RolesService } from './roles.service.js';

const locked = [
  'view_dashboard',
  'manage_users',
  'manage_roles',
  'review_gyms',
] as const;

describe('role permission properties', () => {
  it('Feature: gym-saas-foundation, Property 9: Super_Admin cannot drop the four locked permissions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...locked),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (permission, ...flags) => {
          const states = new Map(
            PERMISSIONS.map((name, index) => [
              name,
              locked.includes(name as (typeof locked)[number])
                ? true
                : (flags[index] ?? false),
            ]),
          );
          const before = new Map(states);
          const update = vi.fn();
          const prisma = {
            role: {
              findUnique: async ({ where }: { where: { name: string } }) =>
                where.name === 'Super_Admin'
                  ? { id: 'role-super', name: 'Super_Admin' }
                  : null,
            },
            permission: {
              findUnique: async ({ where }: { where: { name: string } }) => ({
                id: where.name,
                name: where.name,
              }),
            },
            rolePermission: { update },
          };
          const service = new RolesService(prisma as unknown as PrismaService);
          await expect(
            service.setPermission('Super_Admin', permission, 'disabled'),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(update).not.toHaveBeenCalled();
          expect(states).toEqual(before);
          expect(states.get(permission)).toBe(before.get(permission));
        },
      ),
      { numRuns: 100 },
    );
  });
});
