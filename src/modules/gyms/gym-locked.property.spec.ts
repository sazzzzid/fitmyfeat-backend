import { ConflictException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from './gyms.service.js';

describe('locked gym properties', () => {
  it('Feature: gym-saas-foundation, Property 6: No profile or setup writes after submission', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending' as const, 'active' as const),
        fc.string({ minLength: 1, maxLength: 12 }),
        async (status, value) => {
          const gym = {
            id: 'gym-1',
            ownerId: 'owner-1',
            status,
            gymName: 'name',
            address: 'address',
            contact: 'contact',
            timing: 'timing',
            logoValue: 'logo',
          };
          const before = { ...gym };
          const updateMany = vi.fn();
          const prisma = {
            gym: {
              findUnique: async () => ({ ...gym }),
              updateMany,
            },
          };
          const service = new GymsService(prisma as unknown as PrismaService);
          await expect(
            service.updateProfile('owner-1', {
              address: value,
              contact: value,
              gymName: value,
              logoValue: value,
            }),
          ).rejects.toBeInstanceOf(ConflictException);
          await expect(
            service.updateSetup('owner-1', {
              timing: value,
              address: value,
              contact: value,
              gymName: value,
            }),
          ).rejects.toBeInstanceOf(ConflictException);
          expect(updateMany).not.toHaveBeenCalled();
          expect(gym).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
