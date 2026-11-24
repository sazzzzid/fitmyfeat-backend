import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTHENTICATED_KEY } from '../decorators/authenticated.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import { MEMBER_ACCESS_KEY } from '../decorators/require-member-access.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';

describe('PermissionsGuard authenticated routes', () => {
  const getAllAndOverride = vi.fn();
  const findFirst = vi.fn();
  let user: { id: string; email: string; roleId: string } | undefined;
  const guard = new PermissionsGuard(
    { getAllAndOverride } as never,
    { rolePermission: { findFirst } } as never,
  );
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;

  beforeEach(() => {
    user = { id: 'user-id', email: 'owner@gym.test', roleId: 'role-id' };
    getAllAndOverride.mockReset();
    findFirst.mockReset();
  });

  function metadata(values: Record<string, unknown>) {
    getAllAndOverride.mockImplementation((key: string) => values[key]);
  }

  it('allows a signed-in user without reading permissions', async () => {
    metadata({ [AUTHENTICATED_KEY]: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects an authenticated route with no user', async () => {
    user = undefined;
    metadata({ [AUTHENTICATED_KEY]: true });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('still rejects a route that declares neither public, authenticated, nor a permission', async () => {
    metadata({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does not treat an authenticated route as public', async () => {
    metadata({ [IS_PUBLIC_KEY]: false, [AUTHENTICATED_KEY]: false });
    getAllAndOverride.mockImplementation((key: string) =>
      key === REQUIRE_PERMISSION_KEY ? undefined : false,
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PermissionsGuard staff access', () => {
  const getAllAndOverride = vi.fn();
  const findFirst = vi.fn();
  const findStaff = vi.fn();
  let user: { id: string; email: string; roleId: string } | undefined;
  const guard = new PermissionsGuard(
    { getAllAndOverride } as never,
    {
      rolePermission: { findFirst },
      staffMember: { findUnique: findStaff },
    } as never,
  );
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;

  beforeEach(() => {
    user = { id: 'user-id', email: 'ria@gym.test', roleId: 'role-id' };
    getAllAndOverride.mockReset();
    findFirst.mockReset();
    findStaff.mockReset();
  });

  function metadata(values: Record<string, unknown>) {
    getAllAndOverride.mockImplementation((key: string) => values[key]);
  }

  it('allows a staff flag that is on and rejects one that is off', async () => {
    metadata({ [MEMBER_ACCESS_KEY]: 'view' });
    findStaff.mockResolvedValue({
      canView: true,
      canCreate: false,
      canManage: false,
      disabledAt: null,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    findStaff.mockResolvedValue({
      canView: false,
      canCreate: true,
      canManage: true,
      disabledAt: null,
    });
    await expect(guard.canActivate(context)).rejects.toThrow('Permission is disabled');
  });

  it('rejects a disabled staff account even when the flag is on', async () => {
    metadata({ [MEMBER_ACCESS_KEY]: 'manage' });
    findStaff.mockResolvedValue({
      canView: true,
      canCreate: true,
      canManage: true,
      disabledAt: new Date(),
    });
    await expect(guard.canActivate(context)).rejects.toThrow('Staff account is disabled');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('uses manage_members for a caller who is not staff', async () => {
    metadata({ [MEMBER_ACCESS_KEY]: 'create' });
    findStaff.mockResolvedValue(null);
    findFirst.mockResolvedValue({ enabled: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    findFirst.mockResolvedValue({ enabled: false });
    await expect(guard.canActivate(context)).rejects.toThrow('Permission is disabled');
    expect(findFirst).toHaveBeenCalledWith({
      where: { roleId: 'role-id', permission: { name: 'manage_members' } },
    });
  });
});
