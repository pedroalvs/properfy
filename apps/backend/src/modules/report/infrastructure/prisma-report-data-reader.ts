import type { PrismaClient, Prisma, AppointmentStatus } from '@prisma/client';
import {
  formatCivilDate,
  formatConfirmationDateCell,
  formatInstantDate,
  formatInstantDateTime,
  formatWallTimeRange,
  formatInvoiceNumber,
  describeGoal,
  REWARD_AWARD_STATUS_LABELS,
  AGENCY_VISIBLE_ENTRY_TYPES,
  type GoalMetric,
  type RewardAwardStatus,
} from '@properfy/shared';
import { nextCivilDay, parseDateInTimezone, PLATFORM_TIMEZONE } from '../../../shared/domain/timezone-date';
import { compareAwardsForRanking } from '../../inspector-program/domain/ordering';
import { goalTermsForPeriod } from '../../inspector-program/domain/goal-periods';
import { INSPECTOR_PROGRAM_COLUMNS } from '../domain/report.constants';
import type { IReportDataReader, ReportDataFilters } from '../domain/report-data-reader';

/** A fully-blank Inspector Program row (every column empty), so synthetic rows never drift from the column set. */
const INSPECTOR_PROGRAM_BLANK_ROW: Readonly<Record<string, unknown>> = Object.freeze(
  Object.fromEntries(INSPECTOR_PROGRAM_COLUMNS.map((c) => [c.key, ''])),
);

function inspectorProgramRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...INSPECTOR_PROGRAM_BLANK_ROW, ...overrides };
}

