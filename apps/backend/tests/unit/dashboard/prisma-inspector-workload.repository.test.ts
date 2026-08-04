import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaInspectorWorkloadRepository } from '../../../src/modules/dashboard/infrastructure/prisma-inspector-workload.repository';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CARLA = '33333333-3333-4333-8333-333333333333';

const ROUTINE = 'st-routine';
const INGOING = 'st-ingoing';

function day(civilDate: string): Date {
  return new Date(`${civilDate}T00:00:00.000Z`);
}

function matrixRow(inspectorId: string | null, date: string, count: number) {
  return { inspector_id: inspectorId, scheduled_date: day(date), _count: { _all: count } };
}

function funnelRow(
  date: string,
  status: string,
  serviceTypeId: string,
  confirmation: string,
  count: number,
) {
  return {
    scheduled_date: day(date),
    status,
    service_type_id: serviceTypeId,
    rental_tenant_confirmation_status: confirmation,
    _count: { _all: count },
  };
}

interface Fixture {
  matrixRows?: ReturnType<typeof matrixRow>[];
  roster?: { id: string; name: string }[];
  offRoster?: { id: string; name: string }[];
  funnelRows?: ReturnType<typeof funnelRow>[];
  serviceTypes?: { id: string; requires_rental_tenant_confirmation: boolean }[];
  monthCounts?: [number, number];
}

function buildPrisma(fixture: Fixture) {
  const groupBy = vi.fn();
  // Call order matches the Promise.all in getWorkload: matrix first, funnel second.
  groupBy.mockResolvedValueOnce(fixture.matrixRows ?? []);
  groupBy.mockResolvedValueOnce(fixture.funnelRows ?? []);

  const inspectorFindMany = vi.fn();
  inspectorFindMany.mockResolvedValueOnce(fixture.roster ?? []);
  inspectorFindMany.mockResolvedValueOnce(fixture.offRoster ?? []);

  const count = vi.fn();
  const [selectedMonth, previousMonth] = fixture.monthCounts ?? [0, 0];
  count.mockResolvedValueOnce(selectedMonth);
  count.mockResolvedValueOnce(previousMonth);

  const prisma = {
    appointment: { groupBy, count },
    inspector: { findMany: inspectorFindMany },
    serviceType: {
      findMany: vi.fn().mockResolvedValue(
        fixture.serviceTypes ?? [
          { id: ROUTINE, requires_rental_tenant_confirmation: true },
          { id: INGOING, requires_rental_tenant_confirmation: false },
        ],
      ),
    },
  } as unknown as PrismaClient;

  return { prisma, groupBy, count, inspectorFindMany };
}

