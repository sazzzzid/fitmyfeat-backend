import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import { TINY_PNG } from './helpers/tiny-png.js';
import {
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

const value = fc.string({
  minLength: 1,
  maxLength: 12,
  unit: fc.constantFrom(...'abcxyz '.split('')),
});

describe('gym status transitions', () => {
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

  it('Feature: gym-saas-foundation, Property 7: Pending only from complete setup, active only from review', async () => {
    const server = platform.app.getHttpServer();
    const admin = await adminToken(platform.app);
    await fc.assert(
      fc.asyncProperty(
        value,
        value,
        value,
        value,
        async (gymName, address, contact, timing) => {
          sequence += 1;
          const email = `status${sequence}@gym.test`;
          const password = 'status-password';
          await request(server)
            .post('/auth/register')
            .send({ email, password })
            .expect(201);
          const token = await signIn(platform.app, email, password);
          const auth = { Authorization: `Bearer ${token}` };
          const created = await request(server)
            .post('/gyms')
            .set(auth)
            .send({})
            .expect(201);
          await request(server)
            .post('/gyms/me/complete-setup')
            .set(auth)
            .expect(409)
            .expect({ statusCode: 409, message: 'Setup is incomplete' });
          const incomplete = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: created.body.id as string },
          });
          expect(incomplete.status).toBe('setup_in_progress');

          await request(server)
            .post('/gyms/me/logo')
            .set(auth)
            .attach('logo', TINY_PNG, { filename: 'logo.png', contentType: 'image/png' })
            .expect(200);
          await request(server)
            .patch('/gyms/me/profile')
            .set(auth)
            .send({ gymName, address, contact })
            .expect(200);
          await request(server)
            .patch('/gyms/me/setup')
            .set(auth)
            .send({ timing })
            .expect(200);
          const ready = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: created.body.id as string },
          });
          await request(server).post('/gyms/me/complete-setup').set(auth).expect(201);
          const pending = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: ready.id },
          });
          expect(pending.status).toBe('pending');
          expect(pending.gymName).toBe(ready.gymName);
          expect(pending.address).toBe(ready.address);
          expect(pending.contact).toBe(ready.contact);
          expect(pending.timing).toBe(ready.timing);
          expect(pending.logoValue).toBe(ready.logoValue);
          expect(pending.ownerId).toBe(ready.ownerId);

          await request(server)
            .patch('/gyms/me/profile')
            .set(auth)
            .send({ gymName: `${gymName}x` })
            .expect(409);
          await request(server)
            .patch('/gyms/me/setup')
            .set(auth)
            .send({ timing: `${timing}x` })
            .expect(409);
          await request(server).post('/gyms/me/complete-setup').set(auth).expect(409);
          await request(server).post('/gyms').set(auth).send({}).expect(409);
          await request(server)
            .post(`/gyms/${pending.id}/activate`)
            .set(auth)
            .expect(403);
          const stillPending = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: pending.id },
          });
          expect(stillPending.status).toBe('pending');
          expect(stillPending.gymName).toBe(pending.gymName);
          expect(stillPending.ownerId).toBe(pending.ownerId);

          const other = await platform.prisma.userAccount.create({
            data: {
              email: `other${sequence}@gym.test`,
              emailKey: `other${sequence}@gym.test`,
              passwordHash: stillPending.ownerId,
              roleId: (
                await platform.prisma.userAccount.findUniqueOrThrow({
                  where: { id: stillPending.ownerId },
                })
              ).roleId,
            },
          });
          const otherGym = await platform.prisma.gym.create({
            data: {
              ownerId: other.id,
              status: 'pending',
              gymName: 'Other',
              address: 'Other',
              contact: 'Other',
              timing: 'Other',
              logoValue: 'Other',
            },
          });
          await request(server)
            .post(`/gyms/${pending.id}/activate`)
            .set('Authorization', `Bearer ${admin}`)
            .expect(201);
          const active = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: pending.id },
          });
          expect(active.status).toBe('active');
          expect(active.gymName).toBe(pending.gymName);
          expect(active.address).toBe(pending.address);
          expect(active.contact).toBe(pending.contact);
          expect(active.timing).toBe(pending.timing);
          expect(active.logoValue).toBe(pending.logoValue);
          expect(active.ownerId).toBe(pending.ownerId);
          const untouched = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: otherGym.id },
          });
          expect(untouched.status).toBe('pending');
        },
      ),
      { numRuns: 100 },
    );
  }, 300_000);
});
