import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { ROLE_TEMPLATES } from '../../common/constants/role-templates.js';
import { PlatformSeedService } from './platform-seed.service.js';

describe('PlatformSeedService Phase 4 defaults', () => {
  const permissions = new Map<string, { id: string; name: string }>();
  const roles = new Map<string, { id: string; name: string }>();
  const rolePermissions = new Map<string, boolean>();
  const templates = new Map<
    string,
    { name: string; sortOrder: number; canView: boolean; canCreate: boolean; canManage: boolean }
  >();
  const users = new Map<string, { emailKey: string }>();

  const prisma = {
    permission: {
      upsert: async ({ where, create }: { where: { name: string }; create: { name: string } }) => {
        const row = permissions.get(where.name) ?? { id: create.name, name: create.name };
        permissions.set(row.name, row);
        return row;
      },
      findMany: async () => [...permissions.values()],
    },
    role: {
      upsert: async ({ where, create }: { where: { name: string }; create: { name: string } }) => {
        const row = roles.get(where.name) ?? { id: create.name, name: create.name };
        roles.set(row.name, row);
        return row;
      },
      findMany: async () => [...roles.values()],
    },
    rolePermission: {
      createMany: async ({
        data,
      }: {
        data: Array<{ roleId: string; permissionId: string; enabled: boolean }>;
      }) => {
        for (const row of data) {
          const key = `${row.roleId}:${row.permissionId}`;
          if (!rolePermissions.has(key)) {
            rolePermissions.set(key, row.enabled);
          }
        }
        return { count: data.length };
      },
    },
    roleTemplate: {
      findUnique: async ({ where }: { where: { name: string } }) => templates.get(where.name) ?? null,
      create: async ({
        data,
      }: {
        data: {
          name: string;
          sortOrder: number;
          canView: boolean;
          canCreate: boolean;
          canManage: boolean;
        };
      }) => {
        if (templates.has(data.name)) {
          throw new Error('unique');
        }
        templates.set(data.name, data);
        return data;
      },
    },
    userAccount: {
      findUnique: async ({ where }: { where: { emailKey: string } }) =>
        users.get(where.emailKey) ?? null,
      create: async ({ data }: { data: { emailKey: string } }) => {
        users.set(data.emailKey, data);
        return data;
      },
    },
  };
  const config = {
    get: (key: string) =>
      ({
        databaseUrl: 'postgresql://test',
        jwtSecret: 'test-secret',
        superAdminEmail: 'admin@gym.test',
        superAdminPassword: 'admin-password',
      })[key],
  };
  const service = new PlatformSeedService(prisma as never, config as never);

  beforeEach(() => {
    permissions.clear();
    roles.clear();
    rolePermissions.clear();
    templates.clear();
    users.clear();
  });

  function enabled(roleName: string, permission: string): boolean {
    return rolePermissions.get(`${roleName}:${permission}`) ?? false;
  }

  it('enables manage_staff only on Gym_Owner and seeds the three templates', async () => {
    await service.seed();
    expect(enabled('Gym_Owner', 'manage_staff')).toBe(true);
    expect(enabled('Super_Admin', 'manage_staff')).toBe(false);
    expect(enabled('Gym_Staff', 'manage_staff')).toBe(false);
    expect(enabled('Super_Admin', 'manage_platform_finance')).toBe(true);
    expect(enabled('Gym_Owner', 'manage_platform_finance')).toBe(false);
    expect(enabled('Gym_Owner', 'manage_gym_finance')).toBe(true);
    expect(enabled('Super_Admin', 'manage_gym_finance')).toBe(false);
    expect(enabled('Super_Admin', 'manage_message_templates')).toBe(true);
    expect(enabled('Gym_Owner', 'manage_communications')).toBe(true);
    expect(enabled('Super_Admin', 'manage_communications')).toBe(false);
    expect(enabled('Gym_Staff', 'manage_communications')).toBe(false);
    for (const permission of PERMISSIONS) {
      expect(enabled('Gym_Staff', permission)).toBe(false);
    }
    expect([...templates.values()]).toEqual(
      ROLE_TEMPLATES.map((template) => ({ ...template })),
    );
  });

  it('does not overwrite a template flag on a second seed', async () => {
    await service.seed();
    const staff = templates.get('Staff');
    if (!staff) {
      throw new Error('Staff template missing');
    }
    staff.canManage = true;
    await service.seed();
    expect(templates.get('Staff')?.canManage).toBe(true);
    expect(templates.size).toBe(3);
  });
});
