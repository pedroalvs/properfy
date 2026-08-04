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

// The "Reports processing" tile became visible to agencies, so its count must
// match what /reports actually lists: own tenant AND agency-scoped runs only.
// Without the second predicate an operator run targeting this agency would be
// counted but never listed.
describe('PrismaDashboardRepository — pending financial entries scope', () => {
  // The count alone would reveal pending payout activity to an agency, which is
  // the same leak class the list/summary/export already exclude.
  it('excludes the inspector leg for a tenant-scoped actor', async () => {
    const prisma = buildPrismaMock([]);
    const repo = new PrismaDashboardRepository(prisma);

    await repo.getStats('tenant-1', false, new Date('2026-07-04T10:00:00Z'));

    expect(prisma.financialEntry.count).toHaveBeenCalledWith({
      where: {
        tenant_id: 'tenant-1',
        entry_type: { in: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'] },
        inspector_id: null,
        status: 'PENDING',
      },
    });
  });

  it('counts every pending entry for an operator (no tenant scope)', async () => {
    const prisma = buildPrismaMock([]);
    const repo = new PrismaDashboardRepository(prisma);

    await repo.getStats(undefined, true, new Date('2026-07-04T10:00:00Z'));

    expect(prisma.financialEntry.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
  });
});

describe('PrismaDashboardRepository — processing reports scope', () => {
  it('counts only agency-scoped reports for a tenant-scoped actor', async () => {
    const prisma = buildPrismaMock([]);
    const repo = new PrismaDashboardRepository(prisma);

    await repo.getStats('tenant-1', false, new Date('2026-07-04T10:00:00Z'));

    expect(prisma.report.count).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', agency_scoped: true, status: 'PROCESSING' },
    });
  });

  it('counts every processing report for an operator (no tenant scope)', async () => {
    const prisma = buildPrismaMock([]);
    const repo = new PrismaDashboardRepository(prisma);

    await repo.getStats(undefined, true, new Date('2026-07-04T10:00:00Z'));

    expect(prisma.report.count).toHaveBeenCalledWith({ where: { status: 'PROCESSING' } });
  });
});

/**
 * Sydney-boundary coverage for the completion windows.
 *
 * The civil-range and `updated_at` assertions live beside the repository in
 * `src/modules/dashboard/infrastructure/prisma-dashboard.repository.test.ts`.
 * What is unique here is the midnight rollover: Sydney is UTC+10/+11, so late
 * UTC Sunday is already Monday in Sydney, and a UTC- or server-anchored clock
 * would report the neighbouring week. Nothing else in either file catches that.
 */
describe('PrismaDashboardRepository — the week rolls over at Sydney midnight', () => {
  function doneThisWeekWindow(prisma: PrismaClient) {
    const count = prisma.appointment.count as unknown as { mock: { calls: [{ where: Record<string, unknown> }][] } };
    const periodDone = count.mock.calls
      .map((call) => call[0].where)
      .filter((where) => where['status'] === 'DONE' && !('done_checked_by_user_id' in where));
    // doneThisMonth is queried first, doneThisWeek second.
    return periodDone[1]!['scheduled_date'];
  }

  it('rolls forward once it is Monday in Sydney, even while UTC says Sunday', async () => {
    const prisma = buildPrismaMock([]);
    const repo = new PrismaDashboardRepository(prisma);

    // Sunday 26 Jul 23:00 UTC is Monday 27 Jul 09:00 in Sydney.
    await repo.getStats(undefined, false, new Date('2026-07-26T23:00:00Z'));

    expect(doneThisWeekWindow(prisma)).toEqual({
      gte: new Date('2026-07-27T00:00:00.000Z'),
      lt: new Date('2026-08-03T00:00:00.000Z'),
    });
  });

  it('does not roll forward before Sydney midnight', async () => {
    const prisma = buildPrismaMock([]);
    const repo = new PrismaDashboardRepository(prisma);

    // Sunday 26 Jul 12:00 UTC is still Sunday 22:00 in Sydney.
    await repo.getStats(undefined, false, new Date('2026-07-26T12:00:00Z'));

    expect(doneThisWeekWindow(prisma)).toEqual({
      gte: new Date('2026-07-20T00:00:00.000Z'),
      lt: new Date('2026-07-27T00:00:00.000Z'),
    });
  });
});
