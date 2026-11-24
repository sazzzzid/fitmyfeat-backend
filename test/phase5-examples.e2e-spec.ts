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

describe('phase 5 acceptance examples', () => {
  let platform: GymPlatform;
  let admin: string;

  const server = () => platform.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

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
        maxMembers: 10,
        maxStaff: 2,
        maxBranches: 1,
        isActive: true,
      })
      .expect(200);
    await request(server())
      .patch('/plans/pro')
      .set(as(admin))
      .send({
        name: 'Pro',
        priceMonthlyPaise: 20_000,
        trialDays: 0,
        featureFlags: [],
        maxMembers: 10,
        maxStaff: 2,
        maxBranches: 1,
        isActive: true,
      })
      .expect(200);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('records one charge per payment, refunds without moving the period, and fails only a request', async () => {
    const owner = await activeGymOwner(platform, 'finance-owner@gym.test');
    const pending = await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(owner.token))
      .send({ planCode: 'basic' })
      .expect(201);
    const before = await platform.prisma.subscription.findUniqueOrThrow({
      where: { id: pending.body.id as string },
    });
    await request(server())
      .post(`/subscriptions/${pending.body.id}/mark-paid`)
      .set(as(admin))
      .expect(200);
    const paid = await platform.prisma.subscription.findUniqueOrThrow({
      where: { id: pending.body.id as string },
    });
    const charges = await platform.prisma.platformCharge.findMany({
      where: { subscriptionId: pending.body.id as string },
    });
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ status: 'paid', amountPaise: 10_000, commissionPaise: 0 });

    const refunded = await request(server())
      .post(`/platform-finance/payments/${charges[0]!.id}/refund`)
      .set(as(admin))
      .expect(200);
    expect(refunded.body.status).toBe('refunded');
    const afterRefund = await platform.prisma.subscription.findUniqueOrThrow({
      where: { id: pending.body.id as string },
    });
    expect(afterRefund.currentPeriodEnd?.toISOString()).toBe(paid.currentPeriodEnd?.toISOString());
    await request(server())
      .post(`/platform-finance/payments/${charges[0]!.id}/refund`)
      .set(as(admin))
      .expect(409)
      .expect({ statusCode: 409, message: 'Platform charge is already refunded' });

    await request(server())
      .post(`/platform-finance/subscriptions/${before.id}/fail`)
      .set(as(admin))
      .expect(409)
      .expect({ statusCode: 409, message: 'Only a pending payment can be marked failed' });

    const second = await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(owner.token))
      .send({ planCode: 'pro' })
      .expect(201);
    await request(server())
      .post(`/platform-finance/subscriptions/${second.body.id}/fail`)
      .set(as(admin))
      .expect(200);
    await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(owner.token))
      .send({ planCode: 'pro' })
      .expect(201);

    await request(server())
      .get('/platform-finance/report')
      .set(as(owner.token))
      .expect(403);
    await request(server())
      .get('/platform-finance/report')
      .query({ from: '2026-01-01', to: '2027-01-02' })
      .set(as(admin))
      .expect(400)
      .expect({ statusCode: 400, message: 'Finance range is not valid' });
    await request(server())
      .post('/platform-finance/settlements')
      .set(as(admin))
      .send({ month: '2999-01' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Settlement month is not valid' });
    await request(server())
      .get('/platform-finance/payments')
      .query({ status: 'nope' })
      .set(as(admin))
      .expect(400)
      .expect({ statusCode: 400, message: 'Finance filter is not valid' });
    await request(server())
      .post('/platform-finance/payments/not-a-uuid/refund')
      .set(as(admin))
      .expect(404)
      .expect({ statusCode: 404, message: 'Platform charge was not found' });
  });

  it('keeps gym finance inside the active gym and away from staff', async () => {
    const owner = await activeGymOwner(platform, 'gym-finance@gym.test');
    await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(owner.token))
      .send({ planCode: 'basic' })
      .expect(201);
    const pending = await request(server())
      .get('/subscriptions/me')
      .set(as(owner.token))
      .expect(200);
    const requestId = pending.body.pending.id as string;
    await request(server())
      .post(`/subscriptions/${requestId}/mark-paid`)
      .set(as(admin))
      .expect(200);

    await request(server())
      .post('/gym-finance/expenses')
      .set(as(owner.token))
      .send({ category: '', amountPaise: 1, paidOn: '2026-11-22' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Expense values are not valid' });
    await request(server())
      .post('/gym-finance/expenses')
      .set(as(owner.token))
      .send({ category: 'Rent', amountPaise: 500, paidOn: '2026-11-22' })
      .expect(201);

    const product = await request(server())
      .post('/membership-products')
      .set(as(owner.token))
      .send({ name: 'Monthly', pricePaise: 1000, durationDays: 30 })
      .expect(201);
    const member = await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Asha Rao', contact: '555' })
      .expect(201);
    await request(server())
      .post(`/members/${member.body.id}/membership`)
      .set(as(owner.token))
      .send({
        productId: product.body.id,
        amountReceivedPaise: 400,
        paidOn: '2026-11-22',
        method: 'cash',
      })
      .expect(201);
    const outstanding = await request(server())
      .get('/gym-finance/outstanding')
      .set(as(owner.token))
      .expect(200);
    expect(outstanding.body.totalPaise).toBe(600);

    const income = await request(server())
      .get('/gym-finance/income')
      .set(as(owner.token))
      .expect(200);
    const paymentId = income.body.payments[0].id as string;
    await request(server())
      .get(`/gym-finance/payments/${paymentId}/invoice`)
      .set(as(owner.token))
      .expect(200);
    await request(server())
      .get(`/gym-finance/payments/${paymentId}/receipt`)
      .set(as(owner.token))
      .expect(200);
    await request(server())
      .get('/gym-finance/payments/00000000-0000-4000-8000-000000000000/invoice')
      .set(as(owner.token))
      .expect(404)
      .expect({ statusCode: 404, message: 'Payment was not found' });

    const ledger = await request(server())
      .get('/gym-finance/ledger')
      .query({ from: '2026-11-01', to: '2026-11-30' })
      .set(as(owner.token))
      .expect(200);
    expect(ledger.body.entries.at(-1).balancePaise).toBe(400 - 500);

    const staff = await request(server())
      .post('/staff')
      .set(as(owner.token))
      .send({
        email: 'finance-staff@gym.test',
        password: 'staff-password',
        fullName: 'Ria Sen',
        title: 'accountant',
        template: 'Staff',
      })
      .expect(201);
    expect(staff.body.email).toBe('finance-staff@gym.test');
    const staffToken = await signIn(
      platform.app,
      'finance-staff@gym.test',
      'staff-password',
    );
    await request(server()).get('/gym-finance/income').set(as(staffToken)).expect(403);
    await request(server())
      .get('/platform-finance/payments')
      .set(as(staffToken))
      .expect(403);

    await request(server())
      .post('/auth/register')
      .send({ email: 'idle@gym.test', password: 'owner-password' })
      .expect(201);
    const idle = await signIn(platform.app, 'idle@gym.test', 'owner-password');
    await request(server())
      .get('/gym-finance/income')
      .set(as(idle))
      .expect(404)
      .expect({ statusCode: 404, message: 'Gym was not found' });
  });
});
