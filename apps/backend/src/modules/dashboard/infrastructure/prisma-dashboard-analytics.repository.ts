import type { PrismaClient, Prisma } from '@prisma/client';
import {
  addCivilDays,
  AppointmentStatus,
  type AnalyticsGranularity,
  type AnalyticsHeatmapResponse,
  type DashboardAnalyticsResponse,
} from '@properfy/shared';
import {
  civilDateInTimezone,
  nextCivilDay,
  parseDateInTimezone,
  PLATFORM_TIMEZONE,
} from '../../../shared/domain/timezone-date';
import type {
  AnalyticsQuery,
  DashboardAnalyticsRepository,
  HeatmapQuery,
} from '../domain/dashboard-analytics.repository';

/**
 * The platform trades in a single currency (Sydney-only; `tenants.settings_json`
 * defaults it to AUD). Summing a mixed-currency ledger would be meaningless, so
 * the figure is reported against the platform currency rather than derived per row.
 */
const PLATFORM_CURRENCY = 'AUD';

const ALL_STATUSES = [
  AppointmentStatus.DRAFT,
  AppointmentStatus.AWAITING_INSPECTOR,
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.DONE,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.REJECTED,
] as const;

/**
 * Reads the analytics aggregations for the Analytics screen (client scope §4.1).
 *
 * Every window here is anchored to `PLATFORM_TIMEZONE`, following the report
 * module: `scheduled_date` is a `@db.Date` pinned to UTC midnight of a Sydney
 * civil date and ranges as a civil range, while real timestamps (`effective_at`)
 * range on Sydney day boundaries. The dashboard-stats repository computes its
 * week window in *server-local* time instead — that is pre-existing drift and is
 * deliberately not repeated here.
 */
