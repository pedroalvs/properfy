import type { Prisma, PrismaClient } from '@prisma/client';
import {
  addCivilDays,
  DAILY_WORKLOAD_THRESHOLDS,
  WEEKLY_WORKLOAD_THRESHOLDS,
  workloadLevel,
  type InspectorWorkloadResponse,
  type WeekFunnel,
  type WorkloadMatrixRow,
} from '@properfy/shared';
import { nextCivilDay } from '../../../shared/domain/timezone-date';
import type {
  InspectorWorkloadQuery,
  InspectorWorkloadRepository,
} from '../domain/inspector-workload.repository';

const DAYS_IN_WEEK = 7;

/**
 * Statuses that consume an inspector's capacity.
 *
 * `DRAFT` and `AWAITING_INSPECTOR` have no inspector assigned by definition, so
 * they cannot land in anybody's row. `CANCELLED` and `REJECTED` are excluded on
 * purpose: counting work that was called off would flag an inspector as
 * overloaded for a week they are in fact free.
 */
const LOAD_STATUSES = ['SCHEDULED', 'DONE'] as const;

type MatrixGroupRow = {
  inspector_id: string | null;
  scheduled_date: Date;
  _count: { _all: number };
};

type FunnelGroupRow = {
  scheduled_date: Date;
  status: string;
  service_type_id: string;
  rental_tenant_confirmation_status: string;
  _count: { _all: number };
};

/**
 * Reads the Inspector Workload screen: one Monday-anchored week of per-inspector,
 * per-day load, the weeks either side of it, and the month-to-month completion
 * figures.
 *
 * Every window is a **civil** date range. `scheduled_date` is a `@db.Date` pinned
 * to UTC midnight of a Sydney civil date, so it must be bounded by civil dates
 * and never by a server-local `new Date(y, m, d)` — the drift the dashboard-stats
 * repository shipped with. This class follows the analytics repository instead.
 *
 * The read is cross-tenant: no `tenant_id` predicate anywhere, because inspectors
 * are platform-level entities and the route is AM/OP-only. Widening RBAC to an
 * agency role would require a `tenant_id` filter on every appointment query below
 * *and* a `blocked_clients_json` filter on the roster.
 */
