import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type RoleTemplate, type StaffMember } from '@prisma/client';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { GymsService } from '../gyms/gyms.service.js';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { StaffService } from './staff.service.js';

const GYM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface UserRow {
  id: string;
  email: string;
  emailKey: string;
  passwordHash: string;
  roleId: string;
}

interface AuditRow {
  id: string;
  gymId: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: Date;
}

interface Store {
  gymStatus: 'setup_in_progress' | 'pending' | 'active';
  maxStaff: number | null;
  templates: RoleTemplate[];
  staff: StaffMember[];
  users: UserRow[];
  audits: AuditRow[];
  clock: number;
}

function createHarness(partial: Partial<Store> = {}) {
  const store: Store = {
    gymStatus: 'active',
    maxStaff: null,
    templates: [
      template('Owner', 1, true, true, true),
      template('Manager', 2, true, true, false),
      template('Staff', 3, true, false, false),
    ],
    staff: [],
    users: [],
    audits: [],
    clock: 0,
    ...partial,
  };
  const client = {
    role: {
      findUnique: async () => ({ id: 'role-staff', name: 'Gym_Staff' }),
    },
    gym: {
      findUnique: async ({ where }: { where: { ownerId: string } }) =>
        where.ownerId === OWNER
          ? {
              id: GYM,
              ownerId: OWNER,
              status: store.gymStatus,
              gymName: 'Iron',
              address: null,
              contact: null,
              timing: null,
              logoValue: null,
            }
          : null,
    },
    roleTemplate: {
      findUnique: async ({ where }: { where: { name?: string; id?: string } }) => {
        const row = store.templates.find(
          (item) => item.name === where.name || item.id === where.id,
        );
        return row ? { ...row } : null;
      },
      findMany: async () =>
        [...store.templates]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((row) => ({ ...row })),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<RoleTemplate>;
      }) => {
        const row = store.templates.find((item) => item.id === where.id);
        if (!row) {
          throw new Error('missing template');
        }
        Object.assign(row, data);
        return { ...row };
      },
    },
    userAccount: {
      create: async ({ data }: { data: Omit<UserRow, 'id'> }) => {
        if (store.users.some((user) => user.emailKey === data.emailKey)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = { ...data, id: crypto.randomUUID() };
        store.users.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<UserRow>;
      }) => {
        const row = store.users.find((user) => user.id === where.id);
        if (!row) {
          throw new Error('missing user');
        }
        Object.assign(row, data);
        return row;
      },
    },
    staffMember: {
      count: async ({ where }: { where: { gymId: string; disabledAt: null } }) =>
        store.staff.filter((row) => row.gymId === where.gymId && row.disabledAt === null).length,
      findMany: async ({ where }: { where: { gymId: string } }) =>
        store.staff
          .filter((row) => row.gymId === where.gymId)
          .sort(byCreated)
          .map(withRelations),
      findFirst: async ({ where }: { where: { id: string; gymId: string } }) => {
        const row = store.staff.find((item) => item.id === where.id && item.gymId === where.gymId);
        return row ? withRelations(row) : null;
      },
      findUnique: async ({ where }: { where: { userId: string } }) => {
        const row = store.staff.find((item) => item.userId === where.userId);
        if (!row) {
          return null;
        }
        return { ...withRelations(row), gym: gymRow() };
      },
      create: async ({ data }: { data: Omit<StaffMember, 'id' | 'disabledAt' | 'createdAt'> }) => {
        store.clock += 1;
        const row: StaffMember = {
          ...data,
          id: crypto.randomUUID(),
          disabledAt: null,
          createdAt: new Date(store.clock),
        };
        store.staff.push(row);
        return withRelations(row);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<StaffMember>;
      }) => {
        const row = store.staff.find((item) => item.id === where.id);
        if (!row) {
          throw new Error('missing staff');
        }
        Object.assign(row, data);
        return withRelations(row);
      },
    },
    auditLog: {
      create: async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> & { gymId?: string } }) => {
        store.clock += 1;
        const row: AuditRow = {
          gymId: data.gymId ?? null,
          actorUserId: data.actorUserId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          detail: data.detail,
          id: crypto.randomUUID(),
          createdAt: new Date(store.clock),
        };
        store.audits.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { gymId: string | null } }) =>
        store.audits
          .filter((row) => row.gymId === where.gymId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
          .map((row) => ({
            ...row,
            actor: { email: store.users.find((user) => user.id === row.actorUserId)?.email ?? 'owner@gym.test' },
          })),
    },
    $queryRaw: async () => [],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const saved = structuredClone(store);
      try {
        return await callback(client);
      } catch (error) {
        store.templates = saved.templates;
        store.staff = saved.staff;
        store.users = saved.users;
        store.audits = saved.audits;
        store.clock = saved.clock;
        throw error;
      }
    },
  };
  function withRelations(row: StaffMember) {
    const template = store.templates.find((item) => item.id === row.templateId);
    const user = store.users.find((item) => item.id === row.userId);
    return {
      ...row,
      user: { email: user?.email ?? '' },
      template: { name: template?.name ?? '' },
    };
  }
  function gymRow() {
    return {
      id: GYM,
      ownerId: OWNER,
      status: store.gymStatus,
      gymName: 'Iron',
      address: null,
      contact: null,
      timing: null,
      logoValue: null,
    };
  }
  const gyms = {
    getMine: async (ownerId: string) => {
      if (ownerId !== OWNER) {
        throw new NotFoundException('Gym was not found');
      }
      return gymRow();
    },
  };
  const subscriptions = {
    entitlementsForGym: async () => ({
      plan: null,
      status: null,
      featureFlags: [],
      maxMembers: null,
      maxStaff: store.maxStaff,
      maxBranches: null,
      currentPeriodEnd: null,
    }),
  };
  return {
    store,
    service: new StaffService(
      client as unknown as PrismaService,
      gyms as unknown as GymsService,
      subscriptions as unknown as SubscriptionsService,
    ),
  };
}

