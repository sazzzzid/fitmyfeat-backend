import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const users = [
    {
      id: 'user-1',
      email: 'admin@gym.test',
      emailKey: 'admin@gym.test',
      passwordHash: 'hash-admin',
      roleId: 'role-super',
      role: { name: 'Super_Admin' },
    },
    {
      id: 'user-2',
      email: 'owner@gym.test',
      emailKey: 'owner@gym.test',
      passwordHash: 'hash-owner',
      roleId: 'role-owner',
      role: { name: 'Gym_Owner' },
    },
  ];
  const roles = new Map([
    ['Super_Admin', { id: 'role-super', name: 'Super_Admin' }],
    ['Gym_Owner', { id: 'role-owner', name: 'Gym_Owner' }],
  ]);
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { roleId: string };
    }) => {
      const user = users.find((item) => item.id === where.id);
      if (user) {
        user.roleId = data.roleId;
      }
      return user;
    },
  );
  const staffUserIds = new Set<string>();
  const prisma = {
    userAccount: {
      findMany: vi.fn(async (args: { select: Record<string, unknown> }) => {
        expect(args.select).not.toHaveProperty('passwordHash');
        expect(args.select).not.toHaveProperty('emailKey');
        return users.map((user) => ({
          email: user.email,
          role: { name: user.role.name },
        }));
      }),
      findUnique: vi.fn(async ({ where }: { where: { emailKey: string } }) => {
        return users.find((user) => user.emailKey === where.emailKey) ?? null;
      }),
      update,
      create: vi.fn(),
    },
    role: {
      findUnique: vi.fn(async ({ where }: { where: { name: string } }) => {
        return roles.get(where.name) ?? null;
      }),
      create: vi.fn(),
    },
    staffMember: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        return staffUserIds.has(where.userId) ? { userId: where.userId } : null;
      }),
    },
  };
  const service = new UsersService(prisma as unknown as PrismaService);

  it('lists every stored account and omits the hash', async () => {
    await expect(service.list()).resolves.toEqual({
      users: [
        { email: 'admin@gym.test', role: 'Super_Admin' },
        { email: 'owner@gym.test', role: 'Gym_Owner' },
      ],
    });
    expect(JSON.stringify(await service.list())).not.toContain('hash-admin');
  });

  it('replaces only roleId for a known email and exact role name', async () => {
    const beforeEmail = users[1]?.email;
    const beforeHash = users[1]?.passwordHash;
    await service.assignRole(' Owner@gym.test ', 'Super_Admin');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { roleId: 'role-super' },
    });
    expect(users[1]?.email).toBe(beforeEmail);
    expect(users[1]?.passwordHash).toBe(beforeHash);
    expect(users[0]?.roleId).toBe('role-super');
    expect(prisma.userAccount.create).not.toHaveBeenCalled();
    expect(prisma.role.create).not.toHaveBeenCalled();
  });

  it('writes nothing for an unknown email or unknown role name', async () => {
    update.mockClear();
    await expect(
      service.assignRole('missing@gym.test', 'Gym_Owner'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assignRole('owner@gym.test', 'super_admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    expect(prisma.userAccount.create).not.toHaveBeenCalled();
    expect(prisma.role.create).not.toHaveBeenCalled();
  });

  it('rejects assigning Gym_Staff and rejects changing a staff account', async () => {
    update.mockClear();
    await expect(service.assignRole('owner@gym.test', 'Gym_Staff')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    staffUserIds.add('user-2');
    await expect(service.assignRole('owner@gym.test', 'Super_Admin')).rejects.toThrow(
      new ConflictException('Staff role cannot be changed'),
    );
    expect(update).not.toHaveBeenCalled();
    staffUserIds.delete('user-2');
  });
});
