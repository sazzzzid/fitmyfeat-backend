import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { GymsService } from './gyms.service.js';

const fieldValue = fc.string({ minLength: 1, maxLength: 24 });

describe('gym column properties', () => {
  it('Feature: gym-saas-foundation, Property 5: Shared gym columns and unchanged setup status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fieldValue,
        fieldValue,
        fieldValue,
        fieldValue,
        async (address, contact, gymName, timing) => {
          const gym = {
            id: 'gym-1',
            ownerId: 'owner-1',
            status: 'setup_in_progress' as const,
            gymName: 'kept-name',
            address: 'kept-address',
            contact: 'kept-contact',
            timing: 'kept-timing',
            logoValue: 'kept-logo',
          };
          const writes: Array<Record<string, string>> = [];
          const prisma = {
            gym: {
              findUnique: async () => ({ ...gym }),
              updateMany: async ({
                data,
              }: {
                where: { status: string };
                data: Record<string, string>;
              }) => {
                writes.push(data);
                Object.assign(gym, data);
                return { count: 1 };
              },
            },
          };
          const service = new GymsService(prisma as unknown as PrismaService);
          await service.updateProfile('owner-1', { address, contact, gymName });
          expect(writes[0]).toEqual({ address, contact, gymName });
          expect(writes[0]).not.toHaveProperty('timing');
          expect(writes[0]).not.toHaveProperty('logoValue');
          expect(writes[0]).not.toHaveProperty('status');
          expect(gym.timing).toBe('kept-timing');
          expect(gym.logoValue).toBe('kept-logo');
          expect(gym.status).toBe('setup_in_progress');

          await service.updateSetup('owner-1', { address, contact, gymName });
          expect(writes[1]).toEqual({ address, contact, gymName });
          expect(writes[1]).not.toHaveProperty('logoValue');
          expect(writes[1]).not.toHaveProperty('timing');
          expect(gym.logoValue).toBe('kept-logo');
          expect(gym.status).toBe('setup_in_progress');

          await service.updateSetup('owner-1', { timing });
          expect(writes[2]).toEqual({ timing });
          expect(gym.address).toBe(address);
          expect(gym.contact).toBe(contact);
          expect(gym.gymName).toBe(gymName);
          expect(gym.timing).toBe(timing);
          expect(gym.status).toBe('setup_in_progress');
        },
      ),
      { numRuns: 100 },
    );
  });
});
