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

  // ─── currentWeekRange ────────────────────────────────────────────────────

  describe('currentWeekRange (via getStats week queries)', () => {
    it('returns Mon 00:00:00.000 to Sun 23:59:59.999 when now is a Monday', async () => {
      const monday = new Date(2026, 4, 18, 10, 0, 0); // Mon 18 May 2026
      await repo.getStats(undefined, false, monday);

      // doneThisWeek has BOTH gte and lte in updated_at (doneThisMonth only has gte)
      const doneThisWeekCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: { status: string; updated_at?: { lte?: unknown } } }).where;
          return w.status === 'DONE' && w.updated_at?.lte !== undefined;
        },
      );
      const { gte, lte } = doneThisWeekCall![0].where.updated_at;

      expect(gte.getDay()).toBe(1); // Monday
      expect(gte.getHours()).toBe(0);
      expect(gte.getMinutes()).toBe(0);
      expect(gte.getSeconds()).toBe(0);
      expect(gte.getMilliseconds()).toBe(0);
      expect(gte.getDate()).toBe(18);

      expect(lte.getDay()).toBe(0); // Sunday
      expect(lte.getHours()).toBe(23);
      expect(lte.getMinutes()).toBe(59);
      expect(lte.getSeconds()).toBe(59);
      expect(lte.getMilliseconds()).toBe(999);
      expect(lte.getDate()).toBe(24);
    });

    it('returns the same week range when now is a Sunday', async () => {
      const sunday = new Date(2026, 4, 24, 22, 0, 0); // Sun 24 May 2026
      await repo.getStats(undefined, false, sunday);

      const doneThisWeekCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: { status: string; updated_at?: { lte?: unknown } } }).where;
          return w.status === 'DONE' && w.updated_at?.lte !== undefined;
        },
      );
      const { gte, lte } = doneThisWeekCall![0].where.updated_at;

      expect(gte.getDate()).toBe(18); // Same Monday
      expect(lte.getDate()).toBe(24); // Same Sunday
    });

    it('returns the correct week range when now is a Wednesday', async () => {
      const wednesday = new Date(2026, 4, 20, 14, 0, 0); // Wed 20 May 2026
      await repo.getStats(undefined, false, wednesday);

      const doneThisWeekCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: { status: string; updated_at?: { lte?: unknown } } }).where;
          return w.status === 'DONE' && w.updated_at?.lte !== undefined;
        },
      );
      const { gte, lte } = doneThisWeekCall![0].where.updated_at;

      expect(gte.getDate()).toBe(18); // Monday 18 May
      expect(lte.getDate()).toBe(24); // Sunday 24 May
    });
  });

  // ─── tomorrowRange ───────────────────────────────────────────────────────

  describe('tomorrowRange (via tomorrowByInspector groupBy)', () => {
    it('queries tomorrow 00:00:00.000 to 23:59:59.999 for tomorrowByInspector', async () => {
      const wednesday = new Date(2026, 4, 20, 10, 0, 0); // Wed 20 May 2026

      (prisma.appointment.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // status counts
        .mockResolvedValueOnce([]) // tomorrowByInspector
        .mockResolvedValueOnce([]) // scheduledThisWeekByInspector
        .mockResolvedValueOnce([]) // confirmedThisWeekByInspector

      await repo.getStats(undefined, true, wednesday);

      const groupByCalls = (prisma.appointment.groupBy as ReturnType<typeof vi.fn>).mock.calls;
      const tomorrowCall = groupByCalls.find(
        (c: unknown[]) => (c[0] as { where: { rental_tenant_confirmation_status?: string } }).where.rental_tenant_confirmation_status === 'CONFIRMED' &&
          (c[0] as { where: { scheduled_date?: unknown } }).where.scheduled_date,
      );

      const { gte, lte } = (tomorrowCall![0] as { where: { scheduled_date: { gte: Date; lte: Date } } }).where.scheduled_date;

      expect(gte.getDate()).toBe(21); // Thursday 21 May
      expect(gte.getHours()).toBe(0);
      expect(gte.getMinutes()).toBe(0);
      expect(gte.getSeconds()).toBe(0);
      expect(gte.getMilliseconds()).toBe(0);

      expect(lte.getDate()).toBe(21); // Same day
      expect(lte.getHours()).toBe(23);
      expect(lte.getMinutes()).toBe(59);
      expect(lte.getSeconds()).toBe(59);
      expect(lte.getMilliseconds()).toBe(999);
    });
  });

  // ─── New scalar queries ──────────────────────────────────────────────────

  describe('new scalar queries', () => {
    it('queries doneThisWeek with status DONE and updated_at in week, with tenantId', async () => {
      const now = new Date(2026, 4, 20, 10, 0, 0);
      await repo.getStats('tenant-1', false, now);

      const doneThisWeekCall = (prisma.appointment.count as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => {
          const w = (c[0] as { where: { status?: string; updated_at?: unknown } }).where;
          return w.status === 'DONE' && w.updated_at;
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
