import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaDashboardAnalyticsRepository } from '../../../src/modules/dashboard/infrastructure/prisma-dashboard-analytics.repository';
import type { AnalyticsQuery } from '../../../src/modules/dashboard/domain/dashboard-analytics.repository';

const ROUTINE = '11111111-1111-4111-8111-111111111111';
const INGOING = '44444444-4444-4444-8444-444444444444';

interface MockData {
  statusRows?: { status: string; _count: { _all: number } }[];
  evolutionRows?: { scheduled_date: Date; _count: { _all: number } }[];
  distributionRows?: { service_type_id: string; _count: { _all: number } }[];
  executions?: unknown[];
  revenueSum?: unknown;
  counts?: number[];
  heatmapAppointments?: unknown[];
}

function buildPrismaMock(data: MockData = {}): PrismaClient {
  const counts = data.counts ?? [];
  let countCall = 0;
  const groupBy = vi.fn().mockImplementation(({ by }: { by: string[] }) => {
    if (by[0] === 'status') return Promise.resolve(data.statusRows ?? []);
    if (by[0] === 'scheduled_date') return Promise.resolve(data.evolutionRows ?? []);
    return Promise.resolve(data.distributionRows ?? []);
  });

  return {
    appointment: {
      groupBy,
      count: vi.fn().mockImplementation(() => Promise.resolve(counts[countCall++] ?? 0)),
      findMany: vi.fn().mockResolvedValue(data.heatmapAppointments ?? []),
    },
    financialEntry: { aggregate: vi.fn().mockResolvedValue(data.revenueSum ?? { _sum: { amount: null } }) },
    inspectionExecution: { findMany: vi.fn().mockResolvedValue(data.executions ?? []) },
    serviceType: {
      findMany: vi.fn().mockResolvedValue([
        { id: ROUTINE, code: 'ROUTINE', name: 'Routine Inspection' },
        { id: INGOING, code: 'INGOING', name: 'Ingoing Inspection' },
      ]),
    },
  } as unknown as PrismaClient;
}

function query(overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return {
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    granularity: 'day',
    includeRevenue: true,
    now: new Date('2026-07-03T02:00:00Z'),
    ...overrides,
  };
}

describe('PrismaDashboardAnalyticsRepository — status totals', () => {
  it('zero-fills every status so a missing one reads as 0, not as absent', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({ statusRows: [{ status: 'DONE', _count: { _all: 7 } }] }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.statusInPeriod).toEqual({
      DRAFT: 0,
      AWAITING_INSPECTOR: 0,
      SCHEDULED: 0,
      DONE: 7,
      CANCELLED: 0,
      REJECTED: 0,
    });
  });

  it('derives inPeriod and cancelledInPeriod from the same groupBy, without extra queries', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        statusRows: [
          { status: 'DONE', _count: { _all: 7 } },
          { status: 'CANCELLED', _count: { _all: 3 } },
        ],
      }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.kpis.inPeriod).toBe(10);
    expect(result.kpis.cancelledInPeriod).toBe(3);
  });
});

describe('PrismaDashboardAnalyticsRepository — evolution series', () => {
  it('zero-fills quiet days across the whole period', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        evolutionRows: [
          { scheduled_date: new Date('2026-07-01T00:00:00.000Z'), _count: { _all: 4 } },
          { scheduled_date: new Date('2026-07-04T00:00:00.000Z'), _count: { _all: 2 } },
        ],
      }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.evolution).toEqual([
      { bucketStart: '2026-07-01', count: 4 },
      { bucketStart: '2026-07-02', count: 0 },
      { bucketStart: '2026-07-03', count: 0 },
      { bucketStart: '2026-07-04', count: 2 },
      { bucketStart: '2026-07-05', count: 0 },
    ]);
  });

  it('collapses days into Monday-anchored weeks at week granularity', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        evolutionRows: [
          // 2026-07-01 is a Wednesday; its week starts Monday 2026-06-29.
          { scheduled_date: new Date('2026-07-01T00:00:00.000Z'), _count: { _all: 4 } },
          { scheduled_date: new Date('2026-07-03T00:00:00.000Z'), _count: { _all: 1 } },
          { scheduled_date: new Date('2026-07-08T00:00:00.000Z'), _count: { _all: 6 } },
        ],
      }),
    );
    const result = await repo.getAnalytics(query({ endDate: '2026-07-12', granularity: 'week' }));
    expect(result.evolution).toEqual([
      { bucketStart: '2026-06-29', count: 5 },
      { bucketStart: '2026-07-06', count: 6 },
    ]);
  });

  it('does not shift a @db.Date bucket by a day when read from a UTC-midnight Date', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        evolutionRows: [{ scheduled_date: new Date('2026-07-02T00:00:00.000Z'), _count: { _all: 9 } }],
      }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.evolution.find((b) => b.count === 9)?.bucketStart).toBe('2026-07-02');
  });
});

