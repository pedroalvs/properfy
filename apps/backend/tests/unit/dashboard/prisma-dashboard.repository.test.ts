import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaDashboardRepository } from '../../../src/modules/dashboard/infrastructure/prisma-dashboard.repository';

function buildPrismaMock(recentAppointments: unknown[]): PrismaClient {
  return {
    appointment: {
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue(recentAppointments),
    },
    financialEntry: { count: vi.fn().mockResolvedValue(0) },
    report: { count: vi.fn().mockResolvedValue(0) },
    property: { count: vi.fn().mockResolvedValue(0) },
    inspector: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    serviceGroup: { count: vi.fn().mockResolvedValue(0) },
  } as unknown as PrismaClient;
}

describe('PrismaDashboardRepository — recent appointments code', () => {
  const baseRow = {
    id: 'apt-1',
    appointment_number: 42,
    status: 'SCHEDULED',
    done_checked_by_user_id: null,
    scheduled_date: new Date('2026-07-10T00:00:00Z'),
    property: {
      property_code: 'PROP-999',
      street: '1 Main St',
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
    },
  };

  it('formats code as tenant prefix + padded appointment number', async () => {
    const prisma = buildPrismaMock([
      { ...baseRow, tenant: { appointment_code_prefix: 'ABC' } },
    ]);
    const repo = new PrismaDashboardRepository(prisma);

    const stats = await repo.getStats(undefined, false, new Date('2026-07-04T10:00:00Z'));

    expect(stats.recentAppointments[0]!.code).toBe('ABC-0042');
  });

  it('falls back to INS prefix when tenant prefix is missing', async () => {
    const prisma = buildPrismaMock([
      { ...baseRow, tenant: { appointment_code_prefix: null } },
    ]);
    const repo = new PrismaDashboardRepository(prisma);

    const stats = await repo.getStats(undefined, false, new Date('2026-07-04T10:00:00Z'));

    expect(stats.recentAppointments[0]!.code).toBe('INS-0042');
  });
});
