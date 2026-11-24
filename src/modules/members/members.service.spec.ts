import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Member, Membership, MembershipProduct } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { StaffService } from '../staff/staff.service.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { MembersService } from './members.service.js';

const NOW = new Date('2026-11-22T10:00:00.000Z');
const DAY = 86_400_000;
const GYM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function at(days: number): Date {
  return new Date(NOW.getTime() + days * DAY);
}

interface Store {
  members: Member[];
  products: MembershipProduct[];
  memberships: Membership[];
  maxMembers: number | null;
  gymStatus: 'setup_in_progress' | 'pending' | 'active';
}

function createHarness(store: Store) {
  const member = {
    count: async ({ where }: { where: { gymId: string; leftAt?: Date | null } }) =>
      store.members.filter((row) => {
        if (row.gymId !== where.gymId) {
          return false;
        }
        if (Object.prototype.hasOwnProperty.call(where, 'leftAt')) {
          return row.leftAt === where.leftAt;
        }
        return true;
      }).length,
    create: async ({ data }: { data: Partial<Member> }) => {
      const row: Member = {
        id: crypto.randomUUID(),
        gymId: data.gymId ?? GYM,
        fullName: data.fullName ?? '',
        contact: data.contact ?? '',
        notes: data.notes ?? null,
        leftAt: null,
        createdAt: new Date(),
      };
      store.members.push(row);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; gymId: string };
      data: Partial<Member>;
    }) => {
      const row = store.members.find((item) => item.id === where.id && item.gymId === where.gymId);
      if (!row) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    },
    findMany: async () =>
      store.members.map((row) => ({
        ...row,
        membership: store.memberships.find((item) => item.memberId === row.id) ?? null,
      })),
    findFirst: async ({
      where,
    }: {
      where: { id?: string; gymId: string; contact?: string };
    }) => {
      const row = store.members.find((item) => {
        if (item.gymId !== where.gymId) {
          return false;
        }
        if (where.id !== undefined && item.id !== where.id) {
          return false;
        }
        if (where.contact !== undefined && item.contact !== where.contact) {
          return false;
        }
        return true;
      });
      if (!row) {
        return null;
      }
      return {
        ...row,
        membership: store.memberships.find((item) => item.memberId === row.id) ?? null,
      };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Member>;
    }) => {
      const row = store.members.find((item) => item.id === where.id);
      if (!row) {
        throw new Error('missing');
      }
      Object.assign(row, data);
      return row;
    },
    findFirstOrThrow: async (args: { where: { id: string; gymId?: string } }) => {
      const row = store.members.find((item) => item.id === args.where.id);
      if (!row) {
        throw new Error('missing');
      }
      return {
        ...row,
        membership: store.memberships.find((item) => item.memberId === row.id) ?? null,
      };
    },
  };
  const membershipProduct = {
    create: async ({ data }: { data: Partial<MembershipProduct> }) => {
      const row: MembershipProduct = {
        id: crypto.randomUUID(),
        gymId: data.gymId ?? GYM,
        name: data.name ?? '',
        pricePaise: data.pricePaise ?? 0,
        durationDays: data.durationDays ?? 1,
        isActive: data.isActive ?? true,
        createdAt: new Date(),
      };
      store.products.push(row);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; gymId: string };
      data: Partial<MembershipProduct>;
    }) => {
      const row = store.products.find((item) => item.id === where.id && item.gymId === where.gymId);
      if (!row) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    },
    findMany: async () => [...store.products],
    findFirst: async ({ where }: { where: { id: string; gymId: string } }) =>
      store.products.find((item) => item.id === where.id && item.gymId === where.gymId) ?? null,
    findFirstOrThrow: async ({ where }: { where: { id: string; gymId: string } }) => {
      const row = store.products.find((item) => item.id === where.id && item.gymId === where.gymId);
      if (!row) {
        throw new Error('missing');
      }
      return row;
    },
  };
  const membership = {
    create: async ({ data }: { data: Partial<Membership> }) => {
      const row = {
        id: crypto.randomUUID(),
        memberId: data.memberId ?? '',
        productId: data.productId ?? '',
        gymId: data.gymId ?? GYM,
        status: data.status ?? 'active',
        productName: data.productName ?? '',
        pricePaise: data.pricePaise ?? 0,
        durationDays: data.durationDays ?? 1,
        currentPeriodStart: data.currentPeriodStart ?? NOW,
        currentPeriodEnd: data.currentPeriodEnd ?? NOW,
        frozenAt: data.frozenAt ?? null,
        createdAt: new Date(),
      } as Membership;
      store.memberships.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Membership> }) => {
      const row = store.memberships.find((item) => item.id === where.id);
      if (!row) {
        throw new Error('missing');
      }
      Object.assign(row, data);
      return row;
    },
  };
  const client = {
    member,
    membershipProduct,
    membership,
    membershipPayment: {
      create: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(client),
  };
  const gyms = {
    getMine: async () => {
      if (store.gymStatus === 'setup_in_progress' && store.members.length < 0) {
        throw new NotFoundException('Gym was not found');
      }
      return {
        id: GYM,
        status: store.gymStatus,
        gymName: 'Iron',
        address: null,
        contact: null,
        timing: null,
        logoValue: null,
      };
    },
  };
  const subscriptions = {
    entitlementsForGym: async () => ({
      plan: { code: 'pro', name: 'Pro' },
      status: 'active' as const,
      featureFlags: [],
      maxMembers: store.maxMembers,
      maxStaff: null,
      maxBranches: null,
      currentPeriodEnd: at(30).toISOString(),
    }),
  };
  const staff = {
    gymForCaller: async () => gyms.getMine(),
  };
  return new MembersService(
    client as unknown as PrismaService,
    staff as unknown as StaffService,
    subscriptions as unknown as SubscriptionsService,
  );
}

