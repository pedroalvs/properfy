import type { PrismaClient, Prisma, AppointmentStatus } from '@prisma/client';
import type { IReportDataReader, ReportDataFilters } from '../domain/report-data-reader';

/**
 * Reads the domain to build the 4 scoped report types. Appointment-based reports
 * (Appointments / Performance / Agencies) range on the axis-selected appointment
 * timestamp; the Financial report reads the `financial_entries` ledger directly.
 */
export class PrismaReportDataReader implements IReportDataReader {
  constructor(private readonly prisma: PrismaClient) {}

  async getAppointmentRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const where = this.buildAppointmentWhere(filters, { applyStatus: true });
    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        tenant: true,
        branch: true,
        service_type: true,
        property: true,
        inspector: true,
        contacts: { where: { is_primary: true }, take: 1 },
      },
      // When grouping by property, order so each property's appointments are contiguous.
      orderBy: filters.groupProperties
        ? [{ property_id: 'asc' }, { scheduled_date: 'asc' }]
        : { scheduled_date: 'asc' },
    });

    return appointments.map((a) => {
      const contact = a.contacts[0];
      return {
        appointmentNumber: a.appointment_number,
        agency: a.tenant?.name ?? '',
        branch: a.branch?.name ?? '',
        serviceType: a.service_type?.name ?? '',
        propertyAddress: a.property?.street ?? '',
        suburb: a.property?.suburb ?? '',
        postcode: a.property?.postcode ?? '',
        state: a.property?.state ?? '',
        scheduledDate: a.scheduled_date ? a.scheduled_date.toISOString().split('T')[0] : '',
        timeSlot: a.time_slot,
        status: a.status,
        rentalTenant: contact?.rental_tenant_name ?? '',
        email: contact?.primary_email ?? '',
        phone: contact?.primary_phone ?? '',
        inspector: a.inspector?.name ?? '',
        confirmationStatus: a.rental_tenant_confirmation_status,
        keyRequired: a.key_required ? 'Yes' : 'No',
        createdAt: a.created_at ? a.created_at.toISOString() : '',
      };
    });
  }

  async getPerformanceRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const appointmentWhere = this.buildAppointmentWhere(filters, { applyStatus: false });
    const inspectors = await this.prisma.inspector.findMany({
      where: { deleted_at: null },
      include: {
        appointments: { where: appointmentWhere, include: { execution: true } },
      },
    });

    return inspectors
      .filter((i) => i.appointments.length > 0)
      .map((i) => {
        const total = i.appointments.length;
        const completed = i.appointments.filter((a) => a.status === 'DONE').length;
        const cancelled = i.appointments.filter((a) => a.status === 'CANCELLED').length;
        const rejected = i.appointments.filter((a) => a.status === 'REJECTED').length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const durations = i.appointments
          .filter((a) => a.execution?.finished_at && a.execution?.started_at)
          .map((a) => (a.execution!.finished_at!.getTime() - a.execution!.started_at.getTime()) / 60000);
        const avgDurationMin =
          durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : 0;

        return {
          inspectorName: i.name,
          inspectorEmail: i.email,
          totalAppointments: total,
          completed,
          cancelled,
          rejected,
          completionRate,
          avgDurationMin,
        };
      });
  }

  async getAgencyRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const where = this.buildAppointmentWhere(filters, { applyStatus: false });
    const appointments = await this.prisma.appointment.findMany({
      where,
      select: {
        tenant_id: true,
        branch_id: true,
        property_id: true,
        status: true,
        tenant: { select: { name: true } },
      },
    });

    interface Agg {
      name: string;
      total: number;
      completed: number;
      cancelled: number;
      scheduled: number;
      branches: Set<string>;
      properties: Set<string>;
    }
    const byTenant = new Map<string, Agg>();
    for (const a of appointments) {
      let agg = byTenant.get(a.tenant_id);
      if (!agg) {
        agg = { name: a.tenant?.name ?? '', total: 0, completed: 0, cancelled: 0, scheduled: 0, branches: new Set(), properties: new Set() };
        byTenant.set(a.tenant_id, agg);
      }
      agg.total += 1;
      if (a.status === 'DONE') agg.completed += 1;
      else if (a.status === 'CANCELLED') agg.cancelled += 1;
      else if (a.status === 'SCHEDULED') agg.scheduled += 1;
      if (a.branch_id) agg.branches.add(a.branch_id);
      agg.properties.add(a.property_id);
    }

    return [...byTenant.values()]
      .map((v) => ({
        agency: v.name,
        totalAppointments: v.total,
        completed: v.completed,
        cancelled: v.cancelled,
        scheduled: v.scheduled,
        activeBranches: v.branches.size,
        activeProperties: v.properties.size,
      }))
      .sort((a, b) => b.totalAppointments - a.totalAppointments);
  }

  async getFinancialRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const where: Prisma.FinancialEntryWhereInput = {
      status: 'APPROVED',
      effective_at: this.dateRange(filters),
    };
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    // Branch/suburb are appointment-scoped: applied via the (nullable) appointment relation,
    // which necessarily excludes appointment-less ledger entries when either is set.
    if (filters.branchId || filters.suburb) {
      where.appointment = {
        ...(filters.branchId ? { branch_id: filters.branchId } : {}),
        ...(filters.suburb ? { property: { suburb: { contains: filters.suburb, mode: 'insensitive' } } } : {}),
      };
    }

    const entries = await this.prisma.financialEntry.findMany({
      where,
      include: { tenant: true, inspector: true, appointment: true },
      orderBy: { effective_at: 'asc' },
    });

    let totalRevenue = 0;
    let totalExpense = 0;
    const rows: Record<string, unknown>[] = entries.map((e) => {
      const amount = Number(e.amount);
      // Invoice convention (generate-tenant-invoice): revenue = debit − refund + adjustment.
      // tenant_id is always set, so inspector-scope is the revenue/expense discriminator.
      let revenue = 0;
      let expense = 0;
      switch (e.entry_type) {
        case 'TENANT_DEBIT':
          revenue = amount;
          break;
        case 'REFUND':
          revenue = -amount;
          break;
        case 'INSPECTOR_PAYOUT':
          expense = amount;
          break;
        case 'MANUAL_ADJUSTMENT':
          if (e.inspector_id) expense = amount;
          else revenue = amount;
          break;
      }
      totalRevenue += revenue;
      totalExpense += expense;
      return {
        entryDate: e.effective_at ? e.effective_at.toISOString().split('T')[0] : '',
        agency: e.tenant?.name ?? '',
        entryType: e.entry_type,
        appointmentNumber: e.appointment?.appointment_number ?? '',
        inspector: e.inspector?.name ?? '',
        description: e.description ?? '',
        revenue: revenue !== 0 ? revenue : '',
        expense: expense !== 0 ? expense : '',
        currency: e.currency,
      };
    });

    if (rows.length > 0) {
      const blank = { entryDate: '', agency: '', entryType: '', appointmentNumber: '', inspector: '', currency: '' };
      rows.push({ ...blank, description: 'TOTAL', revenue: totalRevenue, expense: totalExpense });
      rows.push({ ...blank, description: 'NET (revenue − expenses)', revenue: totalRevenue - totalExpense, expense: '' });
    }
    return rows;
  }

  /** Inclusive [fromDate 00:00, toDate+1 00:00) UTC range — correct for both Date and DateTime columns. */
  private dateRange(filters: ReportDataFilters): { gte: Date; lt: Date } {
    const gte = new Date(`${filters.fromDate}T00:00:00.000Z`);
    const lt = new Date(`${filters.toDate}T00:00:00.000Z`);
    lt.setUTCDate(lt.getUTCDate() + 1);
    return { gte, lt };
  }

  private buildAppointmentWhere(
    filters: ReportDataFilters,
    opts: { applyStatus: boolean },
  ): Prisma.AppointmentWhereInput {
    const range = this.dateRange(filters);
    const where: Prisma.AppointmentWhereInput = { deleted_at: null };

    // Axis selects the real domain column the Period ranges on.
    switch (filters.dateAxis) {
      case 'CREATED':
        where.created_at = range;
        break;
      case 'COMPLETED':
        where.done_checked_at = range; // nullable → excludes not-yet-completed rows
        break;
      case 'SCHEDULED':
      default:
        where.scheduled_date = range;
        break;
    }

    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.branchId) where.branch_id = filters.branchId;
    if (filters.suburb) where.property = { suburb: { contains: filters.suburb, mode: 'insensitive' } };
    if (opts.applyStatus && filters.status) where.status = filters.status as AppointmentStatus;

    return where;
  }
}
