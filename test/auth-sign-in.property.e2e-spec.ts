import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

const statuses = ['none', 'setup_in_progress', 'pending', 'active'] as const;

describe('sign-in properties', () => {
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

  it('Feature: gym-saas-foundation, Property 3: Sign-in JWT and one mismatch error', async () => {
    const server = platform.app.getHttpServer();
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...statuses),
        fc.string({
          minLength: 1,
          maxLength: 8,
          unit: fc.constantFrom(...'abcdefghijk'.split('')),
        }),
        async (status, extra) => {
          sequence += 1;
          const email = `signer${sequence}@gym.test`;
          const password = `pw-${extra}-${sequence}`;
          await request(server)
            .post('/auth/register')
            .send({ email, password })
            .expect(201);
          const user = await platform.prisma.userAccount.findUniqueOrThrow({
            where: { emailKey: email },
          });
          if (status !== 'none') {
            const gym = await platform.prisma.gym.create({
              data: {
                ownerId: user.id,
                status:
                  status === 'none' ? 'setup_in_progress' : status,
                gymName: status === 'setup_in_progress' ? null : 'Named',
                address: status === 'setup_in_progress' ? null : 'Addr',
                contact: status === 'setup_in_progress' ? null : '555',
                timing: status === 'setup_in_progress' ? null : '9-5',
                logoValue: status === 'setup_in_progress' ? null : 'logo',
              },
            });
            expect(gym.status).toBe(status);
          }
          const before = await platform.prisma.userAccount.findUniqueOrThrow({
            where: { id: user.id },
          });
          const signedIn = await request(server)
            .post('/auth/sign-in')
            .send({ email: ` ${email.toUpperCase()} `, password })
            .expect(200);
          const payload = JSON.parse(
            Buffer.from(
              String(signedIn.body.accessToken).split('.')[1] ?? '',
              'base64url',
            ).toString(),
          ) as { sub: string };
          expect(payload.sub).toBe(user.id);
          const after = await platform.prisma.userAccount.findUniqueOrThrow({
            where: { id: user.id },
          });
          expect(after.email).toBe(before.email);
          expect(after.passwordHash).toBe(before.passwordHash);
          expect(after.roleId).toBe(before.roleId);

          const beforeFailures = await platform.prisma.userAccount.findMany({
            orderBy: { email: 'asc' },
          });
          const unknown = await request(server)
            .post('/auth/sign-in')
            .send({ email: `missing${sequence}@gym.test`, password });
          const wrong = await request(server)
            .post('/auth/sign-in')
            .send({ email, password: `${password}-no` });
          expect(unknown.status).toBe(wrong.status);
          expect(unknown.body).toEqual(wrong.body);
          expect(unknown.status).toBe(401);
          expect(unknown.body.message).toBe(
            'Email_Address and password do not match a User_Account',
          );
          expect(unknown.body.accessToken).toBeUndefined();
          const afterFailures = await platform.prisma.userAccount.findMany({
            orderBy: { email: 'asc' },
          });
          expect(afterFailures).toEqual(beforeFailures);
        },
      ),
      { numRuns: 100 },
    );

    const ownerEmail = 'claim-owner@gym.test';
    const ownerPassword = 'claim-password';
    await request(server)
      .post('/auth/register')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(201);
    const owner = await platform.prisma.userAccount.findUniqueOrThrow({
      where: { emailKey: ownerEmail },
    });
    const forged = platform.app.get(JwtService).sign({
      sub: owner.id,
      permission: 'view_dashboard',
    });
    await request(server)
      .get('/dashboard')
      .set('Authorization', `Bearer ${forged}`)
      .expect(403)
      .expect({ statusCode: 403, message: 'Permission is disabled' });
  }, 300_000);
});