describe('PrismaDashboardAnalyticsRepository — revenue', () => {
  it('returns null without querying the ledger when revenue is not included', async () => {
    const prisma = buildPrismaMock();
    const repo = new PrismaDashboardAnalyticsRepository(prisma);
    const result = await repo.getAnalytics(query({ includeRevenue: false }));
    expect(result.revenue).toBeNull();
    expect(prisma.financialEntry.aggregate).not.toHaveBeenCalled();
  });

  it('reports a zero sum as 0, not null, when the ledger is empty for the period', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({ revenueSum: { _sum: { amount: null } } }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.revenue).toEqual({ amount: 0, currency: 'AUD' });
  });

  it('coerces the Prisma Decimal sum to a number', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({ revenueSum: { _sum: { amount: '42180.50' } } }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.revenue?.amount).toBe(42180.5);
  });
});

describe('PrismaDashboardAnalyticsRepository — average execution time', () => {
  const execution = (serviceTypeId: string, minutes: number) => ({
    started_at: new Date('2026-07-02T09:00:00.000Z'),
    finished_at: new Date(new Date('2026-07-02T09:00:00.000Z').getTime() + minutes * 60_000),
    appointment: { service_type_id: serviceTypeId },
  });

  it('averages per service type and reports the sample size', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({ executions: [execution(ROUTINE, 40), execution(ROUTINE, 50), execution(INGOING, 30)] }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.avgExecutionMinutes).toEqual([
      { serviceTypeId: ROUTINE, code: 'ROUTINE', name: 'Routine Inspection', avgMinutes: 45, sampleSize: 2 },
      { serviceTypeId: INGOING, code: 'INGOING', name: 'Ingoing Inspection', avgMinutes: 30, sampleSize: 1 },
    ]);
  });

  it('drops a negative duration rather than letting corrupt data pull the average below zero', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({ executions: [execution(ROUTINE, 40), execution(ROUTINE, -100)] }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.avgExecutionMinutes).toEqual([
      { serviceTypeId: ROUTINE, code: 'ROUTINE', name: 'Routine Inspection', avgMinutes: 40, sampleSize: 1 },
    ]);
  });

  it('omits a service type with no finished execution instead of emitting a zero', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(buildPrismaMock({ executions: [] }));
    const result = await repo.getAnalytics(query());
    expect(result.avgExecutionMinutes).toEqual([]);
  });
});

describe('PrismaDashboardAnalyticsRepository — service-type distribution', () => {
  it('resolves names and orders by count descending', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        distributionRows: [
          { service_type_id: INGOING, _count: { _all: 12 } },
          { service_type_id: ROUTINE, _count: { _all: 80 } },
        ],
      }),
    );
    const result = await repo.getAnalytics(query());
    expect(result.serviceTypeDistribution.map((d) => d.name)).toEqual([
      'Routine Inspection',
      'Ingoing Inspection',
    ]);
  });
});

describe('PrismaDashboardAnalyticsRepository — heatmap', () => {
  const point = (suburb: string, lat: number | null, lng: number | null) => ({
    property: { suburb, lat, lng },
  });

  it('folds suburb casing so one locality is one point', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        heatmapAppointments: [
          point('Newtown', -33.9, 151.18),
          point('NEWTOWN', -33.9, 151.18),
          point('  newtown ', -33.9, 151.18),
        ],
      }),
    );
    const result = await repo.getHeatmap({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ suburb: 'Newtown', count: 3 });
  });

  it('averages coordinates into a suburb centroid', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({ heatmapAppointments: [point('Newtown', -34, 151), point('Newtown', -33, 152)] }),
    );
    const result = await repo.getHeatmap({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(result.points[0].lat).toBeCloseTo(-33.5);
    expect(result.points[0].lng).toBeCloseTo(151.5);
  });

  it('counts ungeocoded appointments separately instead of silently under-reporting', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        heatmapAppointments: [
          point('Newtown', -33.9, 151.18),
          point('Newtown', null, null),
          point('', -33.9, 151.18),
          { property: null },
        ],
      }),
    );
    const result = await repo.getHeatmap({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(result.totalPlotted).toBe(1);
    expect(result.totalWithoutCoordinates).toBe(3);
  });

  it('orders points by density descending', async () => {
    const repo = new PrismaDashboardAnalyticsRepository(
      buildPrismaMock({
        heatmapAppointments: [
          point('Quiet', -33.9, 151.18),
          point('Busy', -33.8, 151.2),
          point('Busy', -33.8, 151.2),
        ],
      }),
    );
    const result = await repo.getHeatmap({ startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(result.points.map((p) => p.suburb)).toEqual(['Busy', 'Quiet']);
  });
});
