import type { PrismaClient } from '@prisma/client';
import type { IReportDataReader, ReportDataFilters } from '../domain/report-data-reader';

export class PrismaReportDataReader implements IReportDataReader {
  constructor(private readonly prisma: PrismaClient) {}

  async getInspectionRows(filters: ReportDataFilters, appointmentStatus: string): Promise<Record<string, unknown>[]> {
    const where = this.buildAppointmentWhere(filters, appointmentStatus);
    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        service_type: true,
        branch: true,
        property: true,
        inspector: true,
        contact: true,
      },
      orderBy: { scheduled_date: 'asc' },
    });

    return appointments.map((a) => ({
      appointmentId: a.id,
      serviceType: a.service_type?.name ?? '',
      branch: a.branch?.name ?? '',
      propertyAddress: a.property?.street ?? '',
      suburb: a.property?.suburb ?? '',
      postcode: a.property?.postcode ?? '',
      state: a.property?.state ?? '',
      scheduledDate: a.scheduled_date?.toISOString().split('T')[0] ?? '',
      timeSlot: a.time_slot,
      status: a.status,
      tenantName: a.contact?.tenant_name ?? '',
      tenantEmail: a.contact?.primary_email ?? '',
      tenantPhone: a.contact?.primary_phone ?? '',
      inspector: a.inspector?.name ?? '',
      confirmationStatus: a.tenant_confirmation_status,
      keyRequired: a.key_required ? 'Yes' : 'No',
      createdAt: a.created_at?.toISOString() ?? '',
    }));
  }

  async getInspectorPerformanceRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const baseWhere = this.buildBaseWhere(filters);
    const inspectors = await this.prisma.inspector.findMany({
      where: { deleted_at: null },
      include: {
        appointments: {
          where: {
            ...baseWhere,
            deleted_at: null,
          },
        },
      },
    });

    return inspectors
      .filter((i) => i.appointments.length > 0)
      .map((i) => {
        const total = i.appointments.length;
        const done = i.appointments.filter((a) => a.status === 'DONE').length;
        const cancelled = i.appointments.filter((a) => a.status === 'CANCELLED').length;
        const rejected = i.appointments.filter((a) => a.status === 'REJECTED').length;
        const scheduled = i.appointments.filter((a) => a.status === 'SCHEDULED').length;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        return {
          inspectorName: i.name,
          inspectorEmail: i.email,
          totalScheduled: scheduled + done,
          totalDone: done,
          totalCancelled: cancelled,
          totalRejected: rejected,
          completionRate,
          avgDurationMin: 0,
          period: `${filters.fromDate} to ${filters.toDate}`,
        };
      });
  }

  async getConfirmationStatusRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const where = this.buildBaseWhere(filters);
    const appointments = await this.prisma.appointment.findMany({
      where: { ...where, deleted_at: null },
      include: {
        service_type: true,
        property: true,
        contact: true,
        portal_tokens: { orderBy: { created_at: 'desc' }, take: 1 },
        notifications: { where: { template_code: 'INITIAL_NOTICE' }, orderBy: { created_at: 'desc' }, take: 1 },
      },
      orderBy: { scheduled_date: 'asc' },
    });

    return appointments.map((a) => {
      const lastReminder = a.notifications?.[0];
      const portalToken = a.portal_tokens?.[0];
      return {
        appointmentId: a.id,
        serviceType: a.service_type?.name ?? '',
        propertyAddress: a.property?.street ?? '',
        scheduledDate: a.scheduled_date?.toISOString().split('T')[0] ?? '',
        tenantName: a.contact?.tenant_name ?? '',
        tenantPhone: a.contact?.primary_phone ?? '',
        confirmationStatus: a.tenant_confirmation_status,
        initialNoticeSent: lastReminder?.sent_at?.toISOString() ?? '',
        lastReminderSent: lastReminder?.sent_at?.toISOString() ?? '',
        portalLastAccessed: portalToken?.last_accessed_at?.toISOString() ?? '',
        notes: a.notes ?? '',
      };
    });
  }

  async getFinancialServicesRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const where = this.buildBaseWhere(filters);
    const appointments = await this.prisma.appointment.findMany({
      where: { ...where, status: 'DONE', deleted_at: null },
      include: {
        service_type: true,
        tenant: true,
        branch: true,
        property: true,
        inspector: true,
        financial_entries: true,
      },
      orderBy: { scheduled_date: 'asc' },
    });

    return appointments.map((a) => {
      const tenantDebit = a.financial_entries?.find((e) => e.entry_type === 'TENANT_DEBIT');
      const inspectorPayout = a.financial_entries?.find((e) => e.entry_type === 'INSPECTOR_PAYOUT');
      return {
        appointmentId: a.id,
        serviceType: a.service_type?.name ?? '',
        tenant: a.tenant?.name ?? '',
        branch: a.branch?.name ?? '',
        propertyAddress: a.property?.street ?? '',
        inspector: a.inspector?.name ?? '',
        scheduledDate: a.scheduled_date?.toISOString().split('T')[0] ?? '',
        doneDate: a.done_checked_at?.toISOString().split('T')[0] ?? '',
        priceAmount: Number(a.price_amount),
        payoutAmount: Number(a.payout_amount),
        currency: a.tenant?.currency ?? 'AUD',
        tenantDebitStatus: tenantDebit?.status ?? '',
        inspectorPayoutStatus: inspectorPayout?.status ?? '',
      };
    });
  }

  private buildAppointmentWhere(filters: ReportDataFilters, appointmentStatus: string) {
    const where: Record<string, unknown> = {
      status: appointmentStatus,
      deleted_at: null,
      scheduled_date: {
        gte: new Date(filters.fromDate),
        lte: new Date(filters.toDate),
      },
    };
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.serviceTypeId) where.service_type_id = filters.serviceTypeId;
    if (filters.branchId) where.branch_id = filters.branchId;
    if (filters.inspectorId) where.inspector_id = filters.inspectorId;
    if (filters.tenantConfirmationStatus) where.tenant_confirmation_status = filters.tenantConfirmationStatus;
    if (filters.search) {
      where.OR = [
        { property: { street: { contains: filters.search, mode: 'insensitive' } } },
        { property: { suburb: { contains: filters.search, mode: 'insensitive' } } },
        { contact: { tenant_name: { contains: filters.search, mode: 'insensitive' } } },
        { contact: { primary_phone: { contains: filters.search, mode: 'insensitive' } } },
        { contact: { primary_email: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  private buildBaseWhere(filters: ReportDataFilters) {
    const where: Record<string, unknown> = {
      scheduled_date: {
        gte: new Date(filters.fromDate),
        lte: new Date(filters.toDate),
      },
    };
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.serviceTypeId) where.service_type_id = filters.serviceTypeId;
    if (filters.branchId) where.branch_id = filters.branchId;
    if (filters.inspectorId) where.inspector_id = filters.inspectorId;
    return where;
  }
}
