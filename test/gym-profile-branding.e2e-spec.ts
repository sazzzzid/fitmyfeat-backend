import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { TINY_PNG } from './helpers/tiny-png.js';
import {
  activeGymOwner,
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('gym profile fields', () => {
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

  async function owner(email: string) {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email, password: 'owner-password' })
      .expect(201);
    const token = await signIn(platform.app, email, 'owner-password');
    const created = await request(server)
      .post('/gyms')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    return {
      server,
      token,
      auth: { Authorization: `Bearer ${token}` },
      gymId: created.body.id as string,
    };
  }

  it('returns null optional fields on a new gym', async () => {
    const { server, auth } = await owner('brand-new@gym.test');
    const mine = await request(server).get('/gyms/me').set(auth).expect(200);
    expect(mine.body.contactEmail).toBeNull();
    expect(mine.body.description).toBeNull();
    expect(mine.body.mapsUrl).toBeNull();
  });

  it('clears an optional field with null and still completes setup', async () => {
    const { server, auth, gymId } = await owner('profile@gym.test');
    const logo = await request(server)
      .post('/gyms/me/logo')
      .set(auth)
      .attach('logo', TINY_PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(200);
    expect(logo.body.logoValue).toBe(`/uploads/gym-logos/${gymId}.png`);
    await request(server)
      .patch('/gyms/me/profile')
      .set(auth)
      .send({
        gymName: 'Iron',
        address: '1 Main',
        contact: '555',
        contactEmail: 'Owner@Gym.Test',
        description: 'A small gym',
        mapsUrl: 'https://maps.example/iron',
      })
      .expect(200);
    await request(server)
      .patch('/gyms/me/profile')
      .set(auth)
      .send({ logoValue: 'nice' })
      .expect(400);
    await request(server)
      .patch('/gyms/me/profile')
      .set(auth)
      .send({ contactEmail: null })
      .expect(200)
      .expect((response) => {
        expect(response.body.contactEmail).toBeNull();
        expect(response.body.description).toBe('A small gym');
        expect(response.body.mapsUrl).toBe('https://maps.example/iron');
        expect(response.body.logoValue).toBe(`/uploads/gym-logos/${gymId}.png`);
      });
    await request(server)
      .patch('/gyms/me/setup')
      .set(auth)
      .send({ timing: '06:00-22:00' })
      .expect(200);
    await request(server)
      .patch('/gyms/me/setup')
      .set(auth)
      .send({ contactEmail: 'other@gym.test' })
      .expect(400)
      .expect({
        statusCode: 400,
        message: 'property contactEmail should not exist',
      });
    await request(server).post('/gyms/me/complete-setup').set(auth).expect(201);
    const gym = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: gymId },
    });
    expect(gym.status).toBe('pending');
    expect(gym.contactEmail).toBeNull();
    expect(gym.description).toBe('A small gym');
    expect(gym.mapsUrl).toBe('https://maps.example/iron');
  });

  it('rejects invalid profile values without writing', async () => {
    const { server, auth, gymId } = await owner('invalid@gym.test');
    const profile = (body: object) =>
      request(server).patch('/gyms/me/profile').set(auth).send(body);
    await profile({ contactEmail: 'nope' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Gym profile values are not valid' });
    await profile({ mapsUrl: 'javascript:alert(1)' }).expect(400).expect({
      statusCode: 400,
      message: 'Gym profile values are not valid',
    });
    await profile({ mapsUrl: 'http://maps.example' }).expect(400).expect({
      statusCode: 400,
      message: 'Gym profile values are not valid',
    });
    await profile({ description: '' }).expect(400).expect({
      statusCode: 400,
      message: 'Gym profile values are not valid',
    });
    await profile({ address: '' }).expect(400).expect({
      statusCode: 400,
      message: 'Submitted gym value must contain at least one character',
    });
    await profile({ address: null }).expect(400).expect({
      statusCode: 400,
      message: 'Submitted gym value must contain at least one character',
    });
    const gym = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: gymId },
    });
    expect(gym.contactEmail).toBeNull();
    expect(gym.description).toBeNull();
    expect(gym.mapsUrl).toBeNull();
    expect(gym.address).toBeNull();
  });

  it('locks profile fields on an active gym', async () => {
    const { token, gymId } = await activeGymOwner(
      platform,
      'active-brand@gym.test',
    );
    const server = platform.app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    await request(server)
      .patch('/gyms/me/profile')
      .set(auth)
      .send({ description: 'Later' })
      .expect(409)
      .expect({
        statusCode: 409,
        message:
          'Gym profile and basic setup cannot be changed while status is pending or active',
      });
    const gym = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: gymId },
    });
    expect(gym.status).toBe('active');
    expect(gym.gymName).toBe('Iron Works');
    expect(gym.description).toBeNull();
    expect(await platform.prisma.subscription.count({ where: { gymId } })).toBe(
      0,
    );
  });

  it('does not change another owner gym', async () => {
    const first = await owner('owner-a@gym.test');
    const second = await owner('owner-b@gym.test');
    await request(first.server)
      .patch('/gyms/me/profile')
      .set(first.auth)
      .send({ description: 'Gym A' })
      .expect(200);
    await request(second.server)
      .patch('/gyms/me/profile')
      .set(second.auth)
      .send({ description: 'Gym B' })
      .expect(200);
    const gymA = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: first.gymId },
    });
    expect(gymA.description).toBe('Gym A');
    const gymB = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: second.gymId },
    });
    expect(gymB.description).toBe('Gym B');
  });

  it('returns 404 without a gym and 403 without manage_gym_setup', async () => {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email: 'no-gym@gym.test', password: 'owner-password' })
      .expect(201);
    const token = await signIn(
      platform.app,
      'no-gym@gym.test',
      'owner-password',
    );
    const auth = { Authorization: `Bearer ${token}` };
    await request(server)
      .get('/gyms/me')
      .set(auth)
      .expect(404)
      .expect({ statusCode: 404, message: 'Gym was not found' });

    await request(server).post('/gyms').set(auth).send({}).expect(201);
    const admin = await adminToken(platform.app);
    await request(server)
      .patch('/roles/permissions')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        roleName: 'Gym_Owner',
        permission: 'manage_gym_setup',
        state: 'disabled',
      })
      .expect(200);
    await request(server)
      .get('/gyms/me')
      .set(auth)
      .expect(403)
      .expect({ statusCode: 403, message: 'Permission is disabled' });
    await request(server)
      .patch('/gyms/me/profile')
      .set(auth)
      .send({ description: 'Later' })
      .expect(403)
      .expect({ statusCode: 403, message: 'Permission is disabled' });
  });
});
