import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from './gyms.service.js';

const PROFILE_INVALID = 'Gym profile values are not valid';
const LOCKED =
  'Gym profile and basic setup cannot be changed while status is pending or active';

interface GymRow {
  id: string;
  ownerId: string;
  status: 'setup_in_progress' | 'pending' | 'active';
  gymName: string | null;
  address: string | null;
  contact: string | null;
  timing: string | null;
  logoValue: string | null;
  contactEmail: string | null;
  description: string | null;
  mapsUrl: string | null;
}

function harness(partial: Partial<GymRow> = {}, missing = false) {
  const gym: GymRow = {
    id: 'gym-1',
    ownerId: 'owner-1',
    status: 'setup_in_progress',
    gymName: 'Name',
    address: 'Addr',
    contact: '555',
    timing: '9-5',
    logoValue: 'logo',
    contactEmail: 'kept@gym.test',
    description: 'Kept',
    mapsUrl: 'https://maps.example/kept',
    ...partial,
  };
  const updateMany = vi.fn(async ({ data }: { data: Partial<GymRow> }) => {
    Object.assign(gym, data);
    return { count: 1 };
  });
  const prisma = {
    gym: {
      findUnique: vi.fn(async () => (missing ? null : { ...gym })),
      updateMany,
    },
  };
  return {
    gym,
    updateMany,
    service: new GymsService(prisma as unknown as PrismaService),
  };
}

const ready = {
  gymName: 'Name',
  address: 'Addr',
  contact: '555',
  timing: '9-5',
  logoValue: 'nice',
  contactEmail: null,
  description: null,
  mapsUrl: null,
};

describe('gym profile fields', () => {
  it('stores a cased email, a whitespace description, and an https map link', async () => {
    const { service, gym } = harness({
      contactEmail: null,
      description: null,
      mapsUrl: null,
    });
    const description = `${'a'.repeat(499)} `;
    await service.updateProfile('owner-1', {
      contactEmail: 'Owner@Gym.Test',
      description,
      mapsUrl: 'HTTPS://maps.example/place?q=1',
    });
    expect(gym.contactEmail).toBe('Owner@Gym.Test');
    expect(gym.description).toBe(description);
    expect(gym.mapsUrl).toBe('HTTPS://maps.example/place?q=1');
    expect(gym.logoValue).toBe('logo');
    expect(gym.status).toBe('setup_in_progress');
  });

  it.each([
    'nope',
    '',
    'a@',
    '@b.co',
    'a@b c',
    'a@b@c.co',
    `a@${'b'.repeat(253)}`,
    12,
    { email: 'a@b.co' },
  ])('rejects contactEmail %j and writes nothing', async (contactEmail) => {
    const { service, gym, updateMany } = harness();
    await expect(
      service.updateProfile('owner-1', { contactEmail }),
    ).rejects.toThrow(new BadRequestException(PROFILE_INVALID));
    expect(updateMany).not.toHaveBeenCalled();
    expect(gym.contactEmail).toBe('kept@gym.test');
  });

  it('accepts an email of 254 characters and a description of 500', async () => {
    const { service, gym } = harness();
    const contactEmail = `a@${'b'.repeat(252)}`;
    const description = 'd'.repeat(500);
    expect(contactEmail).toHaveLength(254);
    await service.updateProfile('owner-1', { contactEmail, description });
    expect(gym.contactEmail).toBe(contactEmail);
    expect(gym.description).toBe(description);
  });

  it.each(['', 'd'.repeat(501)])(
    'rejects description %j',
    async (description) => {
      const { service, updateMany } = harness();
      await expect(
        service.updateProfile('owner-1', { description }),
      ).rejects.toThrow(PROFILE_INVALID);
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    'javascript:alert(1)',
    'javascript://evil.example',
    'http://maps.example/place',
    'HTTP://maps.example/place',
    'data:text/html,hi',
    'https:example.com',
    '',
    'https://',
    `https://example.com/${'a'.repeat(2030)}`,
  ])('rejects mapsUrl %j', async (mapsUrl) => {
    const { service, gym, updateMany } = harness();
    await expect(service.updateProfile('owner-1', { mapsUrl })).rejects.toThrow(
      PROFILE_INVALID,
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(gym.mapsUrl).toBe('https://maps.example/kept');
  });

  it('accepts a map link of 2048 characters', async () => {
    const { service, gym } = harness();
    const mapsUrl = `https://example.com/${'a'.repeat(2028)}`;
    expect(mapsUrl).toHaveLength(2048);
    await service.updateProfile('owner-1', { mapsUrl });
    expect(gym.mapsUrl).toBe(mapsUrl);
  });

  it('null clears one optional field and leaves the others', async () => {
    const { service, gym, updateMany } = harness();
    await service.updateProfile('owner-1', { contactEmail: null });
    expect(gym.contactEmail).toBeNull();
    expect(gym.description).toBe('Kept');
    expect(gym.mapsUrl).toBe('https://maps.example/kept');
    expect(gym.gymName).toBe('Name');
    expect(updateMany.mock.calls[0]?.[0].data).toEqual({ contactEmail: null });
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty('status');
  });

  it('does not clear a setup field with null and does not let setup change optional fields', async () => {
    const { service, gym, updateMany } = harness();
    await expect(
      service.updateProfile('owner-1', { address: null }),
    ).rejects.toThrow(
      new BadRequestException(
        'Submitted gym value must contain at least one character',
      ),
    );
    await expect(
      service.updateProfile('owner-1', { logoValue: '' }),
    ).rejects.toThrow(
      'Submitted gym value must contain at least one character',
    );
    expect(gym.logoValue).toBe('logo');
    expect(updateMany).not.toHaveBeenCalled();
    await service.updateSetup('owner-1', {
      timing: '10-6',
      contactEmail: null,
      description: 'ignored',
    });
    expect(gym.timing).toBe('10-6');
    expect(gym.contactEmail).toBe('kept@gym.test');
    expect(gym.description).toBe('Kept');
  });

  it('completes setup when the optional fields are null and refuses when a setup field is missing', async () => {
    const open = harness({
      ...ready,
      timing: null,
      description: 'Filled',
      mapsUrl: 'https://maps.example/a',
    });
    await expect(open.service.completeSetup('owner-1')).rejects.toThrow(
      'Setup is incomplete',
    );
    expect(open.gym.status).toBe('setup_in_progress');
    expect(open.updateMany).not.toHaveBeenCalled();

    const done = harness(ready);
    await expect(done.service.completeSetup('owner-1')).resolves.toMatchObject({
      status: 'pending',
      contactEmail: null,
      description: null,
      mapsUrl: null,
      logoValue: 'nice',
    });
    expect(done.gym.status).toBe('pending');
  });

  it.each(['pending' as const, 'active' as const])(
    'locks the optional fields while the gym is %s',
    async (status) => {
      const { service, gym, updateMany } = harness({ status });
      await expect(
        service.updateProfile('owner-1', {
          contactEmail: 'new@gym.test',
          description: 'New',
          mapsUrl: 'https://maps.example/new',
        }),
      ).rejects.toThrow(new ConflictException(LOCKED));
      await expect(
        service.updateProfile('owner-1', { description: null }),
      ).rejects.toThrow(LOCKED);
      expect(updateMany).not.toHaveBeenCalled();
      expect(gym.contactEmail).toBe('kept@gym.test');
      expect(gym.description).toBe('Kept');
      expect(gym.mapsUrl).toBe('https://maps.example/kept');
    },
  );
});