/** `@db.Date` (UTC-midnight) → its `YYYY-MM-DD` civil string, for grouping keys and the P9 comparator. */
function civilDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `financial_entries.status` (ALL_CAPS) → a human label for the Ledger status column. */
function humaniseEntryStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/**
 * Reads the domain to build the 5 scoped report types. Appointment-based reports
 * (Appointments / Performance / Agencies) range on the axis-selected appointment
 * timestamp; the Financial report reads the `financial_entries` ledger directly; the
 * Inspector Program report ranges on `goal_period_closures.period_end`.
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
        scheduledDate: formatCivilDate(a.scheduled_date),
        timeSlot: formatWallTimeRange(a.time_slot_start, a.time_slot_end),
        status: a.status,
        rentalTenant: contact?.snapshot_name ?? '',
        email: contact?.snapshot_email ?? '',
        phone: contact?.snapshot_phone ?? '',
        inspector: a.inspector?.name ?? '',
        confirmationStatus: a.rental_tenant_confirmation_status,
        keyRequired: a.key_required ? 'Yes' : 'No',
        // A raw ISO timestamp ('2026-07-28T04:12:33.123Z') was landing in the sheet.
        createdAt: formatInstantDateTime(a.created_at),
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
          // An inspector's personal email is platform data, not the agency's.
          ...(filters.agencyScoped ? {} : { inspectorEmail: i.email }),
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
      effective_at: this.timestampRange(filters),
    };
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    // An agency never sees the platform↔inspector leg. The type allowlist alone is
    // not enough: an inspector-scoped MANUAL_ADJUSTMENT passes it yet still belongs
    // to that leg, so pair it with `inspector_id IS NULL`.
    if (filters.agencyScoped) {
      where.entry_type = { in: [...AGENCY_VISIBLE_ENTRY_TYPES] };
      where.inspector_id = null;
    }
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
      include: {
        tenant: true,
        inspector: true,
        // The appointment carries the flow type (via service_type) and the
        // active confirmation cycle, both needed for the Confirmation Date cell.
        appointment: {
          include: {
            service_type: { select: { flow_type: true } },
            active_confirmation_cycle: { select: { confirmed_at: true } },
          },
        },
      },
      orderBy: { effective_at: 'asc' },
    });

    // Amounts are 2-decimal money; round at the export boundary so summed
    // floating-point values don't surface artifacts like 90.00000000001.
    const round2 = (n: number) => Math.round(n * 100) / 100;

    if (filters.agencyScoped) {
      return this.buildAgencyFinancialRows(entries, round2);
    }

    let totalRevenue = 0;
    let totalExpense = 0;
    const rows: Record<string, unknown>[] = entries.map((e) => {
      const amount = Number(e.amount);
      // Revenue convention: revenue = debit − refund + agency adjustment. The inspector leg
      // (payout, inspector-scoped adjustment, Q12 goal bonus — the last has a null tenant_id)
      // is an expense. A bonus reversal has a negative amount → a negative expense (a credit back).
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
        case 'INSPECTOR_BONUS':
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
        entryDate: formatInstantDate(e.effective_at),
        agency: e.tenant?.name ?? '',
        entryType: e.entry_type,
        appointmentNumber: e.appointment?.appointment_number ?? '',
        confirmationDate: formatConfirmationDateCell(
          e.appointment?.service_type?.flow_type,
          e.appointment?.active_confirmation_cycle?.confirmed_at,
        ),
        inspector: e.inspector?.name ?? '',
        description: e.description ?? '',
        revenue: revenue !== 0 ? round2(revenue) : '',
        expense: expense !== 0 ? round2(expense) : '',
        currency: e.currency,
      };
    });

    if (rows.length > 0) {
      const blank = { entryDate: '', agency: '', entryType: '', appointmentNumber: '', confirmationDate: '', inspector: '', currency: '' };
      rows.push({ ...blank, description: 'TOTAL', revenue: round2(totalRevenue), expense: round2(totalExpense) });
      rows.push({ ...blank, description: 'NET (revenue − expenses)', revenue: round2(totalRevenue - totalExpense), expense: '' });
    }
    return rows;
  }

  /**
   * Agency variant of the Financial rows. The query has already excluded the
   * platform↔inspector leg, so there is no expense side: revenue collapses to a
   * single signed `amount` (debit positive, refund negative) and the sheet ends at
   * TOTAL — a NET row would merely restate it.
   */
  private buildAgencyFinancialRows(
    entries: {
      effective_at: Date;
      entry_type: string;
      amount: unknown;
      description: string | null;
      currency: string;
      appointment:
        | {
            appointment_number: number;
            service_type: { flow_type: string } | null;
            active_confirmation_cycle: { confirmed_at: Date | null } | null;
          }
        | null;
    }[],
    round2: (n: number) => number,
  ): Record<string, unknown>[] {
    let total = 0;
    const rows: Record<string, unknown>[] = entries.map((e) => {
      const amount = e.entry_type === 'REFUND' ? -Number(e.amount) : Number(e.amount);
      total += amount;
      return {
        entryDate: formatInstantDate(e.effective_at),
        entryType: e.entry_type,
        appointmentNumber: e.appointment?.appointment_number ?? '',
        confirmationDate: formatConfirmationDateCell(
          e.appointment?.service_type?.flow_type,
          e.appointment?.active_confirmation_cycle?.confirmed_at,
        ),
        description: e.description ?? '',
        amount: round2(amount),
        currency: e.currency,
      };
    });

    if (rows.length > 0) {
      rows.push({
        entryDate: '',
        entryType: '',
        appointmentNumber: '',
        confirmationDate: '',
        description: 'TOTAL',
        amount: round2(total),
        currency: '',
      });
    }
    return rows;
  }

  /**
   * Inspector Program report (F08-5, 03.14). Platform-scoped: `tenantId`/`agencyScoped`
   * are ignored (the program has no agency, D12). Ranges on `goal_period_closures.period_end`
   * within the civil-date window. One row per reward (P9 order), one "No achievers" row per
   * empty closure, one "Skipped (goal inactive)" row per SKIPPED_INACTIVE closure. Instants
   * render in the requester timezone (DR5); civil dates in the report's `dd/mm/yyyy`; no
   * agency/coordinate/raw-id cell.
   */
  async getInspectorProgramRows(filters: ReportDataFilters): Promise<Record<string, unknown>[]> {
    const range = this.civilDateRange(filters);
    const tz = filters.timezone ?? PLATFORM_TIMEZONE;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const closures = await this.prisma.goalPeriodClosure.findMany({
      where: { period_end: range },
      include: {
        goal: {
          select: {
            title: true,
            metric: true,
            target: true,
            reward_amount: true,
            next_target: true,
            next_reward_amount: true,
            next_effective_from: true,
          },
        },
      },
      orderBy: [{ period_start: 'asc' }, { goal: { title: 'asc' } }],
    });
    if (closures.length === 0) return [];

    const awards = await this.prisma.rewardAward.findMany({
      where: { period_end: range },
      include: {
        inspector: { select: { name: true, email: true } },
        approved_by: { select: { name: true } },
        financial_entry: { select: { id: true, status: true } },
        inspector_invoice: { select: { invoice_number: true } },
      },
    });

    // Group awards by their closure identity (goal_id + period_start civil date).
    const awardsByClosure = new Map<string, typeof awards>();
    for (const a of awards) {
      const key = `${a.goal_id}|${civilDateKey(a.period_start)}`;
      const bucket = awardsByClosure.get(key);
      if (bucket) bucket.push(a);
      else awardsByClosure.set(key, [a]);
    }

    // Reversal-invoice resolution for void-after-paid rewards: the original bonus entry →
    // its negative reversal (reference_entry_id) → the CLOSED/PAID invoice whose snapshot
    // carries that reversal line (the GIN-indexed `line_items_snapshot` containment filter).
    const reversalInvoiceByOriginalEntryId = new Map<string, string>();
    const originalEntryIds = awards
      .filter((a) => a.status === 'VOID' && a.inspector_invoice_id !== null && a.financial_entry)
      .map((a) => a.financial_entry!.id);
    if (originalEntryIds.length > 0) {
      const reversals = await this.prisma.financialEntry.findMany({
        where: { entry_type: 'INSPECTOR_BONUS', reference_entry_id: { in: originalEntryIds } },
        select: { id: true, reference_entry_id: true },
      });
      await Promise.all(
        reversals.map(async (rev) => {
          if (!rev.reference_entry_id) return;
          const invoice = await this.prisma.inspectorInvoice.findFirst({
            where: {
              status: { in: ['CLOSED', 'PAID'] },
              line_items_snapshot: { array_contains: [{ entryId: rev.id }] },
            },
            select: { invoice_number: true },
          });
          const display = invoice ? formatInvoiceNumber(invoice.invoice_number) : null;
          if (display) reversalInvoiceByOriginalEntryId.set(rev.reference_entry_id, display);
        }),
      );
    }

    const rows: Record<string, unknown>[] = [];

    for (const closure of closures) {
      const goal = closure.goal;
      const periodStartCivil = civilDateKey(closure.period_start);
      const terms = goalTermsForPeriod(
        {
          target: Number(goal.target),
          rewardAmount: Number(goal.reward_amount),
          nextTarget: goal.next_target !== null ? Number(goal.next_target) : null,
          nextRewardAmount: goal.next_reward_amount !== null ? Number(goal.next_reward_amount) : null,
          nextEffectiveFrom: goal.next_effective_from ? civilDateKey(goal.next_effective_from) : null,
        },
        periodStartCivil,
      );
      const base = {
        periodType: closure.period_type,
        periodStart: formatCivilDate(closure.period_start),
        periodEnd: formatCivilDate(closure.period_end),
        goal: goal.title,
        goalDescription: describeGoal({ metric: goal.metric as GoalMetric, target: terms.target, scopeLabel: closure.scope_label }),
        metric: goal.metric,
        target: terms.target,
        scope: closure.scope_label ?? '',
        participants: closure.participants_count,
        achievers: closure.achievers_count,
        promised: round2(Number(closure.promised_amount)),
      };

      if (closure.trigger === 'SKIPPED_INACTIVE') {
        rows.push(inspectorProgramRow({ ...base, status: 'Skipped (goal inactive)' }));
        continue;
      }

      const closureAwards = awardsByClosure.get(`${closure.goal_id}|${periodStartCivil}`) ?? [];
      if (closureAwards.length === 0) {
        rows.push(inspectorProgramRow({ ...base, perWinner: round2(terms.rewardAmount), status: 'No achievers' }));
        continue;
      }

      const ranked = [...closureAwards].sort((a, b) =>
        compareAwardsForRanking(
          {
            comparator: a.comparator,
            achievedValue: Number(a.achieved_value),
            indexScoreAtClose: a.index_score_at_close !== null ? Number(a.index_score_at_close) : null,
            achievedOn: civilDateKey(a.achieved_on),
            inspectorId: a.inspector_id,
          },
          {
            comparator: b.comparator,
            achievedValue: Number(b.achieved_value),
            indexScoreAtClose: b.index_score_at_close !== null ? Number(b.index_score_at_close) : null,
            achievedOn: civilDateKey(b.achieved_on),
            inspectorId: b.inspector_id,
          },
        ),
      );

      for (const a of ranked) {
        const voidedAfterInvoicing = a.status === 'VOID' && a.inspector_invoice_id !== null;
        rows.push(
          inspectorProgramRow({
            ...base,
            // Award rows use the immutable snapshot (goal may have been renamed/retermed since close).
            goal: a.goal_title,
            goalDescription: describeGoal({ metric: a.metric as GoalMetric, target: Number(a.target), scopeLabel: a.scope_label }),
            metric: a.metric,
            target: Number(a.target),
            scope: a.scope_label ?? '',
            perWinner: round2(Number(a.amount)),
            inspector: a.inspector.name ?? '',
            inspectorEmail: a.inspector.email ?? '',
            result: Number(a.achieved_value),
            jobsInPeriod: a.service_count,
            achievedOn: formatCivilDate(a.achieved_on),
            indexAtClose: a.index_score_at_close !== null ? Number(a.index_score_at_close) : '',
            levelAtClose: a.level_at_close ?? '',
            status: REWARD_AWARD_STATUS_LABELS[a.status as RewardAwardStatus],
            amount: round2(Number(a.amount)),
            approvedBy: a.approved_by?.name ?? '',
            approvedAt: formatInstantDateTime(a.approved_at, tz),
            ledgerStatus: a.financial_entry ? humaniseEntryStatus(a.financial_entry.status) : '',
            invoice: a.inspector_invoice ? formatInvoiceNumber(a.inspector_invoice.invoice_number) : '',
            paidAt: formatInstantDateTime(a.paid_at, tz),
            voidedAt: formatInstantDateTime(a.voided_at, tz),
            voidReason: a.void_reason ?? '',
            inspectorNote: a.inspector_note ?? '',
            voidedAfterInvoicing: voidedAfterInvoicing ? 'Yes' : 'No',
            reversalInvoice:
              voidedAfterInvoicing && a.financial_entry
                ? reversalInvoiceByOriginalEntryId.get(a.financial_entry.id) ?? ''
                : '',
          }),
        );
      }
    }

    return rows;
  }

  /**
   * Inclusive [fromDate 00:00, toDate+1 00:00) UTC range — ONLY for @db.Date civil-date
   * columns (scheduled_date), which are pinned to UTC midnight.
   */
  private civilDateRange(filters: ReportDataFilters): { gte: Date; lt: Date } {
    const gte = new Date(`${filters.fromDate}T00:00:00.000Z`);
    const lt = new Date(`${filters.toDate}T00:00:00.000Z`);
    lt.setUTCDate(lt.getUTCDate() + 1);
    return { gte, lt };
  }

  /**
   * Inclusive [fromDate 00:00, toDate+1 00:00) instant range in the report's
   * timezone — for real timestamp columns (created_at, done_checked_at,
   * effective_at). The requester's day boundaries keep evening events on
   * their calendar day; defaults to the platform timezone.
   */
  private timestampRange(filters: ReportDataFilters): { gte: Date; lt: Date } {
    const tz = filters.timezone ?? PLATFORM_TIMEZONE;
    return {
      gte: parseDateInTimezone(filters.fromDate, tz),
      lt: parseDateInTimezone(nextCivilDay(filters.toDate), tz),
    };
  }

  private buildAppointmentWhere(
    filters: ReportDataFilters,
    opts: { applyStatus: boolean },
  ): Prisma.AppointmentWhereInput {
    const where: Prisma.AppointmentWhereInput = { deleted_at: null };

    // Axis selects the real domain column the Period ranges on. Timestamp axes use
    // Sydney day boundaries; the scheduled axis filters the @db.Date column directly.
    switch (filters.dateAxis) {
      case 'CREATED':
        where.created_at = this.timestampRange(filters);
        break;
      case 'COMPLETED':
        where.done_checked_at = this.timestampRange(filters); // nullable → excludes not-yet-completed rows
        break;
      case 'SCHEDULED':
      default:
        where.scheduled_date = this.civilDateRange(filters);
        break;
    }

    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.branchId) where.branch_id = filters.branchId;
    if (filters.suburb) where.property = { suburb: { contains: filters.suburb, mode: 'insensitive' } };
    if (opts.applyStatus && filters.status) where.status = filters.status as AppointmentStatus;

    return where;
  }
}
