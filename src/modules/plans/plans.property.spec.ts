import { BadRequestException } from '@nestjs/common';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { PlansService } from './plans.service.js';

const MAX_INT = 2_147_483_647;

type Field = [valid: boolean, value: unknown];

function field(
  valid: fc.Arbitrary<unknown>,
  invalid: fc.Arbitrary<unknown>,
): fc.Arbitrary<Field> {
  return fc.oneof(
    valid.map((value): Field => [true, value]),
    invalid.map((value): Field => [false, value]),
  );
}

const flag = fc.stringMatching(/^[a-z][a-z0-9_]{0,63}$/);

const fields = {
  name: field(
    fc
      .string({ minLength: 1, maxLength: 64 })
      .filter((value) => /[^ \t\r\n]/.test(value)),
    fc.constantFrom('', '   ', '\t\r\n', 'x'.repeat(65), 5, null, undefined),
  ),
  priceMonthlyPaise: field(
    fc.integer({ min: 0, max: MAX_INT }),
    fc.constantFrom(-1, 1.5, MAX_INT + 1, '100', null, undefined),
  ),
  trialDays: field(
    fc.integer({ min: 0, max: 365 }),
    fc.constantFrom(-1, 366, 2.5, '7', null, undefined),
  ),
  featureFlags: field(
    fc.uniqueArray(flag, { maxLength: 50 }),
    fc.oneof(
      flag.map((value) => [value, value]),
      fc.constant(['Bad']),
      fc.constant(Array.from({ length: 51 }, (_, index) => `f${index}`)),
      fc.constantFrom('attendance', null, undefined),
    ),
  ),
  maxMembers: field(
    fc.option(fc.integer({ min: 0, max: MAX_INT }), { nil: null }),
    fc.constantFrom(-1, 0.5, '10', undefined),
  ),
  maxStaff: field(
    fc.option(fc.integer({ min: 0, max: MAX_INT }), { nil: null }),
    fc.constantFrom(-1, 0.5, '10', undefined),
  ),
  maxBranches: field(
    fc.option(fc.integer({ min: 0, max: MAX_INT }), { nil: null }),
    fc.constantFrom(-1, 0.5, '10', undefined),
  ),
  isActive: field(
    fc.constantFrom(true, false, undefined),
    fc.constantFrom('yes', 1, null),
  ),
};

const code = field(
  fc.stringMatching(/^[a-z][a-z0-9_]{0,31}$/),
  fc.constantFrom('', 'Pro', '1pro', 'a'.repeat(33), 'pro-plan', 7, null, undefined),
);

function serviceWithMocks() {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'plan-id',
    createdAt: new Date(),
    ...data,
  }));
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const findUnique = vi.fn(async () => ({
    id: 'plan-id',
    code: 'pro',
    name: 'Pro',
    priceMonthlyPaise: 0,
    trialDays: 0,
    featureFlags: [],
    maxMembers: 0,
    maxStaff: 0,
    maxBranches: 0,
    isActive: true,
    createdAt: new Date(),
  }));
  const prisma = { plan: { create, updateMany, findUnique } };
  return {
    service: new PlansService(prisma as unknown as PrismaService),
    create,
    updateMany,
  };
}

describe('plan value properties', () => {
  it('Feature: plan-subscription-engine, Property 3: Plan values are stored exactly or not at all', async () => {
    await fc.assert(
      fc.asyncProperty(code, fc.record(fields), async (codeField, values) => {
        const body: Record<string, unknown> = { code: codeField[1] };
        let allValid = codeField[0];
        for (const [name, [valid, value]] of Object.entries(values)) {
          body[name] = value;
          allValid &&= valid;
        }
        const { service, create } = serviceWithMocks();

        if (!allValid) {
          await expect(service.create(body)).rejects.toThrow(
            new BadRequestException('Plan values are not valid'),
          );
          expect(create).not.toHaveBeenCalled();
          return;
        }
        const response = await service.create(body);
        expect(create).toHaveBeenCalledTimes(1);
        const expected = { ...body, isActive: body.isActive ?? true };
        expect(create.mock.calls[0]?.[0].data).toEqual(expected);
        expect(response).toMatchObject({ ...expected, currency: 'INR' });
      }),
      { numRuns: 300 },
    );
  });

  it('Feature: plan-subscription-engine, Property 3: Plan updates write only the submitted fields', async () => {
    const present = (arbitrary: fc.Arbitrary<Field>) =>
      fc.option(arbitrary, { nil: undefined });
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: present(fields.name),
          priceMonthlyPaise: present(fields.priceMonthlyPaise),
          trialDays: present(fields.trialDays),
          featureFlags: present(fields.featureFlags),
          maxMembers: present(fields.maxMembers),
          maxStaff: present(fields.maxStaff),
          maxBranches: present(fields.maxBranches),
          isActive: present(fields.isActive),
        }),
        async (values) => {
          const body: Record<string, unknown> = {};
          let allValid = true;
          for (const [name, entry] of Object.entries(values)) {
            if (entry === undefined || entry[1] === undefined) {
              continue;
            }
            body[name] = entry[1];
            allValid &&= entry[0];
          }
          const { service, updateMany } = serviceWithMocks();

          if (!allValid || Object.keys(body).length === 0) {
            await expect(service.update('pro', body)).rejects.toThrow(
              'Plan values are not valid',
            );
            expect(updateMany).not.toHaveBeenCalled();
            return;
          }
          await service.update('pro', body);
          expect(updateMany).toHaveBeenCalledWith({
            where: { code: 'pro' },
            data: body,
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});
