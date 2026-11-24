import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from './gyms.service.js';

function harness() {
  const gym = {
    id: 'gym-1',
    ownerId: 'owner-1',
    status: 'setup_in_progress' as const,
    gymName: null as string | null,
    address: 'saved',
    contact: null as string | null,
    timing: null as string | null,
    logoValue: null as string | null,
  };
  const updateMany = vi.fn(
    async ({ data }: { data: Record<string, string> }) => {
      Object.assign(gym, data);
      return { count: 1 };
    },
  );
  const prisma = {
    gym: {
      findUnique: vi.fn(async () => ({ ...gym })),
      updateMany,
    },
  };
  return {
    gym,
    updateMany,
    service: new GymsService(prisma as unknown as PrismaService),
  };
}

describe('gym field validation', () => {
  it('rejects a body with none of its fields and writes nothing', async () => {
    const { service, updateMany, gym } = harness();
    await expect(service.updateProfile('owner-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updateSetup('owner-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(gym.address).toBe('saved');
  });

  it('rejects a present value that is not a non-empty string', async () => {
    const { service, updateMany } = harness();
    await expect(
      service.updateProfile('owner-1', { address: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateSetup('owner-1', { timing: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('stores a whitespace-only gym string', async () => {
    const { service, gym } = harness();
    await service.updateProfile('owner-1', { address: '   ' });
    expect(gym.address).toBe('   ');
    await service.updateSetup('owner-1', { timing: '\t' });
    expect(gym.timing).toBe('\t');
  });
});
