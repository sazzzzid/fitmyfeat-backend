import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('phase 1 acceptance examples', () => {
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

  it('rejects an invalid registration email and creates no user', async () => {
    const before = await platform.prisma.userAccount.count();
    await request(platform.app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'secret' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Email_Address is not valid' });
    expect(await platform.prisma.userAccount.count()).toBe(before);
  });

  it('rejects an empty sign-in password and returns no token', async () => {
    await request(platform.app.getHttpServer())
      .post('/auth/sign-in')
      .send({ email: 'admin@gym.test', password: '' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Sign-in input is invalid' })
      .expect((response) => {
        expect(response.body.accessToken).toBeUndefined();
      });
  });

  it('returns an empty owner profile before any put and inserts no row', async () => {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email: 'profile@gym.test', password: 'profile-password' })
      .expect(201);
    const token = await signIn(platform.app, 'profile@gym.test', 'profile-password');
    await request(server)
      .get('/owner-profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ displayName: '', contact: '' });
    expect(await platform.prisma.ownerProfile.count()).toBe(0);
  }, 30_000);

  it('rejects setup completion while one field is still null', async () => {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email: 'setup@gym.test', password: 'setup-password' })
      .expect(201);
    const token = await signIn(platform.app, 'setup@gym.test', 'setup-password');
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(server).post('/gyms').set(auth).send({}).expect(201);
    await request(server)
      .patch('/gyms/me/profile')
      .set(auth)
      .send({ gymName: 'Named', address: 'Addr', contact: '555' })
      .expect(200);
    await request(server)
      .post('/gyms/me/complete-setup')
      .set(auth)
      .expect(409)
      .expect({ statusCode: 409, message: 'Setup is incomplete' });
    const gym = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: created.body.id as string },
    });
    expect(gym.status).toBe('setup_in_progress');
    expect(gym.timing).toBeNull();
  }, 30_000);

  it('rejects activation of a gym that is not pending', async () => {
    const server = platform.app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ email: 'early@gym.test', password: 'early-password' })
      .expect(201);
    const token = await signIn(platform.app, 'early@gym.test', 'early-password');
    const created = await request(server)
      .post('/gyms')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const admin = await adminToken(platform.app);
    await request(server)
      .post(`/gyms/${created.body.id}/activate`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(409)
      .expect({ statusCode: 409, message: 'Only a pending gym can be activated' });
  }, 30_000);

  it('rejects an exact role-name collision and keeps case distinct', async () => {
    const server = platform.app.getHttpServer();
    const admin = await adminToken(platform.app);
    const auth = { Authorization: `Bearer ${admin}` };
    await request(server)
      .post('/roles')
      .set(auth)
      .send({ name: 'Coach' })
      .expect(201);
    await request(server)
      .post('/roles')
      .set(auth)
      .send({ name: 'Coach' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Role name is already used' });
    await request(server)
      .post('/roles')
      .set(auth)
      .send({ name: 'coach' })
      .expect(201);
  });

  it('returns dashboard counts without revenue or attendance', async () => {
    const admin = await adminToken(platform.app);
    const response = await request(platform.app.getHttpServer())
      .get('/dashboard')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(response.body).not.toHaveProperty('revenue');
    expect(response.body).not.toHaveProperty('attendance');
    expect(Object.keys(response.body)).toEqual([
      'userCount',
      'setupInProgressCount',
      'pendingCount',
      'activeCount',
    ]);
  });
});
