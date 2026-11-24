import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('registration concurrency', () => {
  let platform: GymPlatform;
  let sequence = 0;

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    sequence = 0;
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('Feature: gym-saas-foundation, Property 2: Case-insensitive email uniqueness under concurrency', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        sequence += 1;
        const local = `owner${sequence}${Date.now().toString(36)}`;
        const lower = `${local}@gym.test`;
        const upper = `${local.toUpperCase()}@GYM.TEST`;
        const passwords = ['first-password', 'second-password'] as const;
        const submissions = [
          { email: `  ${lower}  `, password: passwords[0] },
          { email: upper, password: passwords[1] },
        ];
        const responses = await Promise.all(
          submissions.map((body) =>
            request(platform.app.getHttpServer()).post('/auth/register').send(body),
          ),
        );
        const created = responses.filter((response) => response.status === 201);
        const rejected = responses.filter((response) => response.status === 409);
        expect(created).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.body.message).toBe('Email_Address is already used');
        const users = await platform.prisma.userAccount.findMany({
          where: { emailKey: `${local}@gym.test` },
        });
        expect(users).toHaveLength(1);
        const winnerIndex = submissions.findIndex(
          (submission) => submission.email.trim() === users[0]?.email,
        );
        expect(winnerIndex).toBeGreaterThanOrEqual(0);
        const winner = submissions[winnerIndex];
        expect(users[0]?.email).toBe(winner?.email.trim());
        expect(users[0]?.roleId).toBeTruthy();
        const gyms = await platform.prisma.gym.count({
          where: { ownerId: users[0]?.id },
        });
        expect(gyms).toBe(0);
        const role = await platform.prisma.role.findUnique({
          where: { id: users[0]?.roleId },
        });
        expect(role?.name).toBe('Gym_Owner');
      }),
      { numRuns: 20 },
    );
  }, 180_000);
});
