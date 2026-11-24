import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('maps a missing status count to 0 and returns only the four count names', async () => {
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          userAccount: { count: async () => 2 },
          gym: {
            groupBy: async () => [
              { status: 'active', _count: { _all: 3 } },
            ],
          },
        }),
      ),
    };
    const service = new DashboardService(prisma as unknown as PrismaService);
    const stats = await service.getStats();
    expect(stats).toEqual({
      userCount: 2,
      setupInProgressCount: 0,
      pendingCount: 0,
      activeCount: 3,
    });
    expect(Object.keys(stats)).toEqual([
      'userCount',
      'setupInProgressCount',
      'pendingCount',
      'activeCount',
    ]);
    expect(Object.keys(stats)).not.toContain('revenue');
    expect(Object.keys(stats)).not.toContain('attendance');
  });
});
