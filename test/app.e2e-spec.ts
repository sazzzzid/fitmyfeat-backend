import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('AppController (e2e)', () => {
  let platform: GymPlatform;

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('GET / without Authorization returns Hello World', async () => {
    await request(platform.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('registers and signs in without a prior token', async () => {
    const email = 'new-owner@gym.test';
    const password = 'owner-password';
    await request(platform.app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({ email, role: 'Gym_Owner' });
      });
    await request(platform.app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email, password })
      .expect(200)
      .expect((response) => {
        expect(typeof response.body.accessToken).toBe('string');
      });
  }, 30_000);
});
