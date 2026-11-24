import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { OwnerProfilesService } from './owner-profiles.service.js';

describe('OwnerProfilesService', () => {
  const profiles = new Map<
    string,
    { userId: string; displayName: string; contact: string }
  >();
  const upsert = vi.fn(
    async ({
      where,
      create,
    }: {
      where: { userId: string };
      create: { userId: string; displayName: string; contact: string };
      update: { displayName: string; contact: string };
    }) => {
      profiles.set(where.userId, create);
      return create;
    },
  );
  const findUnique = vi.fn(async ({ where }: { where: { userId: string } }) => {
    return profiles.get(where.userId) ?? null;
  });
  const prisma = { ownerProfile: { upsert, findUnique } };
  const service = new OwnerProfilesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    profiles.clear();
    upsert.mockClear();
    findUnique.mockClear();
  });

  it('rejects whitespace-only values and values past the maximum length', async () => {
    await expect(service.update('user-1', '   ', 'owner@gym.test')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update('user-1', 'Ada', ' \t\r\n')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.update('user-1', 'a'.repeat(101), 'owner@gym.test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update('user-1', 'Ada', 'a'.repeat(255)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
    expect(profiles.size).toBe(0);
  });

  it('stores both values exactly and replaces them on a second put', async () => {
    await service.update('user-1', ' Ada ', ' 555 ');
    expect(profiles.get('user-1')).toMatchObject({
      displayName: ' Ada ',
      contact: ' 555 ',
    });
    await service.update('user-1', 'Bea', 'not-an-email');
    expect(profiles.get('user-1')).toMatchObject({
      displayName: 'Bea',
      contact: 'not-an-email',
    });
    await expect(service.get('user-1')).resolves.toEqual({
      displayName: 'Bea',
      contact: 'not-an-email',
    });
  });

  it('returns empty strings before any put and does not insert a row', async () => {
    await expect(service.get('user-1')).resolves.toEqual({
      displayName: '',
      contact: '',
    });
    expect(profiles.size).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
