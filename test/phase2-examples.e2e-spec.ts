import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PERMISSIONS } from '../src/common/constants/permissions.js';
import {
  activeGymOwner,
  adminToken,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

const PRO = {
  name: 'Pro',
  priceMonthlyPaise: 149_900,
  trialDays: 14,
  featureFlags: ['attendance'],
  maxMembers: 500,
  maxStaff: 10,
  maxBranches: 1,
  isActive: true,
};

const BASIC = {
  name: 'Basic',
  priceMonthlyPaise: 49_900,
  trialDays: 0,
  featureFlags: [],
  maxMembers: 100,
  maxStaff: 2,
  maxBranches: 1,
  isActive: true,
};

describe('phase 2 acceptance examples', () => {
  let platform: GymPlatform;
  let admin: string;

  const server = () => platform.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function configurePlans(): Promise<void> {
    await request(server()).patch('/plans/pro').set(as(admin)).send(PRO).expect(200);
    await request(server())
      .patch('/plans/basic')
      .set(as(admin))
      .send(BASIC)
      .expect(200);
  }

  async function payFor(token: string, planCode: string): Promise<string> {
    const pending = await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(token))
      .send({ planCode })
      .expect(201);
    await request(server())
      .post(`/subscriptions/${pending.body.id}/mark-paid`)
      .set(as(admin))
      .expect(200);
    return pending.body.id as string;
  }

  beforeAll(async () => {
    await applyMigrations();
    platform = await createGymPlatform();
  });

  beforeEach(async () => {
    await resetPlatform(platform);
    admin = await adminToken(platform.app);
  });

  afterAll(async () => {
    await platform.app.close();
  });

  it('seeds Basic, Pro, and Enterprise as inactive placeholders', async () => {
    const all = await request(server()).get('/plans/all').set(as(admin)).expect(200);
    expect(all.body.plans).toEqual(
      ['basic', 'enterprise', 'pro'].map((code) => ({
        code,
        name: code[0]!.toUpperCase() + code.slice(1),
        priceMonthlyPaise: 0,
        currency: 'INR',
        trialDays: 0,
        featureFlags: [],
        maxMembers: 0,
        maxStaff: 0,
        maxBranches: 0,
        isActive: false,
      })),
    );
    await platform.planSeed.seed();
    expect(await platform.prisma.plan.count()).toBe(3);

    const { token } = await activeGymOwner(platform, 'catalog@gym.test');
    const available = await request(server()).get('/plans').set(as(token)).expect(200);
    expect(available.body).toEqual({ plans: [] });
  }, 60_000);

  it('runs the request, manual payment, and Entitlements flow', async () => {
    await configurePlans();
    const { token, gymId } = await activeGymOwner(platform, 'flow@gym.test');
    const gymBefore = await platform.prisma.gym.findUniqueOrThrow({
      where: { id: gymId },
    });

    const catalog = await request(server()).get('/plans').set(as(token)).expect(200);
    expect(catalog.body.plans.map((plan: { code: string }) => plan.code)).toEqual([
      'basic',
      'pro',
    ]);

    expect(
      (await request(server()).get('/subscriptions/me/entitlements').set(as(token)).expect(200))
        .body,
    ).toEqual({
      plan: null,
      status: null,
      featureFlags: [],
      maxMembers: 0,
      maxStaff: 0,
      maxBranches: 0,
      currentPeriodEnd: null,
    });

    const pending = await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(token))
      .send({ planCode: 'pro' })
      .expect(201);
    expect(pending.body).toMatchObject({
      status: 'pending_payment',
      planCode: 'pro',
      priceMonthlyPaise: 149_900,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const queue = await request(server())
      .get('/subscriptions?status=pending_payment')
      .set(as(admin))
      .expect(200);
    expect(queue.body.subscriptions).toHaveLength(1);
    expect(queue.body.subscriptions[0]).toMatchObject({
      id: pending.body.id,
      gymId,
      gymName: 'Iron Works',
      ownerEmail: 'flow@gym.test',
    });
    expect(JSON.stringify(queue.body)).not.toContain('passwordHash');

    const paid = await request(server())
      .post(`/subscriptions/${pending.body.id}/mark-paid`)
      .set(as(admin))
      .expect(200);
    expect(paid.body).toMatchObject({ status: 'active', planName: 'Pro' });

    const entitlements = await request(server())
      .get('/subscriptions/me/entitlements')
      .set(as(token))
      .expect(200);
    expect(entitlements.body).toEqual({
      plan: { code: 'pro', name: 'Pro' },
      status: 'active',
      featureFlags: ['attendance'],
      maxMembers: 500,
      maxStaff: 10,
      maxBranches: 1,
      currentPeriodEnd: paid.body.currentPeriodEnd,
    });

    const mine = await request(server()).get('/subscriptions/me').set(as(token)).expect(200);
    expect(mine.body).toMatchObject({
      current: { id: pending.body.id, status: 'active' },
      pending: null,
      trialUsed: false,
    });

    expect(
      await platform.prisma.gym.findUniqueOrThrow({ where: { id: gymId } }),
    ).toEqual(gymBefore);
  }, 60_000);

  it('reports each plan management error', async () => {
    await request(server())
      .post('/plans')
      .set(as(admin))
      .send({ ...PRO, code: 'gold', priceMonthlyPaise: -1 })
      .expect(400)
      .expect({ statusCode: 400, message: 'Plan values are not valid' });
    await request(server())
      .post('/plans')
      .set(as(admin))
      .send({ ...PRO, code: 'gold', priceMonthlyPaise: 'x', trialDays: 'y' })
      .expect(400)
      .expect({ statusCode: 400, message: 'Plan values are not valid' });
    await request(server())
      .post('/plans')
      .set(as(admin))
      .send({ ...PRO, code: 'basic' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Plan code is already used' });
    await request(server())
      .patch('/plans/gold')
      .set(as(admin))
      .send({ name: 'Gold' })
      .expect(404)
      .expect({ statusCode: 404, message: 'Plan was not found' });
    const renamed = await request(server())
      .patch('/plans/pro')
      .set(as(admin))
      .send({ code: 'premium' })
      .expect(400);
    expect(renamed.body.message).toBe('property code should not exist');
    await request(server())
      .patch('/plans/pro')
      .set(as(admin))
      .send({})
      .expect(400)
      .expect({ statusCode: 400, message: 'Plan values are not valid' });
    expect(await platform.prisma.plan.count()).toBe(3);
    expect(
      (await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } })).name,
    ).toBe('Pro');

    const created = await request(server())
      .post('/plans')
      .set(as(admin))
      .send({ ...PRO, code: 'gold', name: 'Gold' })
      .expect(201);
    expect(created.body).toMatchObject({ code: 'gold', isActive: true, currency: 'INR' });
  });

  it('reports each owner selection error', async () => {
    await configurePlans();
    await request(server())
      .post('/auth/register')
      .send({ email: 'nogym@gym.test', password: 'owner-password' })
      .expect(201);
    const noGym = await signIn(platform.app, 'nogym@gym.test', 'owner-password');
    await request(server())
      .get('/subscriptions/me')
      .set(as(noGym))
      .expect(404)
      .expect({ statusCode: 404, message: 'Gym was not found' });
    await request(server())
      .post('/gyms')
      .set(as(noGym))
      .expect(201);
    await request(server())
      .post('/subscriptions/me/trial')
      .set(as(noGym))
      .send({ planCode: 'pro' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Plan selection requires an active gym' });
    expect(
      (await request(server()).get('/subscriptions/me').set(as(noGym)).expect(200)).body,
    ).toEqual({ current: null, pending: null, trialUsed: false });

    const { token } = await activeGymOwner(platform, 'select@gym.test');
    await request(server())
      .post('/subscriptions/me/trial')
      .set(as(token))
      .send({})
      .expect(400)
      .expect({ statusCode: 400, message: 'Plan selection is not valid' });
    await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(token))
      .send({ planCode: 42 })
      .expect(400)
      .expect({ statusCode: 400, message: 'Plan selection is not valid' });
    await request(server())
      .post('/subscriptions/me/trial')
      .set(as(token))
      .send({ planCode: 'enterprise' })
      .expect(404)
      .expect({ statusCode: 404, message: 'Plan was not found' });
    await request(server())
      .post('/subscriptions/me/trial')
      .set(as(token))
      .send({ planCode: 'basic' })
      .expect(409)
      .expect({ statusCode: 409, message: 'This plan has no trial' });

    const trial = await request(server())
      .post('/subscriptions/me/trial')
      .set(as(token))
      .send({ planCode: 'pro' })
      .expect(201);
    expect(trial.body).toMatchObject({ status: 'trialing', planCode: 'pro' });
    await request(server())
      .post('/subscriptions/me/trial')
      .set(as(token))
      .send({ planCode: 'pro' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Trial already used' });
    await request(server())
      .post(`/subscriptions/${trial.body.id}/mark-paid`)
      .set(as(admin))
      .expect(409)
      .expect({ statusCode: 409, message: 'A trial cannot be marked paid' });

    const other = await activeGymOwner(platform, 'paid@gym.test');
    await payFor(other.token, 'basic');
    await request(server())
      .post('/subscriptions/me/trial')
      .set(as(other.token))
      .send({ planCode: 'pro' })
      .expect(409)
      .expect({ statusCode: 409, message: 'A subscription is already in effect' });
    await request(server())
      .post('/subscriptions/me/plan-request')
      .set(as(other.token))
      .send({ planCode: 'basic' })
      .expect(409)
      .expect({ statusCode: 409, message: 'This plan is already in effect' });
  }, 90_000);

  it('reports each payment and list error', async () => {
    await configurePlans();
    const { token } = await activeGymOwner(platform, 'renew@gym.test');
    const first = await payFor(token, 'basic');
    const second = await payFor(token, 'pro');

    const firstRow = await platform.prisma.subscription.findUniqueOrThrow({
      where: { id: first },
    });
    await request(server())
      .post(`/subscriptions/${first}/mark-paid`)
      .set(as(admin))
      .expect(409)
      .expect({
        statusCode: 409,
        message: 'Only the current subscription can be renewed',
      });
    expect(
      await platform.prisma.subscription.findUniqueOrThrow({ where: { id: first } }),
    ).toEqual(firstRow);

    const expired = await request(server())
      .get('/subscriptions?status=expired')
      .set(as(admin))
      .expect(200);
    expect(expired.body.subscriptions.map((item: { id: string }) => item.id)).toEqual([
      first,
    ]);
    const active = await request(server())
      .get('/subscriptions?status=active')
      .set(as(admin))
      .expect(200);
    expect(active.body.subscriptions.map((item: { id: string }) => item.id)).toEqual([
      second,
    ]);

    await request(server())
      .post('/subscriptions/not-a-uuid/mark-paid')
      .set(as(admin))
      .expect(404)
      .expect({ statusCode: 404, message: 'Subscription was not found' });
    await request(server())
      .post('/subscriptions/00000000-0000-4000-8000-000000000000/mark-paid')
      .set(as(admin))
      .expect(404)
      .expect({ statusCode: 404, message: 'Subscription was not found' });
    await request(server())
      .get('/subscriptions?status=cancelled')
      .set(as(admin))
      .expect(400)
      .expect({ statusCode: 400, message: 'Subscription filter is not valid' });
  }, 90_000);

  it('marks trials with isTrial so an expired trial differs from an expired paid plan', async () => {
    await configurePlans();
    const { token } = await activeGymOwner(platform, 'istrial@gym.test');
    const trial = await request(server())
      .post('/subscriptions/me/trial')
      .set(as(token))
      .send({ planCode: 'pro' })
      .expect(201);
    expect(trial.body).toMatchObject({ status: 'trialing', isTrial: true });

    const paidId = await payFor(token, 'basic');

    const expired = await request(server())
      .get('/subscriptions?status=expired')
      .set(as(admin))
      .expect(200);
    expect(
      expired.body.subscriptions.map(
        (item: { id: string; status: string; isTrial: boolean }) => [
          item.id,
          item.status,
          item.isTrial,
        ],
      ),
    ).toEqual([[trial.body.id, 'expired', true]]);

    const active = await request(server())
      .get('/subscriptions?status=active')
      .set(as(admin))
      .expect(200);
    expect(active.body.subscriptions).toEqual([
      expect.objectContaining({ id: paidId, status: 'active', isTrial: false }),
    ]);

    const mine = await request(server()).get('/subscriptions/me').set(as(token)).expect(200);
    expect(mine.body.current).toMatchObject({ id: paidId, isTrial: false });
    expect(mine.body.trialUsed).toBe(true);
  }, 60_000);

  it('keeps the Phase 2 management Permissions locked on Super_Admin', async () => {
    for (const permission of ['manage_plans', 'manage_subscriptions']) {
      await request(server())
        .patch('/roles/permissions')
        .set(as(admin))
        .send({ roleName: 'Super_Admin', permission, state: 'disabled' })
        .expect(400)
        .expect({
          statusCode: 400,
          message:
            'manage_plans and manage_subscriptions cannot be disabled on Super_Admin',
        });
    }
    await request(server())
      .patch('/roles/permissions')
      .set(as(admin))
      .send({ roleName: 'Super_Admin', permission: 'review_gyms', state: 'disabled' })
      .expect(400)
      .expect({
        statusCode: 400,
        message:
          'view_dashboard, manage_users, manage_roles, and review_gyms cannot be disabled on Super_Admin',
      });

    const roles = await request(server()).get('/roles').set(as(admin)).expect(200);
    for (const role of roles.body.roles as Array<{ permissions: object }>) {
      expect(Object.keys(role.permissions)).toEqual([...PERMISSIONS]);
    }
    const byName = Object.fromEntries(
      (roles.body.roles as Array<{ name: string; permissions: Record<string, string> }>).map(
        (role) => [role.name, role.permissions],
      ),
    );
    expect(byName.Super_Admin).toMatchObject({
      view_plans: 'disabled',
      manage_plans: 'enabled',
      manage_subscriptions: 'enabled',
      manage_gym_subscription: 'disabled',
    });
    expect(byName.Gym_Owner).toMatchObject({
      view_plans: 'enabled',
      manage_plans: 'disabled',
      manage_subscriptions: 'disabled',
      manage_gym_subscription: 'enabled',
    });
  });

  it('leaves the dashboard as the four Phase 1 counts', async () => {
    await configurePlans();
    const { token } = await activeGymOwner(platform, 'dash@gym.test');
    await payFor(token, 'pro');
    const response = await request(server()).get('/dashboard').set(as(admin)).expect(200);
    expect(Object.keys(response.body)).toEqual([
      'userCount',
      'setupInProgressCount',
      'pendingCount',
      'activeCount',
    ]);
  }, 60_000);
});
