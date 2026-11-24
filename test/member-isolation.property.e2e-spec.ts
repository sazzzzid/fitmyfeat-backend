import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  activeGymOwner,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('member gym isolation', () => {
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

  it('Feature: core-gym-management, Property 4: Owners cannot cross Gyms', async () => {
    const server = platform.app.getHttpServer();
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    let counter = 0;

    async function open(email: string) {
      const owner = await activeGymOwner(platform, email);
      await platform.prisma.subscription.create({
        data: {
          gymId: owner.gymId,
          planId: plan.id,
          status: 'active',
          planName: 'Pro',
          priceMonthlyPaise: 100,
          featureFlags: [],
          maxMembers: null,
          maxStaff: null,
          maxBranches: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      return owner;
    }

    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }), async (name) => {
        counter += 1;
        const first = await open(`iso-a-${counter}@gym.test`);
        const second = await open(`iso-b-${counter}@gym.test`);
        const member = await request(server)
          .post('/members')
          .set('Authorization', `Bearer ${first.token}`)
          .send({ fullName: name.trim() || 'Asha', contact: '555' })
          .expect(201);
        const product = await request(server)
          .post('/membership-products')
          .set('Authorization', `Bearer ${first.token}`)
          .send({ name: 'Monthly', pricePaise: 100, durationDays: 30 })
          .expect(201);
        const before = await platform.prisma.member.findUniqueOrThrow({
          where: { id: member.body.id },
        });
        const patch = await request(server)
          .patch(`/members/${member.body.id}`)
          .set('Authorization', `Bearer ${second.token}`)
          .send({ fullName: 'Stolen' });
        const assign = await request(server)
          .post(`/members/${member.body.id}/membership`)
          .set('Authorization', `Bearer ${second.token}`)
          .send({ productId: product.body.id });
        const products = await request(server)
          .get('/membership-products')
          .set('Authorization', `Bearer ${second.token}`)
          .expect(200);
        expect(patch.status).toBe(404);
        expect(assign.status).toBe(404);
        expect(products.body.products).toEqual([]);
        expect(
          await platform.prisma.member.findUniqueOrThrow({ where: { id: member.body.id } }),
        ).toEqual(before);
      }),
      { numRuns: 20 },
    );
  }, 180_000);
});