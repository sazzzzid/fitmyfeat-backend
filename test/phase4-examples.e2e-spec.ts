import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  activeGymOwner,
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('phase 4 acceptance examples', () => {
  let platform: GymPlatform;
  let admin: string;

  const server = () => platform.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
    admin = await adminToken(platform.app);
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    admin = await adminToken(platform.app);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('keeps registration on Gym_Owner and rejects staff role assignment', async () => {
    const registered = await request(server())
      .post('/auth/register')
      .send({ email: 'owner@gym.test', password: 'owner-password' })
      .expect(201);
    expect(registered.body).toEqual({ email: 'owner@gym.test', role: 'Gym_Owner' });
    await request(server())
      .put('/users/role')
      .set(as(admin))
      .send({ email: 'owner@gym.test', roleName: 'Gym_Staff' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Role assignment is not valid' });
  });

  it('covers staff validation, seats, templates, audit, and sign-in', async () => {
    const owner = await activeGymOwner(platform, 'owner@gym.test');
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    const end = new Date(Date.now() + 30 * 86_400_000);
    await platform.prisma.subscription.create({
      data: {
        gymId: owner.gymId,
        planId: plan.id,
        status: 'active',
        planName: 'Pro',
        priceMonthlyPaise: 100,
        featureFlags: [],
        maxMembers: null,
        maxStaff: 2,
        maxBranches: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: end,
      },
    });

    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({ email: 'bad', password: 'x', fullName: ' ', title: 'coach', template: 'Staff' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Staff values are not valid' });
    await request(server())
      .patch('/role-templates/Owner')
      .set(as(admin))
      .send({})
      .expect(400)
      .expect({ statusCode: 400, message: 'Role template values are not valid' });
    await request(server())
      .get('/audit-log')
      .set(as(owner.token))
      .expect(400)
      .expect({ statusCode: 400, message: 'Audit log scope is not valid' });

    const created = await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'ria@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'accountant',
        template: 'Staff',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      email: 'ria@gym.test',
      template: 'Staff',
      view: true,
      create: false,
      manage: false,
      disabled: false,
    });
    expect(created.body).not.toHaveProperty('password');
    expect(created.body).not.toHaveProperty('passwordHash');

    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'ria@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'trainer',
        template: 'Staff',
      })
      .expect(409)
      .expect({ statusCode: 409, message: 'Email_Address is already used' });
    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'second@gym.test',
        password: 'staff-password',
        fullName: 'Second',
        title: 'trainer',
        template: 'Staff',
      })
      .expect(201);
    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'third@gym.test',
        password: 'staff-password',
        fullName: 'Third',
        title: 'trainer',
        template: 'Staff',
      })
      .expect(409)
      .expect({ statusCode: 409, message: 'Staff limit reached' });

    await request(server())
      .put('/users/role')
      .set(as(admin))
      .send({ email: 'ria@gym.test', roleName: 'Gym_Owner' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Staff role cannot be changed' });

    await request(server())
      .patch(`/staff/${created.body.id}`)
      .set(as(owner.token))
      .send({ view: false })
      .expect(200);
    const staffToken = await signIn(platform.app, 'ria@gym.test', 'staff-password');
    await request(server())
      .get('/members')
      .set(as(staffToken))
      .expect(403)
      .expect({ statusCode: 403, message: 'Permission is disabled' });
    await request(server()).get('/members').set(as(owner.token)).expect(200);
    await request(server()).get('/dashboard').set(as(staffToken)).expect(403);
    await request(server()).get('/roles').set(as(staffToken)).expect(403);

    const me = await request(server()).get('/auth/me').set(as(staffToken)).expect(200);
    expect(me.body.staff).toMatchObject({ view: false, disabled: false });
    const ownerMe = await request(server()).get('/auth/me').set(as(owner.token)).expect(200);
    expect(ownerMe.body).not.toHaveProperty('staff');

    await request(server())
      .post(`/staff/${created.body.id}/enable`)
      .set(as(owner.token))
      .expect(409)
      .expect({ statusCode: 409, message: 'Staff member is not disabled' });
    await request(server())
      .post(`/staff/${created.body.id}/disable`)
      .set(as(owner.token))
      .expect(200);
    await request(server())
      .post(`/staff/${created.body.id}/disable`)
      .set(as(owner.token))
      .expect(409)
      .expect({ statusCode: 409, message: 'Staff member is already disabled' });
    await request(server())
      .post('/auth/sign-in')
      .send({ email: 'ria@gym.test', password: 'wrong-password' })
      .expect(401)
      .expect({
        statusCode: 401,
        message: 'Email_Address and password do not match a User_Account',
      });
    await request(server())
      .post('/auth/sign-in')
      .send({ email: 'ria@gym.test', password: 'staff-password' })
      .expect(403)
      .expect({ statusCode: 403, message: 'Staff account is disabled' });

    await request(server())
      .patch('/role-templates/Staff')
      .set(as(admin))
      .send({ create: true, manage: true })
      .expect(200);
    const stored = await platform.prisma.staffMember.findUniqueOrThrow({
      where: { id: created.body.id as string },
    });
    expect(stored.canCreate).toBe(false);
    expect(stored.canManage).toBe(false);

    const gymAudit = await request(server())
      .get('/audit-log')
      .query({ scope: 'gym' })
      .set(as(owner.token))
      .expect(200);
    expect(gymAudit.body.entries.some((entry: { action: string }) => entry.action === 'staff_created')).toBe(
      true,
    );
    const platformAudit = await request(server())
      .get('/audit-log')
      .query({ scope: 'platform' })
      .set(as(admin))
      .expect(200);
    expect(
      platformAudit.body.entries.every(
        (entry: { action: string }) => entry.action === 'template_updated',
      ),
    ).toBe(true);
    expect(JSON.stringify(gymAudit.body)).not.toContain('staff-password');

    await request(server())
      .patch('/staff/not-a-uuid')
      .set(as(owner.token))
      .send({ fullName: 'Nope' })
      .expect(404)
      .expect({ statusCode: 404, message: 'Staff member was not found' });
  });

  it('rejects staff management without a gym and before the gym is active', async () => {
    await request(server())
      .post('/auth/register')
      .send({ email: 'new@gym.test', password: 'owner-password' })
      .expect(201);
    const token = await signIn(platform.app, 'new@gym.test', 'owner-password');
    await request(server())
      .post('/staff')
      .set(as(token))
      .send({
        email: 'ria@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'trainer',
        template: 'Staff',
      })
      .expect(404)
      .expect({ statusCode: 404, message: 'Gym was not found' });
    await request(server()).post('/gyms').set(as(token)).expect(201);
    await request(server())
      .post('/staff')
      .set(as(token))
      .send({
        email: 'ria@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'trainer',
        template: 'Staff',
      })
      .expect(409)
      .expect({ statusCode: 409, message: 'Staff management requires an active gym' });
  });
});
