import bcrypt from 'bcrypt';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuthService } from './auth.service.js';

const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

const emailArbitrary = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...letters) }),
    fc.string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...letters) }),
  )
  .map(([local, domain]) => `${local}@${domain}.test`);

const passwordArbitrary = fc.string({
  minLength: 1,
  maxLength: 24,
  unit: fc.constantFrom(...letters, ' '),
});

describe('registration properties', () => {
  it('Feature: gym-saas-foundation, Property 1: Registration stores a bcrypt hash and no session', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArbitrary,
        passwordArbitrary,
        async (email, password) => {
          const created: Array<{ passwordHash: string }> = [];
          const prisma = {
            role: {
              findUnique: vi.fn(async () => ({
                id: 'role-id',
                name: 'Gym_Owner',
              })),
            },
            userAccount: {
              create: vi.fn(async ({ data }) => {
                created.push(data);
                return { id: 'user-id', email: data.email, ...data };
              }),
            },
          };
          const jwt = { sign: vi.fn(), signAsync: vi.fn() };
          const service = new AuthService(
            prisma as unknown as PrismaService,
            jwt as never,
          );
          const body = await service.register(email, password);
          expect(created).toHaveLength(1);
          expect(created[0]?.passwordHash).not.toBe(password);
          expect(
            await bcrypt.compare(password, created[0]?.passwordHash ?? ''),
          ).toBe(true);
          expect(body).toEqual({ email, role: 'Gym_Owner' });
          expect(body).not.toHaveProperty('password');
          expect(body).not.toHaveProperty('accessToken');
          expect(jwt.sign).not.toHaveBeenCalled();
          expect(jwt.signAsync).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  }, 180_000);
});
