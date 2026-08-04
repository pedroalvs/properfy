import type { PrismaClient } from '@prisma/client';
import {
  addCivilDays,
  AGENCY_VISIBLE_ENTRY_TYPES,
  mondayOf,
  workloadAlertLevel,
} from '@properfy/shared';
import {
  civilDateInTimezone,
  nextCivilDay,
  PLATFORM_TIMEZONE,
} from '../../../shared/domain/timezone-date';
import { AppointmentCodeFormatter } from '../../appointment/domain/appointment-code.formatter';
import type { DashboardRepository } from '../domain/dashboard.repository';
import type { DashboardStatsOutput, InspectorBreakdowns, InspectorDayCount } from '../application/use-cases/get-dashboard-stats.use-case';

type InspectorGroupByRow = { inspector_id: string | null; _count: { _all: number } };

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Inclusive [start 00:00 UTC, end+1 00:00 UTC) — ONLY for `@db.Date` columns.
   *
   * `scheduled_date` is a `@db.Date` pinned to UTC midnight of a Sydney civil
   * date, so it must be bounded by civil dates. This replaced a pair of helpers
   * that built their windows with `new Date(y, m, d)`, which reads the *server's*
   * timezone: on any host not set to Sydney the week and month boundaries landed
   * on the wrong day, and the figures disagreed with the Inspector Workload
   * screen. See `prisma-inspector-workload.repository.ts`, which uses the same
   * discipline.
   */
  private civilDateRange(startDate: string, endDate: string): { gte: Date; lt: Date } {
    return {
      gte: new Date(`${startDate}T00:00:00.000Z`),
      lt: new Date(`${nextCivilDay(endDate)}T00:00:00.000Z`),
    };
  }

  /** First and last civil date of the month the given date falls in. */
  private static monthRange(civilDate: string): { start: string; end: string } {
    const [year, month] = civilDate.split('-').map(Number) as [number, number];
    // Day 0 of the following month is the last day of this one.
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: `${civilDate.slice(0, 7)}-01`, end };
  }

  private buildInspectorList(
    rows: InspectorGroupByRow[],
    nameMap: Map<string, string>,
    withAlertLevel: boolean,
  ): InspectorDayCount[] {
    const list: InspectorDayCount[] = [];

    for (const row of rows) {
      const id = row.inspector_id;
      if (!id) continue;

      const name = nameMap.get(id);
      if (name === undefined) {
        console.warn(`[PrismaDashboardRepository] inspector id=${id} not found in name resolution — row excluded`);
        continue;
      }

      list.push({
        inspectorId: id,
        inspectorName: name,
        count: row._count._all,
        alertLevel: withAlertLevel ? workloadAlertLevel(row._count._all) : null,
      });
    }

    return list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.inspectorName.localeCompare(b.inspectorName);
    });
  }

  /**
   * Returns aggregated dashboard statistics.
   * @param tenantId - Scope to a tenant; undefined for AM/OP (unscoped).
   * @param includeInspectorBreakdowns - When true, runs the three per-inspector groupBy queries.
   * @param now - Injectable clock for deterministic testing (defaults to new Date()).
   */
  async getStats(
    tenantId?: string,
    includeInspectorBreakdowns = false,
    now: Date = new Date(),
  ): Promise<DashboardStatsOutput> {
    const tenantFilter = tenantId ? { tenant_id: tenantId } : {};

    // Every window below is a Sydney civil window, not a server-local one.
    const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
    const weekStart = mondayOf(today);
    const week = this.civilDateRange(weekStart, addCivilDays(weekStart, 6));
    const tomorrow = this.civilDateRange(nextCivilDay(today), nextCivilDay(today));
    const month = PrismaDashboardRepository.monthRange(today);
    const monthRange = this.civilDateRange(month.start, month.end);

    const [
      statusCounts,
      doneThisMonth,
      recentAppointments,
      noResponseRentalTenants,
      pendingOperatorCrossChecks,
      pendingFinancialEntries,
      processingReports,
      totalProperties,
      activeInspectors,
      activeServiceGroups,
      doneThisWeek,
      scheduledThisWeek,
      rejectedTotal,
    ] = await Promise.all([
      // Appointment counts by status (DRAFT, AWAITING_INSPECTOR, SCHEDULED)
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: { in: ['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED'] },
        },
        _count: true,
      }),

      // Done this month, by scheduled date. `updated_at` was the original key
      // here and was never a completion date — any later edit re-stamps it, so
      // an inspection done in June and edited in July counted as July.
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'DONE',
          scheduled_date: monthRange,
        },
      }),

      // Recent appointments (last 5)
      this.prisma.appointment.findMany({
        where: {
          ...tenantFilter,
          deleted_at: null,
        },
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          property: { select: { street: true, suburb: true, state: true, postcode: true } },
          tenant: { select: { appointment_code_prefix: true } },
        },
      }),

      // Pending actions: no response tenants
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          rental_tenant_confirmation_status: 'NO_RESPONSE',
          status: { notIn: ['DONE', 'CANCELLED', 'REJECTED'] },
        },
      }),

      // Pending actions: operator cross-checks
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'DONE',
          done_checked_by_user_id: null,
        },
      }),

      // Pending financial entries. `tenantId` is set only for CL_ADMIN/CL_USER
      // (get-dashboard-stats.use-case.ts), so when it is present this is an agency
      // read and must exclude the platform↔inspector leg like every other one —
      // otherwise the count alone reveals pending payout activity.
      this.prisma.financialEntry.count({
        where: {
          ...tenantFilter,
          ...(tenantId
            ? { entry_type: { in: [...AGENCY_VISIBLE_ENTRY_TYPES] }, inspector_id: null }
            : {}),
          status: 'PENDING',
        },
      }),

      // Processing reports. `tenantId` is set only for CL_ADMIN/CL_USER, who can
      // only ever list their own agency-scoped runs — so the count must apply the
      // same `agency_scoped` predicate the report list does, or the tile would
      // count an operator's run against this agency that /reports never shows.
      this.prisma.report.count({
        where: {
          ...(tenantId ? { tenant_id: tenantId, agency_scoped: true } : {}),
          status: 'PROCESSING',
        },
      }),

      // Quick stats: total properties
      this.prisma.property.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
        },
      }),

      // Quick stats: active inspectors available to this tenant.
      // An ACTIVE inspector is available unless the tenant is in its
      // deny-list (`blocked_clients_json`). AM/OP (no tenant scope) count all.
      tenantId
        ? this.prisma.inspector.findMany({
            where: { status: 'ACTIVE', deleted_at: null },
            select: { blocked_clients_json: true },
          }).then((rows) =>
            rows.filter((r) => {
              const blocked = Array.isArray(r.blocked_clients_json)
                ? (r.blocked_clients_json as string[])
                : [];
              return !blocked.includes(tenantId);
            }).length,
          )
        : this.prisma.inspector.count({
            where: { status: 'ACTIVE', deleted_at: null },
          }),

      // Quick stats: active service groups. Service groups are cross-tenant
      // (they carry no `tenant_id`); for a tenant-scoped dashboard, count the
      // groups that contain at least one of the tenant's appointments.
      this.prisma.serviceGroup.count({
        where: {
          status: { in: ['DRAFT', 'PUBLISHED', 'ACCEPTED'] },
          ...(tenantId
            ? { appointments: { some: { tenant_id: tenantId, deleted_at: null } } }
            : {}),
        },
      }),

      // Done this week, by scheduled date — same key as doneThisMonth above and
      // as the Inspector Workload screen, so the three figures agree.
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'DONE',
          scheduled_date: week,
        },
      }),

      // Scheduled this week
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'SCHEDULED',
          scheduled_date: week,
        },
      }),

      // Rejected total (all-time, no date filter)
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'REJECTED',
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status] = row._count as number;
    }

    const formattedRecentAppointments = recentAppointments.map((apt) => {
      const row = apt as unknown as {
        property: { street: string; suburb: string; state: string; postcode: string };
        tenant: { appointment_code_prefix: string | null } | null;
      };
      const prop = row.property;
      const address = [prop.street, prop.suburb, prop.state, prop.postcode]
        .filter(Boolean)
        .join(', ');
      return {
        id: apt.id,
        code: AppointmentCodeFormatter.formatParts(apt.appointment_number, row.tenant?.appointment_code_prefix),
        propertyAddress: address,
        status: apt.status,
        doneCheckedByUserId: apt.done_checked_by_user_id,
        scheduledDate: apt.scheduled_date.toISOString().split('T')[0]!,
      };
    });

    let inspectorBreakdowns: InspectorBreakdowns | null = null;

    if (includeInspectorBreakdowns) {
      const [tomorrowRows, scheduledWeekRows, confirmedWeekRows] = await Promise.all([
        this.prisma.appointment.groupBy({
          by: ['inspector_id'],
          where: {
            ...tenantFilter,
            deleted_at: null,
            status: 'SCHEDULED',
            rental_tenant_confirmation_status: 'CONFIRMED',
            inspector_id: { not: null },
            scheduled_date: tomorrow,
          },
          _count: { _all: true },
        }),
        this.prisma.appointment.groupBy({
          by: ['inspector_id'],
          where: {
            ...tenantFilter,
            deleted_at: null,
            status: 'SCHEDULED',
            inspector_id: { not: null },
            scheduled_date: week,
          },
          _count: { _all: true },
        }),
        this.prisma.appointment.groupBy({
          by: ['inspector_id'],
          where: {
            ...tenantFilter,
            deleted_at: null,
            status: 'SCHEDULED',
            rental_tenant_confirmation_status: 'CONFIRMED',
            inspector_id: { not: null },
            scheduled_date: week,
          },
          _count: { _all: true },
        }),
      ]);

      const typedTomorrowRows = tomorrowRows as unknown as InspectorGroupByRow[];
      const typedScheduledWeekRows = scheduledWeekRows as unknown as InspectorGroupByRow[];
      const typedConfirmedWeekRows = confirmedWeekRows as unknown as InspectorGroupByRow[];

      const allIds = new Set<string>();
      for (const row of [...typedTomorrowRows, ...typedScheduledWeekRows, ...typedConfirmedWeekRows]) {
        if (row.inspector_id) allIds.add(row.inspector_id);
      }

      const inspectorRecords = await this.prisma.inspector.findMany({
        where: { id: { in: Array.from(allIds) } },
        select: { id: true, name: true },
      });

      const nameMap = new Map<string, string>(
        inspectorRecords.map((r) => [r.id, r.name]),
      );

      inspectorBreakdowns = {
        tomorrowByInspector: this.buildInspectorList(typedTomorrowRows, nameMap, true),
        scheduledThisWeekByInspector: this.buildInspectorList(typedScheduledWeekRows, nameMap, false),
        confirmedThisWeekByInspector: this.buildInspectorList(typedConfirmedWeekRows, nameMap, false),
      };
    }

    return {
      appointmentsByStatus: {
        draft: statusMap['DRAFT'] ?? 0,
        awaitingInspector: statusMap['AWAITING_INSPECTOR'] ?? 0,
        scheduled: statusMap['SCHEDULED'] ?? 0,
        doneThisMonth,
        doneThisWeek,
        scheduledThisWeek,
        rejectedTotal,
      },
      recentAppointments: formattedRecentAppointments,
      pendingActions: {
        noResponseRentalTenants,
        pendingOperatorCrossChecks,
        pendingFinancialEntries,
        processingReports,
      },
      quickStats: {
        totalProperties,
        activeInspectors,
        activeServiceGroups,
      },
      inspectorBreakdowns,
    };
  }
}
