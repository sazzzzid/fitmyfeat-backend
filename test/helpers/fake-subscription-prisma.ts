import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Prisma, type Plan, type Subscription } from '@prisma/client';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { FinanceService } from '../../src/modules/finance/finance.service.js';
import type { GymsService } from '../../src/modules/gyms/gyms.service.js';

/**
 * In-memory stand-in for the parts of Prisma that SubscriptionsService uses.
 * It enforces the two partial unique indexes so unit tests see the same
 * P2002 errors as PostgreSQL.
 */
export interface FakeGym {
  id: string;
  ownerId: string;
  status: 'setup_in_progress' | 'pending' | 'active';
  gymName: string | null;
  ownerEmail: string;
}

export interface FakeStore {
  gyms: FakeGym[];
  plans: Plan[];
  subscriptions: Subscription[];
  charges: Array<Record<string, unknown>>;
}

type Where = Record<string, unknown>;
type Include = Record<string, unknown> | undefined;

export function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: randomUUID(),
    code: 'pro',
    name: 'Pro',
    priceMonthlyPaise: 149_900,
    trialDays: 14,
    featureFlags: ['attendance'],
    maxMembers: 500,
    maxStaff: 10,
    maxBranches: null,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeGym(overrides: Partial<FakeGym> = {}): FakeGym {
  return {
    id: randomUUID(),
    ownerId: randomUUID(),
    status: 'active',
    gymName: 'Iron Works',
    ownerEmail: 'owner@gym.test',
    ...overrides,
  };
}

export function createFakeStore(): FakeStore {
  return { gyms: [], plans: [], subscriptions: [], charges: [] };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function matchesValue(actual: unknown, condition: unknown): boolean {
  if (
    condition !== null &&
    typeof condition === 'object' &&
    !(condition instanceof Date)
  ) {
    const filter = condition as Record<string, unknown>;
    if ('in' in filter) {
      return (filter.in as unknown[]).includes(actual);
    }
    if ('not' in filter) {
      return actual !== filter.not;
    }
    if ('gt' in filter) {
      return actual instanceof Date && actual > (filter.gt as Date);
    }
    if ('lte' in filter) {
      return actual instanceof Date && actual <= (filter.lte as Date);
    }
    throw new Error(`Unsupported filter ${JSON.stringify(filter)}`);
  }
  return actual === condition;
}

function matches(row: object, where: Where = {}): boolean {
  return Object.entries(where).every(([key, condition]) =>
    matchesValue((row as Record<string, unknown>)[key], condition),
  );
}

function checkUnique(store: FakeStore, row: Subscription): void {
  if (row.status !== 'trialing' && row.status !== 'pending_payment') {
    return;
  }
  const clash = store.subscriptions.some(
    (other) =>
      other.id !== row.id &&
      other.gymId === row.gymId &&
      other.status === row.status,
  );
  if (clash) {
    throw uniqueViolation();
  }
}

export function fakeSubscriptionPrisma(store: FakeStore): PrismaService {
  const shape = (row: Subscription, include: Include) => {
    if (!include) {
      return { ...row, featureFlags: [...row.featureFlags] };
    }
    const result: Record<string, unknown> = {
      ...row,
      featureFlags: [...row.featureFlags],
    };
    if (include.plan) {
      const plan = store.plans.find((item) => item.id === row.planId);
      result.plan = plan ? { ...plan, featureFlags: [...plan.featureFlags] } : null;
    }
    if (include.gym) {
      const gym = store.gyms.find((item) => item.id === row.gymId);
      result.gym = gym
        ? { gymName: gym.gymName, owner: { email: gym.ownerEmail } }
        : null;
    }
    return result;
  };

  const subscription = {
    findMany: async ({
      where,
      include,
    }: { where?: Where; include?: Include } = {}) =>
      store.subscriptions
        .filter((row) => matches(row, where))
        .map((row) => shape(row, include)),
    findUnique: async ({ where, include }: { where: Where; include?: Include }) => {
      const row = store.subscriptions.find((item) => matches(item, where));
      return row ? shape(row, include) : null;
    },
    findUniqueOrThrow: async ({
      where,
      include,
    }: {
      where: Where;
      include?: Include;
    }) => {
      const row = store.subscriptions.find((item) => matches(item, where));
      if (!row) {
        throw new Error('Record not found');
      }
      return shape(row, include);
    },
    create: async ({
      data,
      include,
    }: {
      data: Partial<Subscription>;
      include?: Include;
    }) => {
      const row: Subscription = {
        id: randomUUID(),
        gymId: data.gymId ?? '',
        planId: data.planId ?? '',
        status: data.status ?? 'pending_payment',
        planName: data.planName ?? null,
        priceMonthlyPaise: data.priceMonthlyPaise ?? null,
        featureFlags: data.featureFlags ? [...data.featureFlags] : [],
        maxMembers: data.maxMembers ?? null,
        maxStaff: data.maxStaff ?? null,
        maxBranches: data.maxBranches ?? null,
        currentPeriodStart: data.currentPeriodStart ?? null,
        currentPeriodEnd: data.currentPeriodEnd ?? null,
        startedAt: data.startedAt ?? null,
        expiredAt: data.expiredAt ?? null,
        createdAt: new Date(),
      };
      checkUnique(store, row);
      store.subscriptions.push(row);
      return shape(row, include);
    },
    update: async ({
      where,
      data,
      include,
    }: {
      where: Where;
      data: Partial<Subscription>;
      include?: Include;
    }) => {
      const index = store.subscriptions.findIndex((item) => matches(item, where));
      const current = store.subscriptions[index];
      if (!current) {
        throw new Error('Record to update not found');
      }
      const next = { ...current, ...data } as Subscription;
      checkUnique(store, next);
      store.subscriptions[index] = next;
      return shape(next, include);
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<Subscription>;
    }) => {
      let count = 0;
      store.subscriptions = store.subscriptions.map((row) => {
        if (!matches(row, where)) {
          return row;
        }
        count += 1;
        return { ...row, ...data } as Subscription;
      });
      return { count };
    },
  };

  const plan = {
    findFirst: async ({ where }: { where: Where }) =>
      store.plans.find((item) => matches(item, where)) ?? null,
  };

  const client: Record<string, unknown> = {
    subscription,
    plan,
    platformCharge: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: randomUUID(), refundedAt: null, ...data };
        store.charges.push(row);
        return row;
      },
    },
    $queryRaw: async () => [],
  };
  client.$transaction = async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(client);
  return client as unknown as PrismaService;
}

export function fakeGymsService(store: FakeStore): GymsService {
  return {
    getMine: async (ownerId: string) => {
      const gym = store.gyms.find((item) => item.ownerId === ownerId);
      if (!gym) {
        throw new NotFoundException('Gym was not found');
      }
      return {
        id: gym.id,
        status: gym.status,
        gymName: gym.gymName,
        address: null,
        contact: null,
        timing: null,
        logoValue: null,
      };
    },
  } as unknown as GymsService;
}

export function fakeFinanceService(prisma: PrismaService): FinanceService {
  return new FinanceService(prisma, fakeGymsService(createFakeStore()), {
    get: () => 0,
  } as never);
}
