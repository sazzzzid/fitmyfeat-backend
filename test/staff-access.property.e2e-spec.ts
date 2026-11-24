import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import {
  activeGymOwner,
  applyMigrations,
  createGymPlatform,
  resetPlatform,
  signIn,
  type GymPlatform,
} from './helpers/gym-platform.js';

describe('staff route access', () => {
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

  it('Feature: staff-permissions, Property 3: Staff flags stay inside one Gym', async () => {
    const server = platform.app.getHttpServer();
    const plan = await platform.prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    let counter = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (view, create, manage) => {
          counter += 1;
          const owner = await activeGymOwner(platform, `access-a-${counter}@gym.test`);
          const other = await activeGymOwner(platform, `access-b-${counter}@gym.test`);
          await allow(platform, plan.id, owner.gymId);
          await allow(platform, plan.id, other.gymId);
          const auth = { Authorization: `Bearer ${owner.token}` };
          const otherAuth = { Authorization: `Bearer ${other.token}` };
          const member = await request(server)
            .post('/members')
            .set(auth)
            .send({ fullName: 'Asha Rao', contact: `c-${counter}` })
            .expect(201);
          const foreign = await request(server)
            .post('/members')
            .set(otherAuth)
            .send({ fullName: 'Other Person', contact: `o-${counter}` })
            .expect(201);
          const created = await request(server)
            .post('/staff')
            .set(auth)
            .send({
              email: `worker-${counter}@gym.test`,
              password: 'staff-password',
              fullName: 'Ria Sen',
              title: 'reception',
              template: 'Staff',
            })
            .expect(201);
          await request(server)
            .patch(`/staff/${created.body.id}`)
            .set(auth)
            .send({ view, create, manage })
            .expect(200);
          const token = await signIn(platform.app, `worker-${counter}@gym.test`, 'staff-password');
          const staffAuth = { Authorization: `Bearer ${token}` };

          const listed = await request(server).get('/members').set(staffAuth);
          if (view) {
            expect(listed.status).toBe(200);
            const ids = (listed.body.members as Array<{ id: string }>).map((row) => row.id);
            expect(ids).toContain(member.body.id);
            expect(ids).not.toContain(foreign.body.id);
          } else {
            expect(listed.status).toBe(403);
          }

          const added = await request(server)
            .post('/members')
            .set(staffAuth)
            .send({ fullName: 'New Person', contact: `n-${counter}` });
          expect(added.status).toBe(create ? 201 : 403);

          const edited = await request(server)
            .patch(`/members/${member.body.id}`)
            .set(staffAuth)
            .send({ fullName: 'Asha Updated' });
          expect(edited.status).toBe(manage ? 200 : 403);
          const crossed = await request(server)
            .patch(`/members/${foreign.body.id}`)
            .set(staffAuth)
            .send({ fullName: 'Stolen' });
          expect(crossed.status).toBe(manage ? 404 : 403);
          const foreignRow = await platform.prisma.member.findUniqueOrThrow({
            where: { id: foreign.body.id as string },
          });
          expect(foreignRow.fullName).toBe('Other Person');

          await request(server).get('/members').set(auth).expect(200);
          await request(server).post(`/staff/${created.body.id}/disable`).set(auth).expect(200);
          await request(server)
            .get('/members')
            .set(staffAuth)
            .expect(403)
            .expect({ statusCode: 403, message: 'Staff account is disabled' });
        },
      ),
      { numRuns: 20 },
    );
  }, 180_000);
});

async function allow(
  platform: GymPlatform,
  planId: string,
  gymId: string,
): Promise<void> {
  const end = new Date(Date.now() + 30 * 86_400_000);
  await platform.prisma.subscription.create({
    data: {
      gymId,
      planId,
      status: 'active',
      planName: 'Pro',
      priceMonthlyPaise: 100,
      featureFlags: [],
      maxMembers: null,
      maxStaff: null,
      maxBranches: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: end,
    },
  });
}
