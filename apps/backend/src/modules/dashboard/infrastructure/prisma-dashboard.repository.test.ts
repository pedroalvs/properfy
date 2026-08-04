import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaDashboardRepository } from './prisma-dashboard.repository';
import type { PrismaClient } from '@prisma/client';

function createMockPrisma() {
  return {
    appointment: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    inspector: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    financialEntry: {
      count: vi.fn(),
    },
    report: {
      count: vi.fn(),
    },
    property: {
      count: vi.fn(),
    },
    serviceGroup: {
      count: vi.fn(),
    },
  } as unknown as PrismaClient;
}

function setupBaselineMocks(prisma: ReturnType<typeof createMockPrisma>) {
  (prisma.appointment.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.appointment.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.appointment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.inspector.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.inspector.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.financialEntry.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.report.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.property.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
  (prisma.serviceGroup.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
}

describe('PrismaDashboardRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: PrismaDashboardRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    setupBaselineMocks(prisma);
    repo = new PrismaDashboardRepository(prisma as unknown as PrismaClient);
  });

  // ─── Week / month windows ────────────────────────────────────────────────

  /**
   * These windows used to be built with `new Date(y, m, d)` and read off
   * `updated_at`. Both were wrong: the constructor reads the *server's*
   * timezone rather than Sydney's, and `updated_at` is re-stamped by any later
   * edit so it was never a completion date. Everything is now keyed on
   * `scheduled_date` — a `@db.Date` pinned to UTC midnight of a Sydney civil
   * date — over a half-open civil range, matching the Inspector Workload screen.
   */
  describe('week window (via getStats week queries)', () => {
    /** The DONE counts that carry a period; excludes the cross-check backlog. */
    function periodDoneCalls(): { where: Record<string, unknown> }[] {
      return (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls
        .map((call: unknown[]) => call[0] as { where: Record<string, unknown> })
        .filter((call) => call.where['status'] === 'DONE' && !('done_checked_by_user_id' in call.where));
    }

    /** doneThisMonth is queried before doneThisWeek in the Promise.all. */
    function doneThisWeekWindow(): { gte: Date; lt: Date } {
      return periodDoneCalls()[1]!.where['scheduled_date'] as { gte: Date; lt: Date };
    }

    it.each([
      ['a Monday', '2026-05-18T10:00:00.000Z'],
      ['a Wednesday', '2026-05-20T04:00:00.000Z'],
      ['a Sunday', '2026-05-24T09:00:00.000Z'],
    ])('resolves the same Mon-to-Sun civil week from %s', async (_label, instant) => {
      await repo.getStats(undefined, false, new Date(instant));

      expect(doneThisWeekWindow()).toEqual({
        gte: new Date('2026-05-18T00:00:00.000Z'),
        lt: new Date('2026-05-25T00:00:00.000Z'),
      });
    });

    it('never keys a completion count on updated_at', async () => {
      await repo.getStats(undefined, false, new Date('2026-05-20T04:00:00.000Z'));

      const calls = periodDoneCalls();
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.where['updated_at']).toBeUndefined();
        expect(call.where['scheduled_date']).toBeDefined();
      }
    });

    it('bounds done-this-month by the civil month', async () => {
      await repo.getStats(undefined, false, new Date('2026-05-20T04:00:00.000Z'));

      expect(periodDoneCalls()[0]!.where['scheduled_date']).toEqual({
        gte: new Date('2026-05-01T00:00:00.000Z'),
        lt: new Date('2026-06-01T00:00:00.000Z'),
      });
    });
  });

  // ─── tomorrowRange ───────────────────────────────────────────────────────

  describe('tomorrow window (via tomorrowByInspector groupBy)', () => {
    it('queries the single civil day after today', async () => {
      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // status counts
        .mockResolvedValueOnce([]) // tomorrowByInspector
        .mockResolvedValueOnce([]) // scheduledThisWeekByInspector
        .mockResolvedValueOnce([]); // confirmedThisWeekByInspector

      // Wed 20 May 2026 in Sydney.
      await repo.getStats(undefined, true, new Date('2026-05-20T04:00:00.000Z'));

      const tomorrowCall = (prisma.appointment.groupBy as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const where = (c[0] as { where: Record<string, unknown> }).where;
          return where['rental_tenant_confirmation_status'] === 'CONFIRMED' && where['scheduled_date'];
        },
      );

      expect((tomorrowCall![0] as { where: { scheduled_date: unknown } }).where.scheduled_date).toEqual({
        gte: new Date('2026-05-21T00:00:00.000Z'),
        lt: new Date('2026-05-22T00:00:00.000Z'),
      });
    });
  });

  // ─── New scalar queries ──────────────────────────────────────────────────

  describe('new scalar queries', () => {
    it('queries doneThisWeek with status DONE and scheduled_date in week, with tenantId', async () => {
      await repo.getStats('tenant-1', false, new Date('2026-05-20T04:00:00.000Z'));

      const doneThisWeekCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: Record<string, unknown> }).where;
          return w['status'] === 'DONE' && w['scheduled_date'] && !('done_checked_by_user_id' in w);
        },
      );

      expect(doneThisWeekCall).toBeDefined();
      expect(doneThisWeekCall![0].where.tenant_id).toBe('tenant-1');
      expect(doneThisWeekCall![0].where.deleted_at).toBeNull();
    });

    it('queries scheduledThisWeek with status SCHEDULED and scheduled_date in week, with tenantId', async () => {
      const now = new Date(2026, 4, 20, 10, 0, 0);
      await repo.getStats('tenant-2', false, now);

      const scheduledThisWeekCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: { status?: string; scheduled_date?: unknown } }).where;
          return w.status === 'SCHEDULED' && w.scheduled_date;
        },
      );

      expect(scheduledThisWeekCall).toBeDefined();
      expect(scheduledThisWeekCall![0].where.tenant_id).toBe('tenant-2');
      expect(scheduledThisWeekCall![0].where.deleted_at).toBeNull();
    });

    it('queries rejectedTotal with status REJECTED and no date filter', async () => {
      await repo.getStats('tenant-3', false);

      const rejectedTotalCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: { status?: string } }).where;
          return w.status === 'REJECTED' && !(w as { updated_at?: unknown }).updated_at && !(w as { scheduled_date?: unknown }).scheduled_date;
        },
      );

      expect(rejectedTotalCall).toBeDefined();
      expect(rejectedTotalCall![0].where.tenant_id).toBe('tenant-3');
      expect(rejectedTotalCall![0].where.deleted_at).toBeNull();
    });
  });

  // ─── includeInspectorBreakdowns=false ────────────────────────────────────

  describe('when includeInspectorBreakdowns=false', () => {
    it('does NOT call appointment.groupBy for inspector queries', async () => {
      await repo.getStats('tenant-1', false);

      // groupBy should only be called once (for status counts)
      expect(prisma.appointment.groupBy).toHaveBeenCalledTimes(1);
    });

    it('returns inspectorBreakdowns: null', async () => {
      const result = await repo.getStats('tenant-1', false);

      expect(result.inspectorBreakdowns).toBeNull();
    });
  });

  // ─── includeInspectorBreakdowns=true ─────────────────────────────────────

  describe('when includeInspectorBreakdowns=true', () => {
    beforeEach(() => {
      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // status counts
        .mockResolvedValueOnce([]) // tomorrowByInspector
        .mockResolvedValueOnce([]) // scheduledThisWeekByInspector
        .mockResolvedValueOnce([]) // confirmedThisWeekByInspector
    });

    it('calls appointment.groupBy 4 times (1 status + 3 inspector)', async () => {
      await repo.getStats(undefined, true);

      expect(prisma.appointment.groupBy).toHaveBeenCalledTimes(4);
    });

    it('each inspector groupBy where includes inspector_id: { not: null }', async () => {
      await repo.getStats(undefined, true);

      const groupByCalls = (prisma.appointment.groupBy as ReturnType<typeof vi.fn>).mock.calls;
      // Skip the first call (status counts — no inspector_id filter)
      const inspectorCalls = groupByCalls.slice(1);

      for (const call of inspectorCalls) {
        const where = (call[0] as { where: { inspector_id?: unknown } }).where;
        expect(where.inspector_id).toEqual({ not: null });
      }
    });

    it('each inspector groupBy by array contains inspector_id', async () => {
      await repo.getStats(undefined, true);

      const groupByCalls = (prisma.appointment.groupBy as ReturnType<typeof vi.fn>).mock.calls;
      const inspectorCalls = groupByCalls.slice(1);

      for (const call of inspectorCalls) {
        const by = (call[0] as { by: string[] }).by;
        expect(by).toContain('inspector_id');
      }
    });

    it('returns inspectorBreakdowns with three lists', async () => {
      const result = await repo.getStats(undefined, true);

      expect(result.inspectorBreakdowns).not.toBeNull();
      expect(result.inspectorBreakdowns).toHaveProperty('tomorrowByInspector');
      expect(result.inspectorBreakdowns).toHaveProperty('scheduledThisWeekByInspector');
      expect(result.inspectorBreakdowns).toHaveProperty('confirmedThisWeekByInspector');
    });
  });

  // ─── computeAlertLevel ───────────────────────────────────────────────────

  describe('computeAlertLevel (via tomorrowByInspector rows)', () => {
    const inspectorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    async function getAlertLevel(count: number): Promise<'yellow' | 'red' | null> {
      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce([]) // status counts
        .mockResolvedValueOnce([{ inspector_id: inspectorId, _count: { _all: count } }]) // tomorrow
        .mockResolvedValueOnce([]) // scheduledThisWeek
        .mockResolvedValueOnce([]); // confirmedThisWeek

      (prisma.inspector.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue([{ id: inspectorId, name: 'Alice' }]);

      const result = await repo.getStats(undefined, true);
      return result.inspectorBreakdowns!.tomorrowByInspector[0]?.alertLevel ?? null;
    }

    it('14 -> null', async () => { expect(await getAlertLevel(14)).toBeNull(); });
    it('15 -> yellow', async () => { expect(await getAlertLevel(15)).toBe('yellow'); });
    it('17 -> yellow', async () => { expect(await getAlertLevel(17)).toBe('yellow'); });
    it('18 -> red', async () => { expect(await getAlertLevel(18)).toBe('red'); });
    it('25 -> red', async () => { expect(await getAlertLevel(25)).toBe('red'); });
  });

  // ─── Inspector name resolution ────────────────────────────────────────────

  describe('inspector name resolution', () => {
    it('merges names correctly when lists overlap', async () => {
      const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const id2 = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';

      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce([]) // status counts
        .mockResolvedValueOnce([
          { inspector_id: id1, _count: { _all: 18 } },
          { inspector_id: id2, _count: { _all: 5 } },
        ]) // tomorrow
        .mockResolvedValueOnce([
          { inspector_id: id1, _count: { _all: 20 } },
        ]) // scheduledThisWeek
        .mockResolvedValueOnce([
          { inspector_id: id2, _count: { _all: 3 } },
        ]); // confirmedThisWeek

      (prisma.inspector.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue([
          { id: id1, name: 'Alice' },
          { id: id2, name: 'Bob' },
        ]);

      const result = await repo.getStats(undefined, true);

      expect(result.inspectorBreakdowns!.tomorrowByInspector[0]).toMatchObject({
        inspectorId: id1,
        inspectorName: 'Alice',
        count: 18,
      });
      expect(result.inspectorBreakdowns!.tomorrowByInspector[1]).toMatchObject({
        inspectorId: id2,
        inspectorName: 'Bob',
        count: 5,
      });
      expect(result.inspectorBreakdowns!.scheduledThisWeekByInspector[0]).toMatchObject({
        inspectorId: id1,
        inspectorName: 'Alice',
        count: 20,
      });
    });

    it('runs a single inspector.findMany call for all three lists combined', async () => {
      const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const id2 = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';

      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ inspector_id: id1, _count: { _all: 5 } }])
        .mockResolvedValueOnce([{ inspector_id: id2, _count: { _all: 3 } }])
        .mockResolvedValueOnce([{ inspector_id: id1, _count: { _all: 2 } }]);

      (prisma.inspector.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue([
          { id: id1, name: 'Alice' },
          { id: id2, name: 'Bob' },
        ]);

      await repo.getStats(undefined, true);

      // Only one findMany call (beyond the one for recent appointments)
      const inspectorFindManyCalls = (prisma.inspector.findMany as ReturnType<typeof vi.fn>).mock.calls;
      // Filter for name-resolution call (has where.id.in)
      const nameResolutionCalls = inspectorFindManyCalls.filter(
        (c: unknown[]) => (c[0] as { where?: { id?: { in?: unknown } } })?.where?.id?.in,
      );
      expect(nameResolutionCalls).toHaveLength(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = (nameResolutionCalls as any)[0][0].where.id.in as string[];
      expect(ids).toHaveLength(2);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });
  });

  // ─── Sort order ───────────────────────────────────────────────────────────

  describe('sort order', () => {
    it('sorts tomorrowByInspector by count DESC', async () => {
      const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const id2 = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';

      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { inspector_id: id1, _count: { _all: 5 } },
          { inspector_id: id2, _count: { _all: 18 } },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (prisma.inspector.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue([
          { id: id1, name: 'Alice' },
          { id: id2, name: 'Bob' },
        ]);

      const result = await repo.getStats(undefined, true);

      expect(result.inspectorBreakdowns!.tomorrowByInspector[0]!.count).toBe(18);
      expect(result.inspectorBreakdowns!.tomorrowByInspector[1]!.count).toBe(5);
    });

    it('secondary sort by inspectorName ASC for ties', async () => {
      const id1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const id2 = 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22';

      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { inspector_id: id1, _count: { _all: 10 } },
          { inspector_id: id2, _count: { _all: 10 } },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // id1 = "Zoe", id2 = "Alice" — Alice should come first in a tie
      (prisma.inspector.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValue([
          { id: id1, name: 'Zoe' },
          { id: id2, name: 'Alice' },
        ]);

      const result = await repo.getStats(undefined, true);

      expect(result.inspectorBreakdowns!.tomorrowByInspector[0]!.inspectorName).toBe('Alice');
      expect(result.inspectorBreakdowns!.tomorrowByInspector[1]!.inspectorName).toBe('Zoe');
    });
  });
});
