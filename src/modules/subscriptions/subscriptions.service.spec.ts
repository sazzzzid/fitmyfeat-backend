import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Plan, Subscription } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeStore,
  fakeGymsService,
  fakeSubscriptionPrisma,
  makeGym,
  makePlan,
  type FakeGym,
  type FakeStore,
} from '../../../test/helpers/fake-subscription-prisma.js';
import { FinanceService } from '../finance/finance.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

const NOW = new Date('2026-11-22T10:00:00.000Z');
const DAY = 86_400_000;

function at(offsetDays: number): Date {
  return new Date(NOW.getTime() + offsetDays * DAY);
}

function row(
  gym: FakeGym,
  plan: Plan,
  overrides: Partial<Subscription>,
): Subscription {
  const pending = overrides.status === 'pending_payment';
  return {
    id: crypto.randomUUID(),
    gymId: gym.id,
    planId: plan.id,
    status: 'active',
    planName: pending ? null : plan.name,
    priceMonthlyPaise: pending ? null : plan.priceMonthlyPaise,
    featureFlags: pending ? [] : [...plan.featureFlags],
    maxMembers: pending ? null : plan.maxMembers,
    maxStaff: pending ? null : plan.maxStaff,
    maxBranches: pending ? null : plan.maxBranches,
    currentPeriodStart: pending ? null : at(-10),
    currentPeriodEnd: pending ? null : at(20),
    startedAt: pending ? null : at(-10),
    expiredAt: pending ? null : at(20),
    createdAt: at(-10),
    ...overrides,
  };
}

