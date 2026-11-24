import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { isUniqueViolation } from '../../infrastructure/database/prisma-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  parseCreatePlan,
  parseUpdatePlan,
  toPlanResponse,
  type PlanResponse,
} from './plan-values.js';

// Sorted here rather than in SQL so that the code tie-break uses byte order
// and does not depend on the database collation (which may ignore `_`).
function byPriceThenCode(a: Plan, b: Plan): number {
  if (a.priceMonthlyPaise !== b.priceMonthlyPaise) {
    return a.priceMonthlyPaise - b.priceMonthlyPaise;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

// Placeholders only (AI_RULES.md §63.1). A Super_Admin sets real values and
// activates each Plan; no price or limit is chosen in source code.
const DEFAULT_PLANS = [
  { code: 'basic', name: 'Basic' },
  { code: 'pro', name: 'Pro' },
  { code: 'enterprise', name: 'Enterprise' },
] as const;

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable(): Promise<{ plans: PlanResponse[] }> {
    const plans = await this.prisma.plan.findMany({ where: { isActive: true } });
    return { plans: plans.sort(byPriceThenCode).map(toPlanResponse) };
  }

  async listAll(): Promise<{ plans: PlanResponse[] }> {
    const plans = await this.prisma.plan.findMany();
    return { plans: plans.sort(byPriceThenCode).map(toPlanResponse) };
  }

  async create(body: object): Promise<PlanResponse> {
    const values = parseCreatePlan(body);
    try {
      const plan = await this.prisma.plan.create({ data: values });
      return toPlanResponse(plan);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Plan code is already used');
      }
      throw error;
    }
  }

  async update(code: string, body: object): Promise<PlanResponse> {
    const values = parseUpdatePlan(body);
    const updated = await this.prisma.plan.updateMany({
      where: { code },
      data: values,
    });
    if (updated.count === 0) {
      throw new NotFoundException('Plan was not found');
    }
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan) {
      throw new NotFoundException('Plan was not found');
    }
    return toPlanResponse(plan);
  }

  /** Inserts the three placeholders that do not exist yet. */
  async seedDefaultPlans(): Promise<void> {
    await this.prisma.plan.createMany({
      data: DEFAULT_PLANS.map((plan) => ({
        code: plan.code,
        name: plan.name,
        priceMonthlyPaise: 0,
        trialDays: 0,
        featureFlags: [],
        maxMembers: 0,
        maxStaff: 0,
        maxBranches: 0,
        isActive: false,
      })),
      skipDuplicates: true,
    });
  }
}
