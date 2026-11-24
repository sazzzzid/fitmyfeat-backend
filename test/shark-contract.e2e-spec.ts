import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import {
  activeGymOwner,
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('shark contract additions', () => {
  let platform: GymPlatform;
  let admin: string;

  const server = () => platform.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const today = new Date().toISOString().slice(0, 10);

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
        maxStaff: 5,
        maxBranches: 1,
        isActive: true,
      })
      .expect(200);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('keeps the full lists and pages, filters, and activity counts', async () => {
    const before = await request(server())
      .get('/dashboard/activity')
      .query({ from: today, to: today })
      .set(as(admin))
      .expect(200);
    const owner = await activeGymOwner(platform, 'Ann.Owner@gym.test');
    const other = await activeGymOwner(platform, 'other-owner@gym.test');
    for (const current of [owner, other]) {
      const pending = await request(server())
        .post('/subscriptions/me/plan-request')
        .set(as(current.token))
        .send({ planCode: 'basic' })
        .expect(201);
      await request(server())
        .post(`/subscriptions/${pending.body.id}/mark-paid`)
        .set(as(admin))
        .expect(200);
    }

    const dashboard = await request(server()).get('/dashboard').set(as(admin)).expect(200);
    expect(Object.keys(dashboard.body)).toEqual([
      'userCount',
      'setupInProgressCount',
      'pendingCount',
      'activeCount',
    ]);
    const activity = await request(server())
      .get('/dashboard/activity')
      .query({ from: today, to: today })
      .set(as(admin))
      .expect(200);
    expect(activity.body).toMatchObject({
      from: today,
      to: today,
      accountsCreated: before.body.accountsCreated + 2,
      gymsSubmitted: before.body.gymsSubmitted + 2,
      gymsActivated: before.body.gymsActivated + 2,
      subscriptionsStarted: before.body.subscriptionsStarted + 2,
    });
    const past = await request(server())
      .get('/dashboard/activity')
      .query({ from: '2000-01-01', to: '2000-01-02' })
      .set(as(admin))
      .expect(200);
    expect(past.body).toMatchObject({
      accountsCreated: 0,
      gymsSubmitted: 0,
      gymsActivated: 0,
      subscriptionsStarted: 0,
      subscriptionsExpired: 0,
    });
    const subscription = await platform.prisma.subscription.findFirstOrThrow({
      where: { gymId: owner.gymId, status: 'active' },
    });
    const expiryDay = subscription.expiredAt!.toISOString().slice(0, 10);
    expect(expiryDay).not.toBe(today);
    const expiry = await request(server())
      .get('/dashboard/activity')
      .query({ from: expiryDay, to: expiryDay })
      .set(as(admin))
      .expect(200);
    expect(expiry.body.subscriptionsExpired).toBeGreaterThan(0);
    expect(activity.body.subscriptionsExpired).toBe(0);
    expect(expiry.body.accountsCreated).toBe(0);
    await request(server())
      .get('/dashboard/activity')
      .query({ from: '2026-02-31', to: '2026-03-01' })
      .set(as(admin))
      .expect(400)
      .expect({ statusCode: 400, message: 'Query is not valid' });

    const product = await request(server())
      .post('/membership-products')
      .set(as(owner.token))
      .send({ name: 'Monthly', pricePaise: 1000, durationDays: 30 })
      .expect(201);
    const ann = await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Ann Zee', contact: '111222' })
      .expect(201);
    const bob = await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Bob Zee', contact: '333444' })
      .expect(201);
    for (const [member, paidOn] of [
      [ann.body.id, '2026-11-01'],
      [bob.body.id, '2026-11-20'],
    ] as const) {
      await request(server())
        .post(`/members/${member}/membership`)
        .set(as(owner.token))
        .send({
          productId: product.body.id,
          amountReceivedPaise: 400,
          paidOn,
          method: 'cash',
        })
        .expect(201);
    }
    await request(server())
      .post('/gym-finance/expenses')
      .set(as(owner.token))
      .send({ category: 'Rent', amountPaise: 100, paidOn: '2026-11-01' })
      .expect(201);
    await request(server())
      .post('/gym-finance/expenses')
      .set(as(owner.token))
      .send({ category: 'Power', amountPaise: 200, paidOn: '2026-11-20' })
      .expect(201);
    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'ria@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'reception',
        template: 'Staff',
      })
      .expect(201);
    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'leo@gym.test',
        password: 'staff-password',
        fullName: 'Leo Sen',
        title: 'trainer',
        template: 'Staff',
      })
      .expect(201);
    await request(server())
      .patch('/role-templates/Staff')
      .set(as(admin))
      .send({ create: true })
      .expect(200);
    await request(server())
      .patch('/role-templates/Staff')
      .set(as(admin))
      .send({ create: false })
      .expect(200);

    const lists = [
      { path: '/members', token: owner.token, key: 'members', id: 'id' },
      { path: '/users', token: admin, key: 'users', id: 'email' },
      { path: '/subscriptions', token: admin, key: 'subscriptions', id: 'id' },
      { path: '/audit-log', token: owner.token, key: 'entries', id: 'id', query: { scope: 'gym' } },
      { path: '/audit-log', token: admin, key: 'entries', id: 'id', query: { scope: 'platform' } },
      { path: '/platform-finance/payments', token: admin, key: 'payments', id: 'id' },
      { path: '/gym-finance/income', token: owner.token, key: 'payments', id: 'id' },
      { path: '/gym-finance/expenses', token: owner.token, key: 'expenses', id: 'id' },
      { path: '/gym-finance/outstanding', token: owner.token, key: 'members', id: 'memberId' },
    ] as const;
    for (const list of lists) {
      const extra = 'query' in list ? list.query : {};
      const full = await request(server())
        .get(list.path)
        .query(extra)
        .set(as(list.token))
        .expect(200);
      expect(full.body).not.toHaveProperty('nextCursor');
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page += 1) {
        const response = await request(server())
          .get(list.path)
          .query({ ...extra, limit: 1, ...(cursor ? { cursor } : {}) })
          .set(as(list.token))
          .expect(200);
        const rows = response.body[list.key] as Array<Record<string, string>>;
        expect(rows.length).toBeLessThanOrEqual(1);
        for (const row of rows) {
          seen.push(row[list.id]!);
        }
        if (response.body.nextCursor === null) {
          break;
        }
        expect(typeof response.body.nextCursor).toBe('string');
        cursor = response.body.nextCursor as string;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(
        (full.body[list.key] as Array<Record<string, string>>).map((row) => row[list.id]),
      );
      expect(seen.length).toBeGreaterThan(1);
    }

    const byName = await request(server())
      .get('/members')
      .query({ q: ' ann ', status: 'active' })
      .set(as(owner.token))
      .expect(200);
    expect(byName.body.members.map((row: { fullName: string }) => row.fullName)).toEqual([
      'Ann Zee',
    ]);
    expect(byName.body).not.toHaveProperty('nextCursor');
    const byContact = await request(server())
      .get('/members')
      .query({ q: '333', status: 'active' })
      .set(as(owner.token))
      .expect(200);
    expect(byContact.body.members.map((row: { fullName: string }) => row.fullName)).toEqual([
      'Bob Zee',
    ]);
    const left = await request(server())
      .get('/members')
      .query({ q: 'ann', status: 'left' })
      .set(as(owner.token))
      .expect(200);
    expect(left.body.members).toEqual([]);
    const blank = await request(server())
      .get('/members')
      .query({ q: '   ' })
      .set(as(owner.token))
      .expect(200);
    expect(blank.body.members).toHaveLength(2);

    const users = await request(server())
      .get('/users')
      .query({ q: 'ANN.OWNER' })
      .set(as(admin))
      .expect(200);
    expect(users.body.users).toEqual([{ email: 'Ann.Owner@gym.test', role: 'Gym_Owner' }]);

    const named = await request(server())
      .get('/subscriptions')
      .query({ q: 'iron works' })
      .set(as(admin))
      .expect(200);
    expect(named.body.subscriptions).toHaveLength(2);
    const byEmail = await request(server())
      .get('/subscriptions')
      .query({ q: 'other-owner@gym.test' })
      .set(as(admin))
      .expect(200);
    expect(byEmail.body.subscriptions).toHaveLength(1);

    const audit = await request(server())
      .get('/audit-log')
      .query({ scope: 'gym', from: '2026-11-01', to: today })
      .set(as(owner.token))
      .expect(200);
    expect(audit.body.entries.length).toBeGreaterThan(0);
    await request(server())
      .get('/audit-log')
      .query({ scope: 'gym', from: today, to: '2020-01-01' })
      .set(as(owner.token))
      .expect(400);

    const payments = await request(server())
      .get('/platform-finance/payments')
      .query({ from: today, to: today, gymId: owner.gymId })
      .set(as(admin))
      .expect(200);
    expect(payments.body.payments).toHaveLength(1);
    expect(payments.body.payments[0]).toMatchObject({
      gymId: owner.gymId,
      gymName: 'Iron Works',
      planName: 'Basic',
    });
    expect(payments.body.payments[0].subscriptionId).toEqual(expect.any(String));
    await request(server())
      .get('/platform-finance/payments')
      .query({ from: '1999-01-01', to: '1999-01-02' })
      .set(as(admin))
      .expect(200)
      .expect({ payments: [] });
    await platform.prisma.gym.update({
      where: { id: owner.gymId },
      data: { gymName: null },
    });
    const unnamed = await request(server())
      .get('/platform-finance/payments')
      .query({ gymId: owner.gymId })
      .set(as(admin))
      .expect(200);
    expect(unnamed.body.payments[0].gymName).toBeNull();
    expect(unnamed.body.payments[0].planName).toBe('Basic');

    const income = await request(server())
      .get('/gym-finance/income')
      .query({ from: '2026-11-20', to: '2026-11-20' })
      .set(as(owner.token))
      .expect(200);
    expect(income.body.payments).toHaveLength(1);
    expect(income.body.payments[0].paidOn).toBe('2026-11-20');
    const expenses = await request(server())
      .get('/gym-finance/expenses')
      .query({ from: '2026-11-01', to: '2026-11-01' })
      .set(as(owner.token))
      .expect(200);
    expect(expenses.body.expenses.map((row: { category: string }) => row.category)).toEqual([
      'Rent',
    ]);

    const outstanding = await request(server())
      .get('/gym-finance/outstanding')
      .set(as(owner.token))
      .expect(200);
    expect(outstanding.body.totalPaise).toBe(1200);
    expect(outstanding.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fullName: 'Ann Zee',
          unpaidPaise: 600,
          productName: 'Monthly',
          dueOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          membershipStatus: 'active',
        }),
      ]),
    );
    const filteredOutstanding = await request(server())
      .get('/gym-finance/outstanding')
      .query({ q: 'bob' })
      .set(as(owner.token))
      .expect(200);
    expect(filteredOutstanding.body.totalPaise).toBe(600);
    expect(filteredOutstanding.body.members).toHaveLength(1);

    await request(server())
      .get('/members')
      .query({ limit: 0 })
      .set(as(owner.token))
      .expect(400)
      .expect({ statusCode: 400, message: 'Query is not valid' });
    await request(server())
      .get('/members')
      .query({ cursor: 'not-a-cursor' })
      .set(as(owner.token))
      .expect(400)
      .expect({ statusCode: 400, message: 'Query is not valid' });
  }, 120_000);

  it('sets the session cookie and refuses it for a disabled staff account', async () => {
    const owner = await activeGymOwner(platform, 'cookie-owner@gym.test');
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'basic' } });
    await platform.prisma.subscription.create({
      data: {
        gymId: owner.gymId,
        planId: plan.id,
        status: 'active',
        planName: 'Basic',
        priceMonthlyPaise: 100,
        featureFlags: [],
        maxMembers: null,
        maxStaff: 2,
        maxBranches: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        startedAt: new Date(),
        expiredAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const signedIn = await request(server())
      .post('/auth/sign-in')
      .send({ email: 'cookie-owner@gym.test', password: 'owner-password' })
      .expect(200);
    expect(signedIn.body).toEqual({ accessToken: expect.any(String) });
    const payload = JSON.parse(
      Buffer.from(String(signedIn.body.accessToken).split('.')[1] ?? '', 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('permissions');
    const header = cookieHeader(signedIn);
    expect(header).toContain(`shark.access-token=${signedIn.body.accessToken}`);
    const raw = headerValue(signedIn);
    expect(raw.toLowerCase()).toContain('httponly');
    expect(raw.toLowerCase()).toContain('secure');
    expect(raw.toLowerCase()).toContain('samesite=lax');
    expect(raw).toContain('Path=/');
    expect(raw).toContain('Max-Age=3600');

    const me = await request(server()).get('/auth/me').set('Cookie', header).expect(200);
    expect(me.body.email).toBe('cookie-owner@gym.test');
    const adminSession = await request(server())
      .post('/auth/sign-in')
      .send({
        email: process.env.SUPER_ADMIN_EMAIL,
        password: process.env.SUPER_ADMIN_PASSWORD,
      })
      .expect(200);
    const both = await request(server())
      .get('/auth/me')
      .set('Cookie', header)
      .set('Authorization', `Bearer ${adminSession.body.accessToken}`)
      .expect(200);
    expect(both.body.email).toBe(process.env.SUPER_ADMIN_EMAIL);

    const signedOut = await request(server())
      .post('/auth/sign-out')
      .set('Cookie', header)
      .expect(204);
    expect(signedOut.body).toEqual({});
    expect(headerValue(signedOut).toLowerCase()).toContain('shark.access-token=');
    expect(headerValue(signedOut)).toMatch(/Max-Age=0/i);

    await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'disabled-staff@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'reception',
        template: 'Staff',
      })
      .expect(201);
    const staff = await platform.prisma.staffMember.findFirstOrThrow({
      where: { user: { email: 'disabled-staff@gym.test' } },
    });
    await request(server())
      .post(`/staff/${staff.id}/disable`)
      .set(as(owner.token))
      .expect(200);
    const refused = await request(server())
      .post('/auth/sign-in')
      .send({ email: 'disabled-staff@gym.test', password: 'staff-password' })
      .expect(403)
      .expect({ statusCode: 403, message: 'Staff account is disabled' });
    expect(refused.headers['set-cookie']).toBeUndefined();
  }, 60_000);

  it('does not store a second reminder when the daily job runs again', async () => {
    const owner = await activeGymOwner(platform, 'remind-owner@gym.test');
    const pending = await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(owner.token))
      .send({ planCode: 'basic' })
      .expect(201);
    await request(server())
      .post(`/subscriptions/${pending.body.id}/mark-paid`)
      .set(as(admin))
      .expect(200);
    const template = await request(server())
      .post('/message-templates')
      .set(as(admin))
      .send({ channel: 'sms', name: 'Due', body: 'Hi {{memberName}}' })
      .expect(201);
    const product = await request(server())
      .post('/membership-products')
      .set(as(owner.token))
      .send({ name: 'Week', pricePaise: 1000, durationDays: 30 })
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
        amountReceivedPaise: 100,
        paidOn: '2026-11-23',
        method: 'cash',
      })
      .expect(201);
    await request(server())
      .put('/gym-communications/automations')
      .set(as(owner.token))
      .send({ payment: { enabled: true, templateId: template.body.id } })
      .expect(200);

    const job = platform.app.get(CommunicationsService);
    await job.runForActiveGyms();
    await job.runForActiveGyms();
    expect(await platform.prisma.message.count({ where: { gymId: owner.gymId } })).toBe(1);
    const manual = await request(server())
      .post('/gym-communications/run')
      .set(as(owner.token))
      .expect(200);
    expect(manual.body).toEqual({ stored: 0, remaining: 0 });
  }, 60_000);
});

function headerValue(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  return (Array.isArray(raw) ? raw : [raw]).join('\n');
}

function cookieHeader(response: { headers: Record<string, unknown> }): string {
  return headerValue(response)
    .split('\n')
    .map((line) => line.split(';')[0] ?? '')
    .join('; ');
}
