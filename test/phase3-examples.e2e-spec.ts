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

describe('phase 3 acceptance examples', () => {
  let platform: GymPlatform;
  let admin: string;

  const server = () => platform.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const payment = {
    amountReceivedPaise: 100,
    paidOn: '2026-11-22',
    method: 'cash',
  };

  async function allowMembers(gymId: string, maxMembers: number | null): Promise<void> {
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    const end = new Date(Date.now() + 30 * 86_400_000);
    await platform.prisma.subscription.create({
      data: {
        gymId,
        planId: plan.id,
        status: 'active',
        planName: plan.name,
        priceMonthlyPaise: 100,
        featureFlags: [],
        maxMembers,
        maxStaff: null,
        maxBranches: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: end,
      },
    });
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

  it('rejects member management without an active gym or a free seat', async () => {
    await request(server())
      .post('/auth/register')
      .send({ email: 'nomembergym@gym.test', password: 'owner-password' })
      .expect(201);
    const token = await signIn(platform.app, 'nomembergym@gym.test', 'owner-password');
    await request(server())
      .get('/members')
      .set(as(token))
      .expect(404)
      .expect({ statusCode: 404, message: 'Gym was not found' });
    await request(server()).post('/gyms').set(as(token)).expect(201);
    await request(server())
      .post('/members')
      .set(as(token))
      .send({ fullName: 'Asha Rao', contact: '555' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Member management requires an active gym' });

    const owner = await activeGymOwner(platform, 'seats@gym.test');
    await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Asha Rao', contact: '555' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Member limit reached' });
    await allowMembers(owner.gymId, 1);
    const created = await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Asha Rao', contact: '555' })
      .expect(201);
    expect(created.body.membership).toBeNull();
    await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Bea', contact: '556' })
      .expect(409)
      .expect({ statusCode: 409, message: 'Member limit reached' });
    await request(server())
      .patch(`/members/${created.body.id}`)
      .set(as(owner.token))
      .send({ contact: '557' })
      .expect(200);
    expect(admin).toBeTruthy();
  }, 60_000);

  it('assigns, renews, freezes, and keeps the snapshot', async () => {
    const owner = await activeGymOwner(platform, 'membership@gym.test');
    await allowMembers(owner.gymId, null);
    const member = await request(server())
      .post('/members')
      .set(as(owner.token))
      .send({ fullName: 'Asha Rao', contact: '555', notes: 'front desk' })
      .expect(201);
    await request(server())
      .post('/membership-products')
      .set(as(owner.token))
      .send({ name: '   ', pricePaise: 100, durationDays: 30 })
      .expect(400)
      .expect({ statusCode: 400, message: 'Membership product values are not valid' });
    const product = await request(server())
      .post('/membership-products')
      .set(as(owner.token))
      .send({ name: 'Monthly', pricePaise: 150_000, durationDays: 30 })
      .expect(201);

    const assigned = await request(server())
      .post(`/members/${member.body.id}/membership`)
      .set(as(owner.token))
      .send({ productId: product.body.id, ...payment })
      .expect(201);
    expect(assigned.body.membership).toMatchObject({
      status: 'active',
      productName: 'Monthly',
      pricePaise: 150_000,
      durationDays: 30,
    });
    await request(server())
      .post(`/members/${member.body.id}/membership`)
      .set(as(owner.token))
      .send({ productId: product.body.id, ...payment })
      .expect(409)
      .expect({ statusCode: 409, message: 'Member already has a membership' });

    await request(server())
      .patch(`/membership-products/${product.body.id}`)
      .set(as(owner.token))
      .send({ name: 'Monthly Plus', pricePaise: 200_000 })
      .expect(200);
    const listed = await request(server()).get('/members').set(as(owner.token)).expect(200);
    expect(listed.body.members[0].membership).toMatchObject({
      productName: 'Monthly',
      pricePaise: 150_000,
    });

    const frozen = await request(server())
      .post(`/members/${member.body.id}/membership/freeze`)
      .set(as(owner.token))
      .expect(200);
    expect(frozen.body.membership.status).toBe('frozen');
    await request(server())
      .post(`/members/${member.body.id}/membership/renew`)
      .set(as(owner.token))
      .send(payment)
      .expect(409)
      .expect({ statusCode: 409, message: 'Membership is frozen' });
    const resumed = await request(server())
      .post(`/members/${member.body.id}/membership/unfreeze`)
      .set(as(owner.token))
      .expect(200);
    expect(resumed.body.membership.status).toBe('active');
    expect(resumed.body.membership.frozenAt).toBeNull();

    await platform.prisma.membership.updateMany({
      where: { memberId: member.body.id },
      data: {
        currentPeriodStart: new Date(Date.now() - 40 * 86_400_000),
        currentPeriodEnd: new Date(Date.now() - 86_400_000),
      },
    });
    const renewed = await request(server())
      .post(`/members/${member.body.id}/membership/renew`)
      .set(as(owner.token))
      .send(payment)
      .expect(200);
    expect(renewed.body.membership).toMatchObject({
      status: 'active',
      productName: 'Monthly Plus',
      pricePaise: 200_000,
    });
    expect(Date.parse(renewed.body.membership.currentPeriodStart)).toBeGreaterThan(
      Date.now() - 60_000,
    );
  }, 60_000);

  it('does not let one owner read or change another gym', async () => {
    const first = await activeGymOwner(platform, 'owner-a@gym.test');
    const second = await activeGymOwner(platform, 'owner-b@gym.test');
    await allowMembers(first.gymId, null);
    await allowMembers(second.gymId, null);
    const member = await request(server())
      .post('/members')
      .set(as(first.token))
      .send({ fullName: 'Asha Rao', contact: '555' })
      .expect(201);
    const product = await request(server())
      .post('/membership-products')
      .set(as(first.token))
      .send({ name: 'Monthly', pricePaise: 100, durationDays: 30 })
      .expect(201);
    await request(server())
      .patch(`/members/${member.body.id}`)
      .set(as(second.token))
      .send({ fullName: 'Stolen' })
      .expect(404)
      .expect({ statusCode: 404, message: 'Member was not found' });
    await request(server())
      .post(`/members/${member.body.id}/membership`)
      .set(as(second.token))
      .send({ productId: product.body.id, ...payment })
      .expect(404);
    const secondList = await request(server()).get('/members').set(as(second.token)).expect(200);
    expect(secondList.body.members).toEqual([]);
    expect(
      (await platform.prisma.member.findUniqueOrThrow({ where: { id: member.body.id } })).fullName,
    ).toBe('Asha Rao');
  }, 90_000);
});
