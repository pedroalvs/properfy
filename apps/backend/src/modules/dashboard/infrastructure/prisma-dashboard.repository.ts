import type { PrismaClient } from '@prisma/client';
import type { DashboardRepository } from '../domain/dashboard.repository';
import type { DashboardStatsOutput, InspectorBreakdowns, InspectorDayCount } from '../application/use-cases/get-dashboard-stats.use-case';

type InspectorGroupByRow = { inspector_id: string | null; _count: { _all: number } };

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Monday 00:00:00.000 -> Sunday 23:59:59.999 of the current week, server-local time. */
  private currentWeekRange(now: Date = new Date()): { from: Date; to: Date } {
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysSinceMonday = (dayOfWeek + 6) % 7; // 0 if Monday, 6 if Sunday
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  /** Tomorrow 00:00:00.000 -> 23:59:59.999, server-local time. */
  private tomorrowRange(now: Date = new Date()): { from: Date; to: Date } {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  private static computeAlertLevel(count: number): 'yellow' | 'red' | null {
    if (count >= 18) return 'red';
    if (count >= 15) return 'yellow';
    return null;
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
        alertLevel: withAlertLevel ? PrismaDashboardRepository.computeAlertLevel(row._count._all) : null,
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
    const week = this.currentWeekRange(now);
    const tomorrow = this.tomorrowRange(now);

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

      // Done this month
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'DONE',
          updated_at: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
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
          property: { select: { property_code: true, street: true, suburb: true, state: true, postcode: true } },
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

      // Pending financial entries
      this.prisma.financialEntry.count({
        where: {
          ...tenantFilter,
          status: 'PENDING',
        },
      }),

      // Processing reports
      this.prisma.report.count({
        where: {
          ...(tenantId ? { tenant_id: tenantId } : {}),
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
          ...(tenantId ? { appointments: { some: { tenant_id: tenantId } } } : {}),
        },
      }),

      // Done this week (uses updated_at as proxy — consistent with doneThisMonth)
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'DONE',
          updated_at: { gte: week.from, lte: week.to },
        },
      }),

      // Scheduled this week
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'SCHEDULED',
          scheduled_date: { gte: week.from, lte: week.to },
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
      const prop = (apt as unknown as { property: { property_code: string; street: string; suburb: string; state: string; postcode: string } }).property;
      const address = [prop.street, prop.suburb, prop.state, prop.postcode]
        .filter(Boolean)
        .join(', ');
      return {
        id: apt.id,
        code: prop.property_code,
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
            scheduled_date: { gte: tomorrow.from, lte: tomorrow.to },
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
            scheduled_date: { gte: week.from, lte: week.to },
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
            scheduled_date: { gte: week.from, lte: week.to },
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