export class PrismaInspectorWorkloadRepository implements InspectorWorkloadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Inclusive [start 00:00 UTC, end+1 00:00 UTC) — ONLY for `@db.Date` columns. */
  private civilDateRange(startDate: string, endDate: string): { gte: Date; lt: Date } {
    return {
      gte: new Date(`${startDate}T00:00:00.000Z`),
      lt: new Date(`${nextCivilDay(endDate)}T00:00:00.000Z`),
    };
  }

  /** First and last civil date of the month the given date falls in. */
  private static monthRange(civilDate: string): { start: string; end: string } {
    const [year, month] = civilDate.split('-').map(Number) as [number, number];
    // Day 0 of the following month is the last day of this one — correct for
    // 28/29/30/31-day months without a leap-year branch.
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: `${civilDate.slice(0, 7)}-01`, end };
  }

  /**
   * Load filter shared by every appointment read here.
   *
   * `inspector_id: { not: null }` also applies to the funnel, so the KPI total,
   * the matrix team total and the funnel's `scheduled` are guaranteed to be the
   * same number. Per the state machine a SCHEDULED appointment always has an
   * inspector, so this should be a no-op — it is here so a data anomaly cannot
   * put two disagreeing totals on one screen.
   */
  private loadWhere(startDate: string, endDate: string): Prisma.AppointmentWhereInput {
    return {
      deleted_at: null,
      inspector_id: { not: null },
      status: { in: [...LOAD_STATUSES] },
      scheduled_date: this.civilDateRange(startDate, endDate),
    };
  }

  async getWorkload(query: InspectorWorkloadQuery): Promise<InspectorWorkloadResponse> {
    const { weekStart } = query;
    const weekEnd = addCivilDays(weekStart, DAYS_IN_WEEK - 1);
    const days = Array.from({ length: DAYS_IN_WEEK }, (_, i) => addCivilDays(weekStart, i));

    const previousStart = addCivilDays(weekStart, -DAYS_IN_WEEK);
    const nextStart = addCivilDays(weekStart, DAYS_IN_WEEK);
    const nextEnd = addCivilDays(nextStart, DAYS_IN_WEEK - 1);

    const selectedMonth = PrismaInspectorWorkloadRepository.monthRange(weekStart);
    const previousMonth = PrismaInspectorWorkloadRepository.monthRange(
      addCivilDays(selectedMonth.start, -1),
    );

    const [matrixRows, roster, funnelRows, serviceTypes, doneSelectedMonth, donePreviousMonth] =
      await Promise.all([
        this.prisma.appointment.groupBy({
          by: ['inspector_id', 'scheduled_date'],
          where: this.loadWhere(weekStart, weekEnd),
          _count: { _all: true },
        }),

        this.prisma.inspector.findMany({
          where: { status: 'ACTIVE', deleted_at: null },
          select: { id: true, name: true },
        }),

        // One 21-day read covers all three panels of the comparison strip; the
        // rows are bucketed per week in memory below.
        this.prisma.appointment.groupBy({
          by: ['scheduled_date', 'status', 'service_type_id', 'rental_tenant_confirmation_status'],
          where: this.loadWhere(previousStart, nextEnd),
          _count: { _all: true },
        }),

        this.prisma.serviceType.findMany({
          select: { id: true, requires_rental_tenant_confirmation: true },
        }),

        this.prisma.appointment.count({
          where: {
            ...this.loadWhere(selectedMonth.start, selectedMonth.end),
            status: 'DONE',
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...this.loadWhere(previousMonth.start, previousMonth.end),
            status: 'DONE',
          },
        }),
      ]);

    const matrix = await this.buildMatrix(matrixRows as MatrixGroupRow[], roster, days);
    const funnel = this.buildFunnels(funnelRows as FunnelGroupRow[], serviceTypes, [
      { weekStart: previousStart, weekEnd: addCivilDays(previousStart, DAYS_IN_WEEK - 1) },
      { weekStart, weekEnd },
      { weekStart: nextStart, weekEnd: nextEnd },
    ]);

    const activeInspectorCount = roster.length;

    return {
      week: { weekStart, weekEnd, days },
      thresholds: {
        weeklyBusy: WEEKLY_WORKLOAD_THRESHOLDS.busy,
        weeklyOverloaded: WEEKLY_WORKLOAD_THRESHOLDS.overloaded,
        dailyBusy: DAILY_WORKLOAD_THRESHOLDS.busy,
        dailyOverloaded: DAILY_WORKLOAD_THRESHOLDS.overloaded,
      },
      kpis: {
        totalInWeek: matrix.teamTotal,
        activeInspectorCount,
        // Denominator is the active roster, so idle inspectors dilute the
        // average — the honest reading. `null`, not NaN, on an empty roster.
        avgPerInspector:
          activeInspectorCount === 0
            ? null
            : Math.round((matrix.teamTotal / activeInspectorCount) * 10) / 10,
        nearLimit: summarise(matrix.inspectors, 'busy'),
        overloaded: summarise(matrix.inspectors, 'overloaded'),
      },
      funnel: { previous: funnel[0]!, selected: funnel[1]!, next: funnel[2]! },
      completed: {
        doneSelectedWeek: funnel[1]!.done,
        donePreviousWeek: funnel[0]!.done,
        doneSelectedMonth,
        donePreviousMonth,
        selectedMonth: selectedMonth.start.slice(0, 7),
        previousMonth: previousMonth.start.slice(0, 7),
      },
      matrix,
    };
  }

  /**
   * Rows are the active roster **union** whoever actually carries load this week.
   * The union matters: an inspector deactivated mid-week still has Thursday's job,
   * and dropping them would leave the team total larger than the sum of the rows
   * above it.
   */
  private async buildMatrix(
    rows: MatrixGroupRow[],
    roster: { id: string; name: string }[],
    days: string[],
  ): Promise<InspectorWorkloadResponse['matrix']> {
    const dayIndex = new Map(days.map((day, index) => [day, index]));
    const counts = new Map<string, number[]>();

    for (const row of rows) {
      if (!row.inspector_id) continue;
      const index = dayIndex.get(row.scheduled_date.toISOString().slice(0, 10));
      if (index === undefined) continue;
      const bucket = counts.get(row.inspector_id) ?? new Array<number>(DAYS_IN_WEEK).fill(0);
      bucket[index] = (bucket[index] ?? 0) + row._count._all;
      counts.set(row.inspector_id, bucket);
    }

    const names = new Map(roster.map((inspector) => [inspector.id, inspector.name]));
    const rosterIds = new Set(names.keys());
    const offRoster = [...counts.keys()].filter((id) => !rosterIds.has(id));

    if (offRoster.length > 0) {
      const extra = await this.prisma.inspector.findMany({
        where: { id: { in: offRoster } },
        select: { id: true, name: true },
      });
      for (const inspector of extra) names.set(inspector.id, inspector.name);
    }

    const inspectors: WorkloadMatrixRow[] = [];
    for (const id of new Set([...rosterIds, ...counts.keys()])) {
      const name = names.get(id);
      // An id with load but no inspector row is a broken foreign key, not a
      // rendering decision — skip it rather than invent a label.
      if (name === undefined) continue;

      const dayCounts = counts.get(id) ?? new Array<number>(DAYS_IN_WEEK).fill(0);
      const total = dayCounts.reduce((sum, count) => sum + count, 0);
      inspectors.push({
        inspectorId: id,
        inspectorName: name,
        isActive: rosterIds.has(id),
        days: dayCounts,
        total,
        level: workloadLevel(total),
      });
    }

    // Heaviest first — the screen exists to surface who is over capacity.
    inspectors.sort((a, b) => b.total - a.total || a.inspectorName.localeCompare(b.inspectorName));

    // Totals are summed from the rendered rows, so "team total" can never
    // disagree with the column above it, even if a row was skipped.
    const teamTotalsByDay = days.map((_, index) =>
      inspectors.reduce((sum, row) => sum + (row.days[index] ?? 0), 0),
    );

    return {
      inspectors,
      teamTotalsByDay,
      teamTotal: teamTotalsByDay.reduce((sum, count) => sum + count, 0),
    };
  }

  /**
   * `scheduled` is total committed work and the denominator for the other two.
   *
   * `confirmed` honours the service-type gate: Ingoing/Outgoing do not ask the
   * rental tenant anything, so they are operationally confirmed once scheduled.
   * Counting only portal responses would report those weeks as permanently
   * unconfirmed. `confirmationEligible` reports how many actually needed one.
   */
  private buildFunnels(
    rows: FunnelGroupRow[],
    serviceTypes: { id: string; requires_rental_tenant_confirmation: boolean }[],
    weeks: { weekStart: string; weekEnd: string }[],
  ): WeekFunnel[] {
    const requiresConfirmation = new Map(
      serviceTypes.map((type) => [type.id, type.requires_rental_tenant_confirmation]),
    );

    return weeks.map(({ weekStart, weekEnd }) => {
      const funnel: WeekFunnel = {
        weekStart,
        weekEnd,
        done: 0,
        scheduled: 0,
        confirmed: 0,
        confirmationEligible: 0,
      };

      for (const row of rows) {
        const date = row.scheduled_date.toISOString().slice(0, 10);
        if (date < weekStart || date > weekEnd) continue;

        const count = row._count._all;
        funnel.scheduled += count;
        if (row.status === 'DONE') funnel.done += count;

        const eligible = requiresConfirmation.get(row.service_type_id) ?? true;
        if (eligible) {
          funnel.confirmationEligible += count;
          if (row.rental_tenant_confirmation_status === 'CONFIRMED') funnel.confirmed += count;
        } else {
          funnel.confirmed += count;
        }
      }

      return funnel;
    });
  }
}

function summarise(
  inspectors: WorkloadMatrixRow[],
  level: 'busy' | 'overloaded',
): { count: number; inspectors: { inspectorId: string; inspectorName: string; total: number }[] } {
  const matching = inspectors
    .filter((row) => row.level === level)
    .map(({ inspectorId, inspectorName, total }) => ({ inspectorId, inspectorName, total }));
  return { count: matching.length, inspectors: matching };
}
