import type { PrismaClient } from '@prisma/client';
import type { DashboardRepository } from '../domain/dashboard.repository';
import type { DashboardStatsOutput } from '../application/use-cases/get-dashboard-stats.use-case';

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getStats(tenantId?: string): Promise<DashboardStatsOutput> {
    const tenantFilter = tenantId ? { tenant_id: tenantId } : {};

    const [
      statusCounts,
      doneThisMonth,
      recentAppointments,
      noResponseTenants,
      pendingOperatorCrossChecks,
      pendingFinancialEntries,
      processingReports,
      totalProperties,
      activeInspectors,
      activeServiceGroups,
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
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
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
          property: { select: { street: true, suburb: true, state: true, postcode: true } },
        },
      }),

      // Pending actions: no response tenants
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          tenant_confirmation_status: 'NO_RESPONSE',
          status: { notIn: ['DONE', 'CANCELLED', 'REJECTED'] },
        },
      }),

      // Pending actions: pending financial entries
      this.prisma.appointment.count({
        where: {
          ...tenantFilter,
          deleted_at: null,
          status: 'DONE',
          done_checked_by_user_id: null,
        },
      }),

      // Pending actions: pending financial entries
      this.prisma.financialEntry.count({
        where: {
          ...tenantFilter,
          status: 'PENDING',
        },
      }),

      // Pending actions: processing reports
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

      // Quick stats: active inspectors eligible for this tenant (or all if no tenant scope)
      tenantId
        ? this.prisma.inspector.findMany({
            where: { status: 'ACTIVE', deleted_at: null },
            select: { client_eligibility_json: true },
          }).then((rows) =>
            rows.filter((r) => {
              const eligibility = (r.client_eligibility_json as string[]) ?? [];
              return eligibility.includes(tenantId);
            }).length,
          )
        : this.prisma.inspector.count({
            where: { status: 'ACTIVE', deleted_at: null },
          }),

      // Quick stats: active service groups
      this.prisma.serviceGroup.count({
        where: {
          ...tenantFilter,
          status: { in: ['DRAFT', 'PUBLISHED', 'ACCEPTED'] },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status] = row._count;
    }

    const formattedRecentAppointments = recentAppointments.map((apt) => {
      const prop = apt.property;
      const address = [prop.street, prop.suburb, prop.state, prop.postcode]
        .filter(Boolean)
        .join(', ');
      return {
        id: apt.id,
        code: `APT-${apt.id.slice(0, 6).toUpperCase()}`,
        propertyAddress: address,
        status: apt.status,
        doneCheckedByUserId: apt.done_checked_by_user_id,
        scheduledDate: apt.scheduled_date.toISOString().split('T')[0]!,
      };
    });

    return {
      appointmentsByStatus: {
        draft: statusMap['DRAFT'] ?? 0,
        awaitingInspector: statusMap['AWAITING_INSPECTOR'] ?? 0,
        scheduled: statusMap['SCHEDULED'] ?? 0,
        doneThisMonth,
      },
      recentAppointments: formattedRecentAppointments,
      pendingActions: {
        noResponseTenants,
        pendingOperatorCrossChecks,
        pendingFinancialEntries,
        processingReports,
      },
      quickStats: {
        totalProperties,
        activeInspectors,
        activeServiceGroups,
      },
    };
  }
}