function template(
  name: string,
  sortOrder: number,
  canView: boolean,
  canCreate: boolean,
  canManage: boolean,
): RoleTemplate {
  return {
    id: crypto.randomUUID(),
    name,
    sortOrder,
    canView,
    canCreate,
    canManage,
    createdAt: new Date(0),
  };
}

function byCreated(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) {
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);
}

const body = {
  email: 'ria@gym.test',
  password: 'staff-password',
  fullName: 'Ria Sen',
  title: 'trainer',
  template: 'Staff',
};

describe('StaffService', () => {
  it('rejects a gym that is not active and a reached limit', async () => {
    const pending = createHarness({ gymStatus: 'pending' });
    await expect(pending.service.create(OWNER, body)).rejects.toThrow(
      new ConflictException('Staff management requires an active gym'),
    );
    expect(pending.store.users).toHaveLength(0);

    const blocked = createHarness({ maxStaff: 0 });
    await expect(blocked.service.create(OWNER, body)).rejects.toThrow(
      new ConflictException('Staff limit reached'),
    );
    expect(blocked.store.staff).toHaveLength(0);
    expect(blocked.store.audits).toHaveLength(0);

    const full = createHarness({ maxStaff: 1 });
    await full.service.create(OWNER, body);
    await expect(
      full.service.create(OWNER, { ...body, email: 'second@gym.test' }),
    ).rejects.toThrow('Staff limit reached');
    expect(full.store.staff).toHaveLength(1);
    expect(full.store.audits).toHaveLength(1);
  });

  it('allows an unlimited limit and an update after the limit drops', async () => {
    const open = createHarness({ maxStaff: null });
    const created = await open.service.create(OWNER, body);
    expect(created).not.toHaveProperty('password');
    expect(created.view).toBe(true);
    expect(created.create).toBe(false);
    open.store.maxStaff = 0;
    const updated = await open.service.update(OWNER, created.id, { fullName: 'Ria S.' });
    expect(updated.fullName).toBe('Ria S.');
  });

  it('rejects a duplicate email and a staff id from another gym', async () => {
    const harness = createHarness();
    await harness.service.create(OWNER, body);
    await expect(harness.service.create(OWNER, body)).rejects.toThrow(
      'Email_Address is already used',
    );
    expect(harness.store.users).toHaveLength(1);
    const outsider = crypto.randomUUID();
    harness.store.staff.push({
      ...harness.store.staff[0]!,
      id: outsider,
      gymId: OTHER,
      userId: crypto.randomUUID(),
    });
    await expect(harness.service.update(OWNER, outsider, { title: 'reception' })).rejects.toThrow(
      new NotFoundException('Staff member was not found'),
    );
    expect(harness.store.audits).toHaveLength(1);
  });

  it('rejects a second disable and an enable that would pass the limit', async () => {
    const harness = createHarness({ maxStaff: 1 });
    const first = await harness.service.create(OWNER, body);
    await harness.service.disable(OWNER, first.id);
    await expect(harness.service.disable(OWNER, first.id)).rejects.toThrow(
      'Staff member is already disabled',
    );
    const second = await harness.service.create(OWNER, { ...body, email: 'b@gym.test' });
    await expect(harness.service.enable(OWNER, first.id)).rejects.toThrow('Staff limit reached');
    expect(harness.store.staff.find((row) => row.id === first.id)?.disabledAt).not.toBeNull();
    expect(second.disabled).toBe(false);
  });

  it('leaves stored staff flags unchanged when a template is edited', async () => {
    const harness = createHarness();
    const created = await harness.service.create(OWNER, { ...body, template: 'Manager' });
    await harness.service.updateTemplate(OWNER, 'Manager', { manage: true });
    const stored = harness.store.staff.find((row) => row.id === created.id);
    expect(stored?.canManage).toBe(false);
    expect(harness.store.audits.at(-1)?.detail).toMatchObject({
      name: 'Manager',
      before: { manage: false },
      after: { manage: true },
    });
  });

  it('records a password change without the password', async () => {
    const harness = createHarness();
    const created = await harness.service.create(OWNER, body);
    await harness.service.update(OWNER, created.id, { password: 'next-password' });
    const detail = JSON.stringify(harness.store.audits.at(-1)?.detail);
    expect(detail).toContain('passwordChanged');
    expect(detail).not.toContain('next-password');
    expect(harness.store.users[0]?.passwordHash).not.toBe('next-password');
  });

  it('rejects an unknown template and an empty template update', async () => {
    const harness = createHarness();
    harness.store.templates.splice(0, harness.store.templates.length);
    await expect(harness.service.create(OWNER, body)).rejects.toThrow(
      'Role template was not found',
    );
    expect(harness.store.audits).toHaveLength(0);
    const again = createHarness();
    await expect(again.service.updateTemplate(OWNER, 'Nope', { view: false })).rejects.toThrow(
      'Role template was not found',
    );
    await expect(again.service.updateTemplate(OWNER, 'Owner', {})).rejects.toThrow(
      'Role template values are not valid',
    );
    expect(again.store.audits).toHaveLength(0);
  });

  it('resolves the caller gym for an owner, staff, a disabled staff member, and neither', async () => {
    const harness = createHarness();
    await expect(harness.service.gymForCaller(OWNER)).resolves.toMatchObject({
      id: GYM,
      status: 'active',
    });
    const created = await harness.service.create(OWNER, body);
    const staffUserId = harness.store.staff[0]!.userId;
    await expect(harness.service.gymForCaller(staffUserId)).resolves.toMatchObject({ id: GYM });
    await harness.service.disable(OWNER, created.id);
    await expect(harness.service.gymForCaller(staffUserId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(harness.service.gymForCaller('missing')).rejects.toThrow('Gym was not found');
  });
});

const flagRecord = fc.record({
  view: fc.boolean(),
  create: fc.boolean(),
  manage: fc.boolean(),
});

function containsSecret(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'password' || key === 'passwordHash' || containsSecret(child)) {
      return true;
    }
  }
  return false;
}

