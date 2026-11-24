import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  applyMigrations,
  adminToken,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('gym creation', () => {
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

  it('Feature: gym-saas-foundation, Property 4: One gym per owner', async () => {
    const server = platform.app.getHttpServer();
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        sequence += 1;
        const email = `creator${sequence}@gym.test`;
        const password = 'creator-password';
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
        expect(created.body.status).toBe('setup_in_progress');
        expect(created.body.gymName).toBeNull();
        expect(created.body.address).toBeNull();
        expect(created.body.contact).toBeNull();
        expect(created.body.timing).toBeNull();
        expect(created.body.logoValue).toBeNull();
        expect(created.body.contactEmail).toBeNull();
        expect(created.body.description).toBeNull();
        expect(created.body.mapsUrl).toBeNull();
        const owner = await platform.prisma.userAccount.findUniqueOrThrow({
          where: { emailKey: email },
        });
        expect(created.body.id).toBeTruthy();
        const row = await platform.prisma.gym.findUniqueOrThrow({
          where: { ownerId: owner.id },
        });
        expect(row.ownerId).toBe(owner.id);

        for (const status of [
          'setup_in_progress',
          'pending',
          'active',
        ] as const) {
          await platform.prisma.gym.update({
            where: { id: row.id },
            data: { status },
          });
          await request(server)
            .post('/gyms')
            .set(auth)
            .send({})
            .expect(409)
            .expect({ statusCode: 409, message: 'Gym already exists' });
          const unchanged = await platform.prisma.gym.findUniqueOrThrow({
            where: { id: row.id },
          });
          expect(unchanged.status).toBe(status);
        }

        const otherEmail = `racer${sequence}@gym.test`;
        await request(server)
          .post('/auth/register')
          .send({ email: otherEmail, password })
          .expect(201);
        const otherToken = await signIn(platform.app, otherEmail, password);
        const otherAuth = { Authorization: `Bearer ${otherToken}` };
        const raced = await Promise.all([
          request(server).post('/gyms').set(otherAuth).send({}),
          request(server).post('/gyms').set(otherAuth).send({}),
        ]);
        const successes = raced.filter((response) => response.status === 201);
        const conflicts = raced.filter((response) => response.status === 409);
        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]?.body.message).toBe('Gym already exists');
        const other = await platform.prisma.userAccount.findUniqueOrThrow({
          where: { emailKey: otherEmail },
        });
        expect(
          await platform.prisma.gym.count({ where: { ownerId: other.id } }),
        ).toBe(1);
      }),
      { numRuns: 20 },
    );
    expect(await adminToken(platform.app)).toEqual(expect.any(String));
  }, 300_000);
});