describe('PrismaInspectorWorkloadRepository', () => {
  let repo: PrismaInspectorWorkloadRepository;

  const WEEK = '2026-07-27'; // Monday

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('date windows', () => {
    it('bounds scheduled_date as a civil range, not a Sydney timestamp range', async () => {
      const { prisma, groupBy } = buildPrisma({});
      repo = new PrismaInspectorWorkloadRepository(prisma);

      await repo.getWorkload({ weekStart: WEEK });

      const where = groupBy.mock.calls[0]![0].where;
      // A Sydney range would start at 2026-07-26T14:00Z. A civil range starts at
      // UTC midnight of the Monday and ends at UTC midnight of the next Monday.
      expect(where.scheduled_date).toEqual({
        gte: new Date('2026-07-27T00:00:00.000Z'),
        lt: new Date('2026-08-03T00:00:00.000Z'),
      });
    });

    it('excludes soft-deleted, unassigned and non-load statuses', async () => {
      const { prisma, groupBy } = buildPrisma({});
      repo = new PrismaInspectorWorkloadRepository(prisma);

      await repo.getWorkload({ weekStart: WEEK });

      const where = groupBy.mock.calls[0]![0].where;
      expect(where.deleted_at).toBeNull();
      expect(where.inspector_id).toEqual({ not: null });
      expect(where.status).toEqual({ in: ['SCHEDULED', 'DONE'] });
    });

    it('reads the funnel over the 21 days spanning the three weeks', async () => {
      const { prisma, groupBy } = buildPrisma({});
      repo = new PrismaInspectorWorkloadRepository(prisma);

      await repo.getWorkload({ weekStart: WEEK });

      expect(groupBy.mock.calls[1]![0].where.scheduled_date).toEqual({
        gte: new Date('2026-07-20T00:00:00.000Z'),
        lt: new Date('2026-08-10T00:00:00.000Z'),
      });
    });

    it('reports the seven civil days of the week', async () => {
      const { prisma } = buildPrisma({});
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.week).toEqual({
        weekStart: '2026-07-27',
        weekEnd: '2026-08-02',
        days: [
          '2026-07-27',
          '2026-07-28',
          '2026-07-29',
          '2026-07-30',
          '2026-07-31',
          '2026-08-01',
          '2026-08-02',
        ],
      });
    });

    it('resolves month windows from the Monday when the week straddles a month end', async () => {
      const { prisma, count } = buildPrisma({ monthCounts: [40, 38] });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      // 27 Jul – 2 Aug: the Monday is in July, so July is the selected month.
      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.completed.selectedMonth).toBe('2026-07');
      expect(result.completed.previousMonth).toBe('2026-06');
      expect(count.mock.calls[0]![0].where.scheduled_date).toEqual({
        gte: new Date('2026-07-01T00:00:00.000Z'),
        lt: new Date('2026-08-01T00:00:00.000Z'),
      });
    });

    it('handles February in a leap year', async () => {
      const { prisma, count } = buildPrisma({});
      repo = new PrismaInspectorWorkloadRepository(prisma);

      // 2028-02-28 is a Monday; February 2028 has 29 days.
      const result = await repo.getWorkload({ weekStart: '2028-02-28' });

      expect(result.completed.selectedMonth).toBe('2028-02');
      expect(count.mock.calls[0]![0].where.scheduled_date.lt).toEqual(
        new Date('2028-03-01T00:00:00.000Z'),
      );
    });
  });

  describe('matrix', () => {
    it('zero-fills a rostered inspector with no load', async () => {
      const { prisma } = buildPrisma({
        roster: [
          { id: ALICE, name: 'Alice' },
          { id: BOB, name: 'Bob' },
        ],
        matrixRows: [matrixRow(ALICE, '2026-07-27', 2)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });
      const bob = result.matrix.inspectors.find((row) => row.inspectorName === 'Bob');

      expect(bob).toMatchObject({
        days: [0, 0, 0, 0, 0, 0, 0],
        total: 0,
        level: 'normal',
        isActive: true,
      });
    });

    it('places each day count in its own column', async () => {
      const { prisma } = buildPrisma({
        roster: [{ id: ALICE, name: 'Alice' }],
        matrixRows: [
          matrixRow(ALICE, '2026-07-27', 3),
          matrixRow(ALICE, '2026-07-30', 1),
          matrixRow(ALICE, '2026-08-02', 2),
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.matrix.inspectors[0]!.days).toEqual([3, 0, 0, 1, 0, 0, 2]);
      expect(result.matrix.inspectors[0]!.total).toBe(6);
    });

    it('includes an off-roster inspector who still carries load', async () => {
      const { prisma } = buildPrisma({
        roster: [{ id: ALICE, name: 'Alice' }],
        offRoster: [{ id: CARLA, name: 'Carla' }],
        matrixRows: [matrixRow(ALICE, '2026-07-27', 1), matrixRow(CARLA, '2026-07-29', 4)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });
      const carla = result.matrix.inspectors.find((row) => row.inspectorName === 'Carla');

      expect(carla).toMatchObject({ isActive: false, total: 4 });
      // The team total must still account for their work.
      expect(result.matrix.teamTotal).toBe(5);
    });

    it('keeps team totals equal to the sum of the rendered rows', async () => {
      const { prisma } = buildPrisma({
        roster: [
          { id: ALICE, name: 'Alice' },
          { id: BOB, name: 'Bob' },
        ],
        matrixRows: [
          matrixRow(ALICE, '2026-07-27', 2),
          matrixRow(BOB, '2026-07-27', 3),
          matrixRow(BOB, '2026-07-28', 1),
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.matrix.teamTotalsByDay).toEqual([5, 1, 0, 0, 0, 0, 0]);
      expect(result.matrix.teamTotal).toBe(6);
      expect(result.kpis.totalInWeek).toBe(6);

      const summed = result.matrix.inspectors.reduce((total, row) => total + row.total, 0);
      expect(summed).toBe(result.matrix.teamTotal);
    });

    it('drops a row whose inspector cannot be resolved rather than inventing a label', async () => {
      const { prisma } = buildPrisma({
        roster: [{ id: ALICE, name: 'Alice' }],
        offRoster: [], // the broken foreign key resolves to nothing
        matrixRows: [matrixRow(ALICE, '2026-07-27', 1), matrixRow('ghost-id', '2026-07-28', 9)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.matrix.inspectors).toHaveLength(1);
      // Totals follow the rendered rows, so the orphan cannot inflate them.
      expect(result.matrix.teamTotal).toBe(1);
    });

    it('sorts heaviest first, then by name', async () => {
      const { prisma } = buildPrisma({
        roster: [
          { id: ALICE, name: 'Alice' },
          { id: BOB, name: 'Bob' },
          { id: CARLA, name: 'Carla' },
        ],
        matrixRows: [matrixRow(BOB, '2026-07-27', 5)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.matrix.inspectors.map((row) => row.inspectorName)).toEqual([
        'Bob',
        'Alice',
        'Carla',
      ]);
    });
  });

  describe('thresholds and KPIs', () => {
    it.each([
      [14, 'normal'],
      [15, 'busy'],
      [17, 'busy'],
      [18, 'overloaded'],
    ])('classifies a weekly total of %i as %s', async (total, level) => {
      const { prisma } = buildPrisma({
        roster: [{ id: ALICE, name: 'Alice' }],
        matrixRows: [matrixRow(ALICE, '2026-07-27', total)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.matrix.inspectors[0]!.level).toBe(level);
    });

    it('lists near-limit and overloaded inspectors by name', async () => {
      const { prisma } = buildPrisma({
        roster: [
          { id: ALICE, name: 'Alice' },
          { id: BOB, name: 'Bob' },
          { id: CARLA, name: 'Carla' },
        ],
        matrixRows: [
          matrixRow(ALICE, '2026-07-27', 20),
          matrixRow(BOB, '2026-07-27', 16),
          matrixRow(CARLA, '2026-07-27', 2),
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.kpis.overloaded).toEqual({
        count: 1,
        inspectors: [{ inspectorId: ALICE, inspectorName: 'Alice', total: 20 }],
      });
      expect(result.kpis.nearLimit.inspectors.map((i) => i.inspectorName)).toEqual(['Bob']);
    });

    it('averages over the active roster', async () => {
      const { prisma } = buildPrisma({
        roster: [
          { id: ALICE, name: 'Alice' },
          { id: BOB, name: 'Bob' },
        ],
        matrixRows: [matrixRow(ALICE, '2026-07-27', 5)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.kpis.activeInspectorCount).toBe(2);
      expect(result.kpis.avgPerInspector).toBe(2.5);
    });

    it('reports a null average rather than NaN on an empty roster', async () => {
      const { prisma } = buildPrisma({ roster: [] });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.kpis.avgPerInspector).toBeNull();
    });

    it('echoes the shared thresholds', async () => {
      const { prisma } = buildPrisma({});
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.thresholds).toEqual({
        weeklyBusy: 15,
        weeklyOverloaded: 18,
        dailyBusy: 3,
        dailyOverloaded: 4,
      });
    });
  });

  describe('funnel', () => {
    it('buckets rows into the correct week at the exact boundaries', async () => {
      const { prisma } = buildPrisma({
        funnelRows: [
          funnelRow('2026-07-26', 'DONE', ROUTINE, 'CONFIRMED', 1), // last day of previous
          funnelRow('2026-07-27', 'DONE', ROUTINE, 'CONFIRMED', 2), // first day of selected
          funnelRow('2026-08-02', 'SCHEDULED', ROUTINE, 'PENDING', 3), // last day of selected
          funnelRow('2026-08-03', 'SCHEDULED', ROUTINE, 'PENDING', 4), // first day of next
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.funnel.previous.scheduled).toBe(1);
      expect(result.funnel.selected.scheduled).toBe(5);
      expect(result.funnel.next.scheduled).toBe(4);
    });

    it('uses total committed work as the denominator', async () => {
      const { prisma } = buildPrisma({
        funnelRows: [
          funnelRow('2026-07-27', 'DONE', ROUTINE, 'CONFIRMED', 4),
          funnelRow('2026-07-28', 'SCHEDULED', ROUTINE, 'CONFIRMED', 6),
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.funnel.selected.done).toBe(4);
      expect(result.funnel.selected.scheduled).toBe(10);
      // Done can never exceed scheduled, so the shared bar scale stays sane.
      expect(result.funnel.selected.done).toBeLessThanOrEqual(result.funnel.selected.scheduled);
    });

    it('counts a service type that needs no portal response as confirmed once scheduled', async () => {
      const { prisma } = buildPrisma({
        funnelRows: [funnelRow('2026-07-27', 'SCHEDULED', INGOING, 'PENDING', 5)],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.funnel.selected.confirmed).toBe(5);
      // ...but it is not part of the confirmation denominator.
      expect(result.funnel.selected.confirmationEligible).toBe(0);
    });

    it('counts a confirmation-requiring service type only once the tenant confirms', async () => {
      const { prisma } = buildPrisma({
        funnelRows: [
          funnelRow('2026-07-27', 'SCHEDULED', ROUTINE, 'PENDING', 3),
          funnelRow('2026-07-28', 'SCHEDULED', ROUTINE, 'CONFIRMED', 2),
          funnelRow('2026-07-29', 'SCHEDULED', ROUTINE, 'NO_RESPONSE', 1),
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.funnel.selected.confirmed).toBe(2);
      expect(result.funnel.selected.confirmationEligible).toBe(6);
    });

    it('derives the weekly done figures from the funnel so they cannot disagree', async () => {
      const { prisma } = buildPrisma({
        funnelRows: [
          funnelRow('2026-07-22', 'DONE', ROUTINE, 'CONFIRMED', 7),
          funnelRow('2026-07-29', 'DONE', ROUTINE, 'CONFIRMED', 3),
        ],
      });
      repo = new PrismaInspectorWorkloadRepository(prisma);

      const result = await repo.getWorkload({ weekStart: WEEK });

      expect(result.completed.donePreviousWeek).toBe(7);
      expect(result.completed.doneSelectedWeek).toBe(3);
      expect(result.completed.doneSelectedWeek).toBe(result.funnel.selected.done);
    });
  });
});
