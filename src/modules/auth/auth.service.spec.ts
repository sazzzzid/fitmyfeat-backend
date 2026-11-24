import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService register', () => {
  const jwt = { sign: vi.fn(), signAsync: vi.fn() };
  const create = vi.fn();
  const prisma = {
    role: {
      findUnique: vi.fn(async () => ({ id: 'role-id', name: 'Gym_Owner' })),
    },
    userAccount: { create },
  };

  beforeEach(() => {
    create.mockReset();
    create.mockImplementation(async ({ data }) => ({ id: 'user-id', ...data }));
    jwt.sign.mockReset();
    jwt.signAsync.mockReset();
  });

  function service(): AuthService {
    return new AuthService(prisma as unknown as PrismaService, jwt as never);
  }

  it('rejects password lengths 0 and 129 and accepts 1 and 128 with spaces counted', async () => {
    await expect(
      service().register('owner@gym.test', ''),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service().register('owner@gym.test', 'a'.repeat(129)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service().register('owner@gym.test', ' '.repeat(129)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();

    await service().register('owner@gym.test', ' ');
    await service().register(' other@gym.test ', 'a'.repeat(128));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0].data.passwordHash).not.toBe(' ');
    expect(create.mock.calls[1]?.[0].data.email).toBe('other@gym.test');
  }, 60_000);

  it('returns email and role without a password, hash, or token', async () => {
    const body = await service().register('owner@gym.test', 'secret');
    expect(body).toEqual({ email: 'owner@gym.test', role: 'Gym_Owner' });
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('accessToken');
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  }, 30_000);
});

describe('AuthService currentUser', () => {
  const findUnique = vi.fn();
  const prisma = { userAccount: { findUnique } };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as never,
  );

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('returns the role name and only enabled permissions from the database', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'owner@gym.test',
      role: {
        name: 'Gym_Owner',
        permissions: [
          { permission: { name: 'manage_gym_setup' } },
          { permission: { name: 'create_gym' } },
          { permission: { name: 'not_a_phase_1_permission' } },
        ],
      },
    });

    await expect(
      service.currentUser({
        id: 'user-id',
        email: 'owner@gym.test',
        roleId: 'role-id',
      }),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'owner@gym.test',
      role: 'Gym_Owner',
      permissions: ['create_gym', 'manage_gym_setup'],
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: expect.any(Object),
    });
    expect(
      await service.currentUser({
        id: 'user-id',
        email: 'owner@gym.test',
        roleId: 'role-id',
      }),
    ).not.toHaveProperty('staff');
  });

  it('adds staff access only when the account is a staff member', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'ria@gym.test',
      role: { name: 'Gym_Staff', permissions: [] },
      staffMember: {
        gymId: 'gym-id',
        title: 'trainer',
        canView: true,
        canCreate: false,
        canManage: false,
        disabledAt: null,
        template: { name: 'Staff' },
      },
    });
    await expect(
      service.currentUser({
        id: 'user-id',
        email: 'ria@gym.test',
        roleId: 'role-id',
      }),
    ).resolves.toMatchObject({
      role: 'Gym_Staff',
      permissions: [],
      staff: {
        gymId: 'gym-id',
        title: 'trainer',
        template: 'Staff',
        view: true,
        create: false,
        manage: false,
        disabled: false,
      },
    });
  });

  it('returns an empty permission list when every permission is disabled', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'owner@gym.test',
      role: { name: 'Custom_Role', permissions: [] },
    });

    await expect(
      service.currentUser({
        id: 'user-id',
        email: 'owner@gym.test',
        roleId: 'role-id',
      }),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'owner@gym.test',
      role: 'Custom_Role',
      permissions: [],
    });
  });

  it('rejects a session whose account no longer exists', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.currentUser({
        id: 'missing',
        email: 'gone@gym.test',
        roleId: 'role-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService signIn', () => {
  const signAsync = vi.fn(async () => 'token');
  const findUser = vi.fn();
  const findStaff = vi.fn();
  const prisma = {
    userAccount: { findUnique: findUser },
    staffMember: { findUnique: findStaff },
  };
  const service = new AuthService(prisma as unknown as PrismaService, {
    signAsync,
  } as never);

  beforeEach(() => {
    signAsync.mockClear();
    findUser.mockReset();
    findStaff.mockReset();
  });

  it('rejects a disabled staff account after the correct password and keeps a wrong password as 401', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    findUser.mockResolvedValue({ id: 'staff-id', passwordHash });
    findStaff.mockResolvedValue({ disabledAt: new Date() });
    await expect(service.signIn('ria@gym.test', 'wrong-password')).rejects.toThrow(
      'Email_Address and password do not match a User_Account',
    );
    expect(findStaff).not.toHaveBeenCalled();
    await expect(service.signIn('ria@gym.test', 'correct-password')).rejects.toThrow(
      'Staff account is disabled',
    );
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('issues a token for an active staff account with every flag off', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    findUser.mockResolvedValue({ id: 'staff-id', passwordHash });
    findStaff.mockResolvedValue({ disabledAt: null, canView: false });
    await expect(service.signIn('ria@gym.test', 'correct-password')).resolves.toEqual({
      accessToken: 'token',
    });
  });
});
