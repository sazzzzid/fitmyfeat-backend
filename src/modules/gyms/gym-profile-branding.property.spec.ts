import { BadRequestException, ConflictException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { isValidEmailAddress } from '../../common/validation/email-address.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from './gyms.service.js';

const OPTIONAL = ['contactEmail', 'description', 'mapsUrl'] as const;
const SETUP = ['gymName', 'address', 'contact', 'timing', 'logoValue'] as const;

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

function harness(partial: Partial<GymRow> = {}) {
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
      findUnique: async () => ({ ...gym }),
      updateMany,
    },
  };
  return {
    gym,
    updateMany,
    service: new GymsService(prisma as unknown as PrismaService),
  };
}

const httpsUrl = fc
  .tuple(
    fc.constantFrom('https://', 'HTTPS://'),
    fc.domain(),
    fc.constantFrom('', '/path', '/maps?q=1'),
  )
  .map(([scheme, host, path]) => `${scheme}${host}${path}`)
  .filter((url) => url.length <= 2048);

describe('gym profile properties', () => {
  it('Feature: gym-profile-branding, Property 1: Null clears only the optional field that was sent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...OPTIONAL),
        fc.constantFrom(...OPTIONAL),
        async (filled, cleared) => {
          const { service, gym } = harness({
            contactEmail: null,
            description: null,
            mapsUrl: null,
          });
          const value =
            filled === 'contactEmail'
              ? 'a@b.co'
              : filled === 'description'
                ? 'About'
                : 'https://maps.example/a';
          await service.updateProfile('owner-1', { [filled]: value });
          expect(gym[filled]).toBe(value);
          await service.updateProfile('owner-1', { [cleared]: null });
          expect(gym[cleared]).toBeNull();
          if (filled !== cleared) {
            expect(gym[filled]).toBe(value);
          }
          for (const field of SETUP) {
            expect(gym[field]).toBe(
              field === 'gymName'
                ? 'Name'
                : field === 'address'
                  ? 'Addr'
                  : field === 'contact'
                    ? '555'
                    : field === 'timing'
                      ? '9-5'
                      : 'logo',
            );
          }
          expect(gym.status).toBe('setup_in_progress');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: gym-profile-branding, Property 2: A setup field cannot be cleared', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...SETUP), async (field) => {
        const { service, gym, updateMany } = harness();
        const before = { ...gym };
        const body = { [field]: null };
        const call =
          field === 'timing'
            ? service.updateSetup('owner-1', body)
            : service.updateProfile('owner-1', body);
        await expect(call).rejects.toBeInstanceOf(BadRequestException);
        expect(updateMany).not.toHaveBeenCalled();
        expect(gym).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it('Feature: gym-profile-branding, Property 3: Email, description, and https links follow their checks', async () => {
    const text = fc.string({ maxLength: 280 });
    await fc.assert(
      fc.asyncProperty(
        text,
        text,
        httpsUrl,
        async (email, description, mapsUrl) => {
          const { service, gym, updateMany } = harness();
          const before = { ...gym };
          if (isValidEmailAddress(email)) {
            await service.updateProfile('owner-1', { contactEmail: email });
            expect(gym.contactEmail).toBe(email);
          } else {
            await expect(
              service.updateProfile('owner-1', { contactEmail: email }),
            ).rejects.toThrow('Gym profile values are not valid');
            expect(gym).toEqual(before);
          }
          updateMany.mockClear();
          const saved = { ...gym };
          if (description.length >= 1 && description.length <= 500) {
            await service.updateProfile('owner-1', { description });
            expect(gym.description).toBe(description);
          } else {
            await expect(
              service.updateProfile('owner-1', { description }),
            ).rejects.toThrow('Gym profile values are not valid');
            expect(gym).toEqual(saved);
          }
          await service.updateProfile('owner-1', { mapsUrl });
          expect(gym.mapsUrl).toBe(mapsUrl);
          expect(gym.status).toBe('setup_in_progress');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: gym-profile-branding, Property 4: Optional fields do not decide setup completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SETUP),
        fc.boolean(),
        async (missing, fillOptional) => {
          const gymFields: Partial<GymRow> = {
            gymName: 'Name',
            address: 'Addr',
            contact: '555',
            timing: '9-5',
            logoValue: 'logo',
            contactEmail: fillOptional ? 'a@b.co' : null,
            description: fillOptional ? 'About' : null,
            mapsUrl: fillOptional ? 'https://maps.example/a' : null,
          };
          gymFields[missing] = null;
          const { service, gym, updateMany } = harness(gymFields);
          await expect(service.completeSetup('owner-1')).rejects.toThrow(
            'Setup is incomplete',
          );
          expect(updateMany).not.toHaveBeenCalled();
          expect(gym.status).toBe('setup_in_progress');

          const ready = harness({
            gymName: 'Name',
            address: 'Addr',
            contact: '555',
            timing: '9-5',
            logoValue: 'logo',
            contactEmail: fillOptional ? 'a@b.co' : null,
            description: fillOptional ? 'About' : null,
            mapsUrl: fillOptional ? 'https://maps.example/a' : null,
          });
          await ready.service.completeSetup('owner-1');
          expect(ready.gym.status).toBe('pending');
          expect(ready.gym.contactEmail).toBe(fillOptional ? 'a@b.co' : null);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: gym-profile-branding, Property 5: Optional profile writes are locked after submission', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending' as const, 'active' as const),
        fc.constantFrom(...OPTIONAL),
        fc.boolean(),
        async (status, field, clear) => {
          const { service, gym, updateMany } = harness({ status });
          const before = { ...gym };
          const value = clear
            ? null
            : field === 'contactEmail'
              ? 'new@gym.test'
              : field === 'description'
                ? 'New text'
                : 'https://maps.example/new';
          await expect(
            service.updateProfile('owner-1', { [field]: value }),
          ).rejects.toBeInstanceOf(ConflictException);
          expect(updateMany).not.toHaveBeenCalled();
          expect(gym).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Feature: gym-profile-branding, Property 6: A map link must be an absolute https URL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('http', 'javascript', 'data', 'file'),
        fc.domain(),
        async (scheme, host) => {
          const { service, gym, updateMany } = harness();
          const before = { ...gym };
          await expect(
            service.updateProfile('owner-1', {
              mapsUrl: `${scheme}://${host}/path`,
            }),
          ).rejects.toBeInstanceOf(BadRequestException);
          await expect(
            service.updateProfile('owner-1', {
              mapsUrl: 'javascript:alert(1)',
            }),
          ).rejects.toThrow('Gym profile values are not valid');
          expect(updateMany).not.toHaveBeenCalled();
          expect(gym).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
