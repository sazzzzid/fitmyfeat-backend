import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseRequiredDayRange } from '../../common/validation/list-query.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface PlatformStats {
  userCount: number;
  setupInProgressCount: number;
  pendingCount: number;
  activeCount: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<PlatformStats> {
    return this.prisma.$transaction(
      async (tx) => {
        const userCount = await tx.userAccount.count();
        const grouped = await tx.gym.groupBy({
          by: ['status'],
          _count: { _all: true },
        });
        const counts = new Map(
          grouped.map((row) => [row.status, row._count._all]),
        );
        return {
          userCount,
          setupInProgressCount: counts.get('setup_in_progress') ?? 0,
          pendingCount: counts.get('pending') ?? 0,
          activeCount: counts.get('active') ?? 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async activity(from: unknown, to: unknown): Promise<{
    from: string;
    to: string;
    accountsCreated: number;
    gymsSubmitted: number;
    gymsActivated: number;
    subscriptionsStarted: number;
    subscriptionsExpired: number;
  }> {
    const range = parseRequiredDayRange(from, to);
    const occurred = { gte: range.start, lt: range.endExclusive };
    const [
      accountsCreated,
      gymsSubmitted,
      gymsActivated,
      subscriptionsStarted,
      subscriptionsExpired,
    ] = await Promise.all([
      this.prisma.userAccount.count({ where: { createdAt: occurred } }),
      this.prisma.gym.count({ where: { submittedAt: occurred } }),
      this.prisma.gym.count({ where: { activatedAt: occurred } }),
      this.prisma.subscription.count({ where: { startedAt: occurred } }),
      this.prisma.subscription.count({ where: { expiredAt: occurred } }),
    ]);
    return {
      from: range.from,
      to: range.to,
      accountsCreated,
      gymsSubmitted,
      gymsActivated,
      subscriptionsStarted,
      subscriptionsExpired,
    };
  }
}
