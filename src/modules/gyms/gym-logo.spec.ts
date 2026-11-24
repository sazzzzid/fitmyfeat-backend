import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TINY_PNG } from '../../../test/helpers/tiny-png.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GYM_LOGO_DIRECTORY, logoExtension } from './gym-logo.js';
import { GymsService } from './gyms.service.js';

describe('gym logo images', () => {
  it('accepts a png whose bytes match the declared type', () => {
    expect(
      logoExtension({
        buffer: TINY_PNG,
        mimetype: 'image/png',
        size: TINY_PNG.length,
      }),
    ).toBe('.png');
  });

  it('rejects a text file labeled as a png', () => {
    const buffer = Buffer.from('nice');
    expect(
      logoExtension({ buffer, mimetype: 'image/png', size: buffer.length }),
    ).toBeUndefined();
  });

  it('stores the uploaded image path on the gym', async () => {
    const gym = {
      id: '11111111-1111-4111-8111-111111111111',
      ownerId: 'owner-1',
      status: 'setup_in_progress' as const,
      gymName: null,
      address: null,
      contact: null,
      timing: null,
      logoValue: null,
      contactEmail: null,
      description: null,
      mapsUrl: null,
    };
    const prisma = {
      gym: {
        findUnique: async () => ({ ...gym }),
        updateMany: async ({ data }: { data: { logoValue: string } }) => {
          Object.assign(gym, data);
          return { count: 1 };
        },
      },
    };
    const service = new GymsService(prisma as unknown as PrismaService);
    const saved = await service.saveLogo('owner-1', {
      buffer: TINY_PNG,
      mimetype: 'image/png',
      size: TINY_PNG.length,
    });
    expect(saved.logoValue).toBe(
      `/uploads/gym-logos/${gym.id}.png`,
    );
    await rm(join(GYM_LOGO_DIRECTORY, `${gym.id}.png`), { force: true });
  });

  it('rejects a png labeled as a jpeg', () => {
    expect(
      logoExtension({
        buffer: TINY_PNG,
        mimetype: 'image/jpeg',
        size: TINY_PNG.length,
      }),
    ).toBeUndefined();
  });
});