function store(partial: Partial<Store> = {}): Store {
  return {
    members: [],
    products: [],
    memberships: [],
    maxMembers: null,
    gymStatus: 'active',
    ...partial,
  };
}

describe('MembersService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const body = { fullName: 'Asha Rao', contact: '555-0100' };
  const payment = {
    amountReceivedPaise: 100,
    paidOn: '2026-11-22',
    method: 'cash' as const,
  };
  const sale = (productId: string) => ({ productId, ...payment });

  it('rejects a gym that is not active and a reached limit', async () => {
    const pending = store({ gymStatus: 'pending' });
    await expect(createHarness(pending).createMember('owner', body)).rejects.toThrow(
      new ConflictException('Member management requires an active gym'),
    );
    expect(pending.members).toHaveLength(0);

    const blocked = store({ maxMembers: 0 });
    await expect(createHarness(blocked).createMember('owner', body)).rejects.toThrow(
      'Member limit reached',
    );

    const full = store({ maxMembers: 1 });
    const service = createHarness(full);
    await service.createMember('owner', body);
    await expect(service.createMember('owner', { ...body, fullName: 'Bea', contact: '555-0199' })).rejects.toThrow(
      'Member limit reached',
    );
    expect(full.members).toHaveLength(1);
  });

  it('allows unlimited creates and updates a member above a later limit', async () => {
    const open = store({ maxMembers: null });
    const service = createHarness(open);
    const created = await service.createMember('owner', body);
    expect(created.membership).toBeNull();
    open.maxMembers = 0;
    const updated = await service.updateMember('owner', created.id, { contact: '555-0199' });
    expect(updated.contact).toBe('555-0199');
    expect(open.members).toHaveLength(1);
  });

  it('hides a member that belongs to another gym', async () => {
    const data = store();
    data.members.push({
      id: OTHER,
      gymId: '33333333-3333-4333-8333-333333333333',
      fullName: 'Other',
      contact: '1',
      notes: null,
      leftAt: null,
      createdAt: NOW,
    });
    await expect(createHarness(data).updateMember('owner', OTHER, { fullName: 'Nope' })).rejects.toThrow(
      new NotFoundException('Member was not found'),
    );
    expect(data.members[0]?.fullName).toBe('Other');
  });

  it('assigns once, renews an in-effect and an expired membership, and rejects a frozen renew', async () => {
    const data = store();
    const service = createHarness(data);
    const member = await service.createMember('owner', body);
    const product = await service.createProduct('owner', {
      name: 'Monthly',
      pricePaise: 100,
      durationDays: 30,
    });
    const assigned = await service.assign('owner', member.id, sale(product.id));
    expect(assigned.membership).toMatchObject({
      status: 'active',
      productName: 'Monthly',
      pricePaise: 100,
      durationDays: 30,
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: at(30).toISOString(),
    });
    await expect(service.assign('owner', member.id, sale(product.id))).rejects.toThrow(
      'Member already has a membership',
    );
    expect(data.memberships).toHaveLength(1);

    data.products[0]!.name = 'Monthly Plus';
    data.products[0]!.pricePaise = 250;
    data.products[0]!.isActive = false;
    const renewed = await service.renew('owner', member.id, payment);
    expect(renewed.membership).toMatchObject({
      productName: 'Monthly Plus',
      pricePaise: 250,
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: at(60).toISOString(),
    });

    data.memberships[0]!.currentPeriodEnd = at(-1);
    const restarted = await service.renew('owner', member.id, payment);
    expect(restarted.membership).toMatchObject({
      status: 'active',
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: at(30).toISOString(),
    });

    data.memberships[0]!.currentPeriodEnd = at(10);
    await service.freeze('owner', member.id);
    await expect(service.renew('owner', member.id, payment)).rejects.toThrow('Membership is frozen');
  });

  it('freezes only an in-effect membership and unfreezes by the elapsed time', async () => {
    const data = store();
    const service = createHarness(data);
    const member = await service.createMember('owner', body);
    const product = await service.createProduct('owner', {
      name: 'Weekly',
      pricePaise: 50,
      durationDays: 10,
    });
    await service.assign('owner', member.id, sale(product.id));
    data.memberships[0]!.currentPeriodEnd = at(-1);
    await expect(service.freeze('owner', member.id)).rejects.toThrow(
      'Only an active membership can be frozen',
    );

    data.memberships[0]!.currentPeriodEnd = at(10);
    const frozen = await service.freeze('owner', member.id);
    expect(frozen.membership?.status).toBe('frozen');
    expect(frozen.membership?.currentPeriodEnd).toBe(at(10).toISOString());
    await expect(service.freeze('owner', member.id)).rejects.toThrow(
      'Only an active membership can be frozen',
    );

    vi.setSystemTime(at(4));
    const resumed = await service.unfreeze('owner', member.id);
    expect(resumed.membership).toMatchObject({
      status: 'active',
      frozenAt: null,
      currentPeriodEnd: at(14).toISOString(),
    });
    await expect(service.unfreeze('owner', member.id)).rejects.toThrow(
      'Membership is not frozen',
    );
  });

  it('rejects an inactive product on assign and keeps the snapshot after a product edit', async () => {
    const data = store();
    const service = createHarness(data);
    const member = await service.createMember('owner', body);
    const product = await service.createProduct('owner', {
      name: 'Monthly',
      pricePaise: 100,
      durationDays: 30,
      isActive: false,
    });
    await expect(service.assign('owner', member.id, sale(product.id))).rejects.toThrow(
      'Membership product is not active',
    );
    await service.updateProduct('owner', product.id, { isActive: true });
    await service.assign('owner', member.id, sale(product.id));
    await service.updateProduct('owner', product.id, { name: 'Changed', pricePaise: 9 });
    const listed = await service.listMembers('owner');
    expect(listed.members[0]?.membership).toMatchObject({
      productName: 'Monthly',
      pricePaise: 100,
    });
  });

  it('switches the product, frees a seat when a member leaves, and warns on a repeated contact', async () => {
    const data = store({ maxMembers: 1 });
    const service = createHarness(data);
    const member = await service.createMember('owner', body);
    const monthly = await service.createProduct('owner', {
      name: 'Monthly',
      pricePaise: 100,
      durationDays: 30,
    });
    const quarter = await service.createProduct('owner', {
      name: 'Quarter',
      pricePaise: 250,
      durationDays: 90,
    });
    await service.assign('owner', member.id, sale(monthly.id));
    data.memberships[0]!.currentPeriodEnd = at(20);
    const switched = await service.switchProduct('owner', member.id, sale(quarter.id));
    expect(switched.membership).toMatchObject({
      status: 'active',
      productName: 'Quarter',
      durationDays: 90,
      pricePaise: 250,
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: at(90).toISOString(),
      frozenAt: null,
    });

    await service.leave('owner', member.id);
    expect((await service.listMembers('owner')).members).toHaveLength(0);
    expect((await service.listMembers('owner', 'left')).members).toHaveLength(1);
    const next = await service.createMember('owner', { fullName: 'Bea', contact: '556' });
    expect(next.fullName).toBe('Bea');
    data.maxMembers = 5;
    await expect(service.assign('owner', member.id, sale(quarter.id))).rejects.toThrow(
      'Member has left',
    );

    await expect(service.createMember('owner', { fullName: 'Copy', contact: '556' })).rejects.toThrow(
      'Contact is already used by Bea',
    );
    const allowed = await service.createMember('owner', {
      fullName: 'Child',
      contact: '556',
      allowDuplicateContact: true,
    });
    expect(allowed.contact).toBe('556');
  });
});