export class PrismaDashboardAnalyticsRepository implements DashboardAnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Inclusive [start 00:00 UTC, end+1 00:00 UTC) — ONLY for `@db.Date` columns. */
  private civilDateRange(startDate: string, endDate: string): { gte: Date; lt: Date } {
    return {
      gte: new Date(`${startDate}T00:00:00.000Z`),
      lt: new Date(`${nextCivilDay(endDate)}T00:00:00.000Z`),
    };
  }

  /** Inclusive [start 00:00 Sydney, end+1 00:00 Sydney) — for real timestamp columns. */
  private sydneyTimestampRange(startDate: string, endDate: string): { gte: Date; lt: Date } {
    return {
      gte: parseDateInTimezone(startDate, PLATFORM_TIMEZONE),
      lt: parseDateInTimezone(nextCivilDay(endDate), PLATFORM_TIMEZONE),
    };
  }

  /** Monday on or before the given civil date. */
  private static weekStart(civilDate: string): string {
    const date = new Date(`${civilDate}T00:00:00.000Z`);
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    return addCivilDays(civilDate, -daysSinceMonday);
  }

  /** First and last civil date of the month the given date falls in. */
  private static monthRange(civilDate: string): { start: string; end: string } {
    const [year, month] = civilDate.split('-').map(Number) as [number, number];
    // Day 0 of the following month is the last day of this one — correct for
    // 28/29/30/31-day months without a leap-year branch.
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: `${civilDate.slice(0, 7)}-01`, end };
  }

  async getAnalytics(query: AnalyticsQuery): Promise<DashboardAnalyticsResponse> {
    const now = query.now ?? new Date();
    const tenantFilter = query.tenantId ? { tenant_id: query.tenantId } : {};
    const base: Prisma.AppointmentWhereInput = { ...tenantFilter, deleted_at: null };
    const periodRange = this.civilDateRange(query.startDate, query.endDate);
    const inPeriod: Prisma.AppointmentWhereInput = { ...base, scheduled_date: periodRange };

    // The standing today/week/month indicators are absolute Sydney-calendar
    // windows and deliberately ignore the selected period.
    const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
    const weekStart = PrismaDashboardAnalyticsRepository.weekStart(today);
    const month = PrismaDashboardAnalyticsRepository.monthRange(today);

    const [
      todayCount,
      thisWeekCount,
      thisMonthCount,
      statusRows,
      confirmationEligible,
      confirmationConfirmed,
      revenueSum,
      evolutionRows,
      distributionRows,
      executions,
      serviceTypes,
    ] = await Promise.all([
      this.prisma.appointment.count({ where: { ...base, scheduled_date: this.civilDateRange(today, today) } }),
      this.prisma.appointment.count({
        where: { ...base, scheduled_date: this.civilDateRange(weekStart, addCivilDays(weekStart, 6)) },
      }),
      this.prisma.appointment.count({
        where: { ...base, scheduled_date: this.civilDateRange(month.start, month.end) },
      }),

      this.prisma.appointment.groupBy({ by: ['status'], where: inPeriod, _count: { _all: true } }),

      // Only service types that actually ask the rental tenant belong in the
      // denominator — counting the rest would depress the rate by design.
      this.prisma.appointment.count({
        where: { ...inPeriod, service_type: { requires_rental_tenant_confirmation: true } },
      }),
      this.prisma.appointment.count({
        where: {
          ...inPeriod,
          service_type: { requires_rental_tenant_confirmation: true },
          rental_tenant_confirmation_status: 'CONFIRMED',
        },
      }),

      query.includeRevenue
        ? this.prisma.financialEntry.aggregate({
            where: {
              ...tenantFilter,
              status: 'APPROVED',
              entry_type: 'TENANT_DEBIT',
              effective_at: this.sydneyTimestampRange(query.startDate, query.endDate),
            },
            _sum: { amount: true },
          })
        : Promise.resolve(null),

      this.prisma.appointment.groupBy({
        by: ['scheduled_date'],
        where: inPeriod,
        _count: { _all: true },
      }),

      this.prisma.appointment.groupBy({
        by: ['service_type_id'],
        where: inPeriod,
        _count: { _all: true },
      }),

      this.prisma.inspectionExecution.findMany({
        where: { finished_at: { not: null }, appointment: inPeriod },
        select: { started_at: true, finished_at: true, appointment: { select: { service_type_id: true } } },
      }),

      this.prisma.serviceType.findMany({ select: { id: true, code: true, name: true } }),
    ]);

    const statusInPeriod = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<
      (typeof ALL_STATUSES)[number],
      number
    >;
    for (const row of statusRows) {
      statusInPeriod[row.status as (typeof ALL_STATUSES)[number]] = row._count._all;
    }
    const totalInPeriod = Object.values(statusInPeriod).reduce((sum, n) => sum + n, 0);

    const serviceTypeById = new Map(serviceTypes.map((t) => [t.id, t]));

    return {
      period: { startDate: query.startDate, endDate: query.endDate, granularity: query.granularity },
      kpis: {
        today: todayCount,
        thisWeek: thisWeekCount,
        thisMonth: thisMonthCount,
        inPeriod: totalInPeriod,
        cancelledInPeriod: statusInPeriod[AppointmentStatus.CANCELLED],
      },
      statusInPeriod,
      confirmationRate: { confirmed: confirmationConfirmed, eligible: confirmationEligible },
      revenue: revenueSum
        ? { amount: Number(revenueSum._sum.amount ?? 0), currency: PLATFORM_CURRENCY }
        : null,
      evolution: this.buildEvolution(evolutionRows, query.startDate, query.endDate, query.granularity),
      serviceTypeDistribution: distributionRows
        .map((row) => {
          const type = serviceTypeById.get(row.service_type_id);
          return {
            serviceTypeId: row.service_type_id,
            code: type?.code ?? '',
            name: type?.name ?? '',
            count: row._count._all,
          };
        })
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      avgExecutionMinutes: this.buildAvgExecution(executions, serviceTypeById),
    };
  }

  /**
   * Buckets the per-date counts and zero-fills every bucket in the range, so a
   * quiet day renders as a dip in the line rather than vanishing from the axis.
   */
  private buildEvolution(
    rows: { scheduled_date: Date; _count: { _all: number } }[],
    startDate: string,
    endDate: string,
    granularity: AnalyticsGranularity,
  ): DashboardAnalyticsResponse['evolution'] {
    const bucketOf = (civilDate: string): string =>
      granularity === 'week' ? PrismaDashboardAnalyticsRepository.weekStart(civilDate) : civilDate;

    const counts = new Map<string, number>();
    // `scheduled_date` is a @db.Date pinned to UTC midnight, so the ISO prefix IS
    // the civil date — no timezone conversion, which would shift it by a day.
    for (const row of rows) {
      const bucket = bucketOf(row.scheduled_date.toISOString().slice(0, 10));
      counts.set(bucket, (counts.get(bucket) ?? 0) + row._count._all);
    }

    const series: DashboardAnalyticsResponse['evolution'] = [];
    const step = granularity === 'week' ? 7 : 1;
    let cursor = bucketOf(startDate);
    while (cursor <= endDate) {
      series.push({ bucketStart: cursor, count: counts.get(cursor) ?? 0 });
      cursor = addCivilDays(cursor, step);
    }
    return series;
  }

  private buildAvgExecution(
    executions: { started_at: Date; finished_at: Date | null; appointment: { service_type_id: string } }[],
    serviceTypeById: Map<string, { id: string; code: string; name: string }>,
  ): DashboardAnalyticsResponse['avgExecutionMinutes'] {
    const totals = new Map<string, { minutes: number; samples: number }>();
    for (const execution of executions) {
      if (!execution.finished_at) continue;
      const minutes = (execution.finished_at.getTime() - execution.started_at.getTime()) / 60_000;
      // A negative duration means corrupt data, not a fast inspection — drop it
      // rather than let it pull an average below zero and fail the schema.
      if (minutes < 0) continue;
      const key = execution.appointment.service_type_id;
      const agg = totals.get(key) ?? { minutes: 0, samples: 0 };
      agg.minutes += minutes;
      agg.samples += 1;
      totals.set(key, agg);
    }

    return [...totals.entries()]
      .map(([serviceTypeId, agg]) => {
        const type = serviceTypeById.get(serviceTypeId);
        return {
          serviceTypeId,
          code: type?.code ?? '',
          name: type?.name ?? '',
          avgMinutes: agg.samples > 0 ? Math.round(agg.minutes / agg.samples) : null,
          sampleSize: agg.samples,
        };
      })
      .sort((a, b) => (b.avgMinutes ?? 0) - (a.avgMinutes ?? 0) || a.name.localeCompare(b.name));
  }

  async getHeatmap(query: HeatmapQuery): Promise<AnalyticsHeatmapResponse> {
    const tenantFilter = query.tenantId ? { tenant_id: query.tenantId } : {};
    const appointments = await this.prisma.appointment.findMany({
      where: {
        ...tenantFilter,
        deleted_at: null,
        scheduled_date: this.civilDateRange(query.startDate, query.endDate),
      },
      select: { property: { select: { suburb: true, lat: true, lng: true } } },
    });

    const bySuburb = new Map<string, { suburb: string; latSum: number; lngSum: number; count: number }>();
    let totalWithoutCoordinates = 0;

    for (const { property } of appointments) {
      if (!property?.suburb || property.lat === null || property.lng === null) {
        totalWithoutCoordinates += 1;
        continue;
      }
      // Suburb names arrive with inconsistent casing from imports; fold the key
      // so 'Newtown' and 'NEWTOWN' land on one point instead of two.
      const key = property.suburb.trim().toLowerCase();
      const agg = bySuburb.get(key) ?? { suburb: property.suburb.trim(), latSum: 0, lngSum: 0, count: 0 };
      agg.latSum += Number(property.lat);
      agg.lngSum += Number(property.lng);
      agg.count += 1;
      bySuburb.set(key, agg);
    }

    const points = [...bySuburb.values()]
      .map((agg) => ({
        suburb: agg.suburb,
        lat: agg.latSum / agg.count,
        lng: agg.lngSum / agg.count,
        count: agg.count,
      }))
      .sort((a, b) => b.count - a.count || a.suburb.localeCompare(b.suburb));

    return {
      points,
      totalPlotted: points.reduce((sum, p) => sum + p.count, 0),
      totalWithoutCoordinates,
    };
  }
}
