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

describe('phase 6 acceptance examples', () => {
  let platform: GymPlatform;
  let admin: string;

  const server = () => platform.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const range = { from: '2026-11-01', to: '2026-11-30' };

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    admin = await adminToken(platform.app);
    await request(server())
      .patch('/plans/basic')
      .set(as(admin))
      .send({
        name: 'Basic',
        priceMonthlyPaise: 10_000,
        trialDays: 0,
        featureFlags: [],
        maxMembers: 20,
        maxStaff: 2,
        maxBranches: 1,
        isActive: true,
      })
      .expect(200);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('stores a manual send, runs expiry once per day, and hides analytics bodies', async () => {
    await request(server())
      .post('/message-templates')
      .set(as(admin))
      .send({ channel: 'sms', name: 'Remind', body: 'Hello {{unknown}}' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Message template values are not valid' });
    const template = await request(server())
      .post('/message-templates')
      .set(as(admin))
      .send({ channel: 'sms', name: 'Remind', body: 'Hi {{memberName}}' })
      .expect(201);
    await request(server())
      .post('/message-templates')
      .set(as(admin))
      .send({ channel: 'sms', name: 'Remind', body: 'Again' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Message template name is already used' });
    await request(server())
      .patch(`/message-templates/${template.body.id}`)
      .set(as(admin))
      .send({ channel: 'push' })
      .expect(400);

    const owner = await activeGymOwner(platform, 'comms-owner@gym.test');
    const pending = await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(owner.token))
      .send({ planCode: 'basic' })
      .expect(201);
    await request(server())
      .post(`/subscriptions/${pending.body.id}/mark-paid`)
      .set(as(admin))
      .expect(200);
    const product = await request(server())
      .post('/membership-products')
      .set(as(owner.token))
      .send({ name: 'Week', pricePaise: 1000, durationDays: 7 })
      .expect(201);
    const member = await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Asha Rao', contact: '55555555' })
      .expect(201);
    await request(server())
      .post(`/members/${member.body.id}/membership`)
      .set(as(owner.token))
      .send({
        productId: product.body.id,
        amountReceivedPaise: 1000,
        paidOn: '2026-11-23',
        method: 'cash',
      })
      .expect(201);

    const sent = await request(server())
      .post('/gym-communications/messages')
      .set(as(owner.token))
      .send({ memberId: member.body.id, templateId: template.body.id })
      .expect(201);
    expect(sent.body).toMatchObject({ status: 'sent', body: 'Hi Asha Rao', trigger: 'manual' });

    await request(server())
      .post(`/members/${member.body.id}/leave`)
      .set(as(owner.token))
      .expect(200);
    await request(server())
      .post('/gym-communications/messages')
      .set(as(owner.token))
      .send({ memberId: member.body.id, templateId: template.body.id })
      .expect(409)
      .expect({ statusCode: 409, message: 'Member has left' });
    await request(server())
      .post(`/members/${member.body.id}/restore`)
      .set(as(owner.token))
      .expect(200);

    await request(server())
      .put('/gym-communications/automations')
      .set(as(owner.token))
      .send({ expiry: { enabled: true, templateId: template.body.id } })
      .expect(200);
    const first = await request(server())
      .post('/gym-communications/run')
      .set(as(owner.token))
      .expect(200);
    expect(first.body.stored).toBe(1);
    const second = await request(server())
      .post('/gym-communications/run')
      .set(as(owner.token))
      .expect(200);
    expect(second.body.stored).toBe(0);

    const analytics = await request(server())
      .get('/communications/analytics')
      .query(range)
      .set(as(admin))
      .expect(200);
    expect(JSON.stringify(analytics.body)).not.toContain('Asha');
    expect(analytics.body.sent).toBeGreaterThan(0);
    await request(server())
      .get('/communications/analytics')
      .query(range)
      .set(as(owner.token))
      .expect(403);

    const staff = await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'comms-staff@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'reception',
        template: 'Staff',
      })
      .expect(201);
    expect(staff.body.email).toBe('comms-staff@gym.test');
    const staffToken = await signIn(platform.app, 'comms-staff@gym.test', 'staff-password');
    await request(server())
      .get('/gym-communications/messages')
      .query(range)
      .set(as(staffToken))
      .expect(403);
    await request(server()).get('/message-templates').set(as(staffToken)).expect(403);
  });
});