describe('SubscriptionsService', () => {
  let store: FakeStore;
  let service: SubscriptionsService;
  let gym: FakeGym;
  let pro: Plan;
  let basic: Plan;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    store = createFakeStore();
    gym = makeGym();
    pro = makePlan({ code: 'pro', name: 'Pro', trialDays: 14 });
    basic = makePlan({
      code: 'basic',
      name: 'Basic',
      priceMonthlyPaise: 49_900,
      trialDays: 0,
      featureFlags: [],
      maxMembers: 100,
    });
    store.gyms.push(gym);
    store.plans.push(pro, basic);
    const prisma = fakeSubscriptionPrisma(store);
    service = new SubscriptionsService(
      prisma,
      fakeGymsService(store),
      new FinanceService(prisma, fakeGymsService(store), {
        get: () => 0,
      } as never),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startTrial', () => {
    it('rejects a missing or empty Plan_Code before loading the Gym', async () => {
      await expect(service.startTrial('nobody', undefined)).rejects.toThrow(
        new BadRequestException('Plan selection is not valid'),
      );
      await expect(service.startTrial('nobody', '')).rejects.toThrow(
        'Plan selection is not valid',
      );
    });

    it('rejects an owner with no Gym and a Gym that is not active', async () => {
      await expect(service.startTrial('nobody', 'pro')).rejects.toThrow(
        new NotFoundException('Gym was not found'),
      );
      gym.status = 'pending';
      await expect(service.startTrial(gym.ownerId, 'pro')).rejects.toThrow(
        new ConflictException('Plan selection requires an active gym'),
      );
      expect(store.subscriptions).toHaveLength(0);
    });

    it('rejects an unknown or inactive Plan', async () => {
      await expect(service.startTrial(gym.ownerId, 'gold')).rejects.toThrow(
        new NotFoundException('Plan was not found'),
      );
      pro.isActive = false;
      await expect(service.startTrial(gym.ownerId, 'pro')).rejects.toThrow(
        'Plan was not found',
      );
    });

    it('rejects a Plan with no trial', async () => {
      await expect(service.startTrial(gym.ownerId, 'basic')).rejects.toThrow(
        new ConflictException('This plan has no trial'),
      );
    });

    it('rejects a second trial even after the first expired', async () => {
      store.subscriptions.push(
        row(gym, pro, {
          status: 'trialing',
          currentPeriodStart: at(-30),
          currentPeriodEnd: at(-16),
        }),
      );
      await expect(service.startTrial(gym.ownerId, 'pro')).rejects.toThrow(
        new ConflictException('Trial already used'),
      );
      expect(store.subscriptions).toHaveLength(1);
    });

    it('rejects a trial while a Subscription is In_Effect', async () => {
      store.subscriptions.push(row(gym, basic, { status: 'active' }));
      await expect(service.startTrial(gym.ownerId, 'pro')).rejects.toThrow(
        new ConflictException('A subscription is already in effect'),
      );
    });

    it('creates a trial with a snapshot and leaves a Plan_Request alone', async () => {
      const request = row(gym, basic, { status: 'pending_payment' });
      store.subscriptions.push(request);
      const trial = await service.startTrial(gym.ownerId, 'pro');
      expect(trial).toMatchObject({
        status: 'trialing',
        planCode: 'pro',
        planName: 'Pro',
        priceMonthlyPaise: 149_900,
        currency: 'INR',
        featureFlags: ['attendance'],
        maxMembers: 500,
        maxStaff: 10,
        maxBranches: null,
        currentPeriodStart: NOW.toISOString(),
        currentPeriodEnd: at(14).toISOString(),
        isTrial: true,
      });
      expect(store.subscriptions.find((item) => item.id === request.id)).toEqual(
        request,
      );
    });
  });

  describe('requestPlan', () => {
    it('creates a Plan_Request with no snapshot and no period', async () => {
      const response = await service.requestPlan(gym.ownerId, 'basic');
      expect(response).toMatchObject({
        status: 'pending_payment',
        planCode: 'basic',
        planName: 'Basic',
        priceMonthlyPaise: 49_900,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        isTrial: false,
      });
      const [stored] = store.subscriptions;
      expect(stored).toMatchObject({
        status: 'pending_payment',
        planName: null,
        priceMonthlyPaise: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      });
    });

    it('replaces the Plan of an existing Plan_Request', async () => {
      const first = await service.requestPlan(gym.ownerId, 'basic');
      const second = await service.requestPlan(gym.ownerId, 'pro');
      expect(second.id).toBe(first.id);
      expect(second.planCode).toBe('pro');
      expect(store.subscriptions).toHaveLength(1);
    });

    it('rejects the Plan of the active Subscription In_Effect', async () => {
      store.subscriptions.push(row(gym, pro, { status: 'active' }));
      await expect(service.requestPlan(gym.ownerId, 'pro')).rejects.toThrow(
        new ConflictException('This plan is already in effect'),
      );
      expect(store.subscriptions).toHaveLength(1);
    });

    it('allows requesting the Plan of a trial In_Effect', async () => {
      const trial = row(gym, pro, { status: 'trialing' });
      store.subscriptions.push(trial);
      const response = await service.requestPlan(gym.ownerId, 'pro');
      expect(response.status).toBe('pending_payment');
      expect(store.subscriptions.find((item) => item.id === trial.id)).toEqual(
        trial,
      );
    });

    it('uses the same rejections as a trial start', async () => {
      await expect(service.requestPlan(gym.ownerId, 7)).rejects.toThrow(
        'Plan selection is not valid',
      );
      basic.isActive = false;
      await expect(service.requestPlan(gym.ownerId, 'basic')).rejects.toThrow(
        'Plan was not found',
      );
      gym.status = 'setup_in_progress';
      await expect(service.requestPlan(gym.ownerId, 'pro')).rejects.toThrow(
        'Plan selection requires an active gym',
      );
    });
  });

  describe('markPaid', () => {
    it('rejects a malformed or unknown id', async () => {
      await expect(service.markPaid('not-a-uuid')).rejects.toThrow(
        new NotFoundException('Subscription was not found'),
      );
      await expect(service.markPaid(crypto.randomUUID())).rejects.toThrow(
        'Subscription was not found',
      );
    });

    it('rejects a trial', async () => {
      const trial = row(gym, pro, { status: 'trialing' });
      store.subscriptions.push(trial);
      await expect(service.markPaid(trial.id)).rejects.toThrow(
        new ConflictException('A trial cannot be marked paid'),
      );
      expect(store.subscriptions[0]).toEqual(trial);
    });

    it.each(['trialing', 'active'] as const)(
      'activates a Plan_Request and ends the %s Subscription In_Effect',
      async (status) => {
        const current = row(gym, basic, { status });
        const request = row(gym, pro, { status: 'pending_payment' });
        const otherGym = makeGym();
        store.gyms.push(otherGym);
        const other = row(otherGym, basic, { status: 'active' });
        store.subscriptions.push(current, request, other);

        const response = await service.markPaid(request.id);

        expect(response).toMatchObject({
          id: request.id,
          status: 'active',
          planCode: 'pro',
          planName: 'Pro',
          currentPeriodStart: NOW.toISOString(),
          currentPeriodEnd: '2026-12-22T10:00:00.000Z',
          gymId: gym.id,
          gymName: 'Iron Works',
          ownerEmail: 'owner@gym.test',
          isTrial: false,
        });
        const ended = store.subscriptions.find((item) => item.id === current.id);
        expect(ended?.currentPeriodEnd).toEqual(NOW);
        expect(ended?.status).toBe(status);
        expect(store.subscriptions.find((item) => item.id === other.id)).toEqual(
          other,
        );
      },
    );

    it('activates a Plan_Request whose Plan is now inactive', async () => {
      const request = row(gym, pro, { status: 'pending_payment' });
      store.subscriptions.push(request);
      pro.isActive = false;
      const response = await service.markPaid(request.id);
      expect(response.status).toBe('active');
    });

    it('renews the current Subscription In_Effect from its stored end', async () => {
      const current = row(gym, pro, {
        status: 'active',
        currentPeriodStart: at(-10),
        currentPeriodEnd: new Date('2027-01-31T10:00:00.000Z'),
      });
      store.subscriptions.push(current);
      pro.name = 'Pro Plus';
      pro.maxMembers = 900;

      const response = await service.markPaid(current.id);

      expect(response).toMatchObject({
        status: 'active',
        planName: 'Pro Plus',
        maxMembers: 900,
        currentPeriodStart: at(-10).toISOString(),
        currentPeriodEnd: '2027-02-28T10:00:00.000Z',
      });
    });

    it('restarts an expired current Subscription at the current time', async () => {
      const expired = row(gym, pro, {
        status: 'active',
        currentPeriodStart: at(-40),
        currentPeriodEnd: at(-10),
      });
      store.subscriptions.push(expired);

      const response = await service.markPaid(expired.id);

      expect(response).toMatchObject({
        status: 'active',
        currentPeriodStart: NOW.toISOString(),
        currentPeriodEnd: '2026-12-22T10:00:00.000Z',
      });
    });

    it('rejects renewal of an active row that is not the Current_Subscription', async () => {
      const old = row(gym, basic, {
        status: 'active',
        currentPeriodStart: at(-60),
        currentPeriodEnd: at(-30),
      });
      const current = row(gym, pro, { status: 'active' });
      store.subscriptions.push(old, current);

      await expect(service.markPaid(old.id)).rejects.toThrow(
        new ConflictException('Only the current subscription can be renewed'),
      );
      expect(store.subscriptions).toEqual([old, current]);
    });
  });

  describe('reads', () => {
    it('returns the Current_Subscription, the Plan_Request, and trial use', async () => {
      const expiredTrial = row(gym, pro, {
        status: 'trialing',
        currentPeriodStart: at(-30),
        currentPeriodEnd: at(-16),
      });
      const active = row(gym, basic, { status: 'active' });
      const request = row(gym, pro, { status: 'pending_payment' });
      store.subscriptions.push(expiredTrial, active, request);

      const mine = await service.getMine(gym.ownerId);

      expect(mine.current?.id).toBe(active.id);
      expect(mine.pending?.id).toBe(request.id);
      expect(mine.trialUsed).toBe(true);
    });

    it('returns empty Entitlements when nothing is In_Effect', async () => {
      store.subscriptions.push(
        row(gym, pro, { status: 'pending_payment' }),
        row(gym, basic, {
          status: 'active',
          currentPeriodStart: at(-40),
          currentPeriodEnd: at(-10),
        }),
      );
      expect(await service.getEntitlements(gym.ownerId)).toEqual({
        plan: null,
        status: null,
        featureFlags: [],
        maxMembers: 0,
        maxStaff: 0,
        maxBranches: 0,
        currentPeriodEnd: null,
      });
    });

    it('filters the admin list by reported status', async () => {
      const expired = row(gym, basic, {
        status: 'active',
        currentPeriodStart: at(-40),
        currentPeriodEnd: at(-10),
      });
      const request = row(gym, pro, { status: 'pending_payment' });
      store.subscriptions.push(expired, request);

      const list = await service.list('expired');
      expect(list.subscriptions.map((item) => item.id)).toEqual([expired.id]);
      expect(list.subscriptions[0]?.status).toBe('expired');
      await expect(service.list('cancelled')).rejects.toThrow(
        new BadRequestException('Subscription filter is not valid'),
      );
    });

    it('tells an expired trial apart from an expired paid subscription', async () => {
      const expiredTrial = row(gym, pro, {
        status: 'trialing',
        currentPeriodStart: at(-30),
        currentPeriodEnd: at(-16),
        createdAt: at(-30),
      });
      const expiredPaid = row(gym, basic, {
        status: 'active',
        currentPeriodStart: at(-15),
        currentPeriodEnd: at(-1),
        createdAt: at(-15),
      });
      store.subscriptions.push(expiredTrial, expiredPaid);

      const expired = await service.list('expired');
      expect(
        expired.subscriptions.map((item) => [item.id, item.status, item.isTrial]),
      ).toEqual([
        [expiredTrial.id, 'expired', true],
        [expiredPaid.id, 'expired', false],
      ]);

      const mine = await service.getMine(gym.ownerId);
      expect(mine.current).toMatchObject({
        id: expiredPaid.id,
        status: 'expired',
        isTrial: false,
      });

      store.subscriptions = [expiredTrial];
      expect((await service.getMine(gym.ownerId)).current).toMatchObject({
        id: expiredTrial.id,
        status: 'expired',
        isTrial: true,
      });
    });
  });
});