describe('staff permission properties', () => {
  it('Feature: staff-permissions, Property 2: Template edits do not change stored staff', async () => {
    await fc.assert(
      fc.asyncProperty(flagRecord, flagRecord, async (edited, direct) => {
        const harness = createHarness();
        const created = await harness.service.create(OWNER, body);
        const original = harness.store.staff.find((row) => row.id === created.id);
        const templateId = original?.templateId;
        const flags = {
          canView: original?.canView,
          canCreate: original?.canCreate,
          canManage: original?.canManage,
        };
        await harness.service.updateTemplate(OWNER, 'Staff', edited);
        const afterEdit = harness.store.staff.find((row) => row.id === created.id);
        expect(afterEdit).toMatchObject({ ...flags, templateId });
        const patched = await harness.service.update(OWNER, created.id, {
          view: direct.view,
        });
        expect(harness.store.staff.find((row) => row.id === created.id)?.templateId).toBe(
          templateId,
        );
        expect(patched.view).toBe(direct.view);
        await harness.service.update(OWNER, created.id, { template: 'Staff' });
        const template = harness.store.templates.find((row) => row.name === 'Staff');
        expect(harness.store.staff.find((row) => row.id === created.id)).toMatchObject({
          canView: template?.canView,
          canCreate: template?.canCreate,
          canManage: template?.canManage,
        });
      }),
      { numRuns: 100 },
    );
  }, 120_000);

  it('Feature: staff-permissions, Property 4: Audit rows match successful writes', async () => {
    await fc.assert(
      fc.asyncProperty(flagRecord, async (flags) => {
        const rejected = createHarness({ maxStaff: 0 });
        await expect(rejected.service.create(OWNER, body)).rejects.toThrow('Staff limit reached');
        expect(rejected.store.audits).toHaveLength(0);

        const harness = createHarness();
        const before = harness.store.audits.length;
        const created = await harness.service.create(OWNER, {
          ...body,
          password: 'secret-password',
        });
        expect(harness.store.audits).toHaveLength(before + 1);
        const staffAudit = harness.store.audits.at(-1);
        expect(staffAudit?.action).toBe('staff_created');
        expect(staffAudit?.gymId).toBe(GYM);
        expect(containsSecret(staffAudit?.detail)).toBe(false);

        await harness.service.updateTemplate(OWNER, 'Owner', flags);
        const templateAudit = harness.store.audits.at(-1);
        expect(templateAudit?.action).toBe('template_updated');
        expect(templateAudit?.gymId).toBeNull();
        expect(containsSecret(templateAudit?.detail)).toBe(false);
        expect(harness.store.staff.find((row) => row.id === created.id)?.canView).toBe(true);
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});
