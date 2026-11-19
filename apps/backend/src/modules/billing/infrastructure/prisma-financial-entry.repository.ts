import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import { type FinancialEntryType, type FinancialEntryStatus, type InvoiceSnapshotLine, AGENCY_VISIBLE_ENTRY_TYPES } from '@properfy/shared';
import { FinancialEntryEntity } from '../domain/financial-entry.entity';
import { AppointmentCodeFormatter } from '../../appointment/domain/appointment-code.formatter';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
  FinancialEntryPagination,
  FinancialEntrySummary,
  FinancialEntryEnriched,
  InspectorEarningsSummary,
} from '../domain/financial-entry.repository';
import type {
  IBonusEntryWriter,
  CreateApprovedBonusInput,
  CreateBonusReversalInput,
  VoidBonusInput,
} from '../../inspector-program/domain/bonus-entry-writer.port';
import {
  InvalidEntryStatusTransitionError,
  BonusReversalAlreadyExistsError,
  EntryNotFoundError,
} from '../domain/billing.errors';
import { formatMonthKey } from '../domain/month-key';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../shared/domain/timezone-date';

/** The inspector leg of the ledger: payouts and goal bonuses ride the same invoice. */
const INSPECTOR_INVOICE_ENTRY_TYPES: FinancialEntryType[] = ['INSPECTOR_PAYOUT', 'INSPECTOR_BONUS'];

function mapToEntity(row: any): FinancialEntryEntity {
  return new FinancialEntryEntity({
    id: row.id,
    tenantId: row.tenant_id,
    appointmentId: row.appointment_id,
    inspectorId: row.inspector_id,
    entryType: row.entry_type as FinancialEntryType,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as FinancialEntryStatus,
    description: row.description,
    effectiveAt: row.effective_at,
    initiatedByUserId: row.initiated_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    referenceEntryId: row.reference_entry_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const SORT_FIELD_MAP: Record<string, string> = {
  effectiveAt: 'effective_at',
  amount: 'amount',
  createdAt: 'created_at',
};

function buildWhereClause(filters: FinancialEntryFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.includePlatformBonus && filters.tenantId) {
    // Q12 (F08-6/DQ10): the tenant's entries OR the platform bonus (tenantless). Other
    // conditions below sit at the top level and AND with both OR branches.
    where.OR = [
      { tenant_id: filters.tenantId },
      { tenant_id: null, entry_type: 'INSPECTOR_BONUS' },
    ];
  } else if (filters.tenantId) {
    where.tenant_id = filters.tenantId;
  }
  if (filters.appointmentId) where.appointment_id = filters.appointmentId;
  if (filters.inspectorId) where.inspector_id = filters.inspectorId;
  if (filters.entryType) where.entry_type = filters.entryType;
  else if (filters.entryTypeIn) where.entry_type = { in: filters.entryTypeIn };
  // Set after inspectorId so an agency read can never be widened by an
  // inspectorId filter — agencies do not get to query the inspector leg.
  if (filters.excludeInspectorScoped) where.inspector_id = null;
  if (filters.status) where.status = filters.status;

  if (filters.fromDate || filters.toDate) {
    const effectiveAt: Record<string, Date> = {};
    if (filters.fromDate) effectiveAt.gte = new Date(filters.fromDate);
    if (filters.toDate) effectiveAt.lte = new Date(filters.toDate + 'T23:59:59.999Z');
    where.effective_at = effectiveAt;
  }

  return where;
}

export class PrismaFinancialEntryRepository implements IFinancialEntryRepository, IBonusEntryWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(
    tenantId?: string,
    dateRange?: { effectiveFrom?: string; effectiveTo?: string },
    options?: { agencyScoped?: boolean },
  ): Promise<FinancialEntrySummary> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenant_id = tenantId;
    // Applied to `where` (not just the approved branch) so BOTH the groupBy
    // aggregates and the PENDING count exclude the platform↔inspector leg.
    if (options?.agencyScoped) {
      where.entry_type = { in: [...AGENCY_VISIBLE_ENTRY_TYPES] };
      where.inspector_id = null;
    }

    if (dateRange?.effectiveFrom || dateRange?.effectiveTo) {
      const effectiveAt: Record<string, Date> = {};
      if (dateRange.effectiveFrom) effectiveAt.gte = new Date(dateRange.effectiveFrom);
      if (dateRange.effectiveTo) effectiveAt.lte = new Date(dateRange.effectiveTo + 'T23:59:59.999Z');
      where.effective_at = effectiveAt;
    }

    const approvedWhere = { ...where, status: 'APPROVED' as FinancialEntryStatus };

    const [grouped, pendingCount] = await Promise.all([
      this.prisma.financialEntry.groupBy({
        by: ['entry_type'],
        where: approvedWhere,
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.count({ where: { ...where, status: 'PENDING' } }),
    ]);

    const summary: FinancialEntrySummary = {
      totalDebits: 0,
      totalPayouts: 0,
      totalAdjustments: 0,
      totalRefunds: 0,
      totalBonuses: 0,
      pendingCount,
      currency: null,
    };

    for (const row of grouped) {
      const amount = Number(row._sum?.amount ?? 0);
      switch (row.entry_type) {
        case 'TENANT_DEBIT': summary.totalDebits = amount; break;
        case 'INSPECTOR_PAYOUT': summary.totalPayouts = amount; break;
        case 'MANUAL_ADJUSTMENT': summary.totalAdjustments = amount; break;
        case 'REFUND': summary.totalRefunds = amount; break;
        // Q12 (F08-6): the goal bonus leg, kept separate from payouts. Never reached
        // under `agencyScoped` (the allowlist WHERE excludes INSPECTOR_BONUS).
        case 'INSPECTOR_BONUS': summary.totalBonuses = amount; break;
      }
    }

    return summary;
  }

  async getInspectorEarningsSummary(inspectorId: string, monthlyFrom: Date): Promise<InspectorEarningsSummary> {
    // Q12 (F08-6): the inspector's own earnings include goal bonuses alongside payouts.
    const payoutWhere = { inspector_id: inspectorId, entry_type: { in: INSPECTOR_INVOICE_ENTRY_TYPES } };

    const [byStatus, latest, windowRows] = await Promise.all([
      this.prisma.financialEntry.groupBy({
        by: ['status'],
        where: payoutWhere,
        _sum: { amount: true },
      }),
      this.prisma.financialEntry.findFirst({
        where: payoutWhere,
        orderBy: { effective_at: 'desc' },
        select: { currency: true },
      }),
      this.prisma.financialEntry.findMany({
        where: { ...payoutWhere, status: 'APPROVED' as FinancialEntryStatus, effective_at: { gte: monthlyFrom } },
        select: { effective_at: true, amount: true },
      }),
    ]);

    let totalApproved = 0;
    let nextPayment = 0;
    for (const row of byStatus) {
      const amount = Number(row._sum?.amount ?? 0);
      if (row.status === 'APPROVED') totalApproved = amount;
      if (row.status === 'PENDING') nextPayment = amount;
    }

    const buckets = new Map<string, number>();
    for (const row of windowRows) {
      const key = formatMonthKey(row.effective_at);
      buckets.set(key, (buckets.get(key) ?? 0) + Number(row.amount));
    }
    const monthly = [...buckets.entries()]
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return { totalApproved, nextPayment, currency: latest?.currency ?? null, monthly };
  }

  async findById(id: string, tenantId?: string): Promise<FinancialEntryEntity | null> {
    const where: Record<string, unknown> = { id };
    if (tenantId) where.tenant_id = tenantId;
    const row = await this.prisma.financialEntry.findFirst({ where });
    return row ? mapToEntity(row) : null;
  }

  async findByIdEnriched(id: string, tenantId?: string): Promise<FinancialEntryEnriched | null> {
    const where: Record<string, unknown> = { id };
    if (tenantId) where.tenant_id = tenantId;
    const row = await this.prisma.financialEntry.findFirst({
      where,
      include: {
        appointment: { select: { id: true, property: { select: { property_code: true } } } },
        inspector: { select: { name: true } },
        tenant: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });
    if (!row) return null;
    const entity = mapToEntity(row);
    return {
      entity,
      appointmentCode: (row as any).appointment?.property?.property_code ?? null,
      relatedEntityName: (row as any).inspector?.name ?? (row as any).tenant?.name ?? null,
      approvedByName: (row as any).approvedBy?.name ?? null,
    };
  }

  async findByAppointmentAndType(
    appointmentId: string,
    entryType: FinancialEntryType,
  ): Promise<FinancialEntryEntity | null> {
    const row = await this.prisma.financialEntry.findFirst({
      where: { appointment_id: appointmentId, entry_type: entryType },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByReferenceEntryIdAndType(
    referenceEntryId: string,
    entryType: FinancialEntryType,
  ): Promise<FinancialEntryEntity | null> {
    const row = await this.prisma.financialEntry.findFirst({
      where: { reference_entry_id: referenceEntryId, entry_type: entryType },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: FinancialEntryFilters,
    pagination: FinancialEntryPagination,
  ): Promise<FinancialEntryEntity[]> {
    const where = buildWhereClause(filters);
    const sortField = SORT_FIELD_MAP[pagination.sortBy] ?? 'effective_at';

    const rows = await this.prisma.financialEntry.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { [sortField]: pagination.sortOrder },
    });

    return rows.map(mapToEntity);
  }

  async findAllEnriched(
    filters: FinancialEntryFilters,
    pagination: FinancialEntryPagination,
  ): Promise<FinancialEntryEnriched[]> {
    const where = buildWhereClause(filters);
    const sortField = SORT_FIELD_MAP[pagination.sortBy] ?? 'effective_at';

    const rows = await this.prisma.financialEntry.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { [sortField]: pagination.sortOrder },
      include: {
        appointment: { select: { id: true, property: { select: { property_code: true } } } },
        inspector: { select: { name: true } },
        tenant: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });

    return rows.map((row) => {
      const entity = mapToEntity(row);
      const relatedEntityName = (row as any).inspector?.name ?? (row as any).tenant?.name ?? null;
      return {
        entity,
        appointmentCode: (row as any).appointment?.property?.property_code ?? null,
        relatedEntityName,
        approvedByName: (row as any).approvedBy?.name ?? null,
      };
    });
  }

  async count(filters: FinancialEntryFilters): Promise<number> {
    const where = buildWhereClause(filters);
    return this.prisma.financialEntry.count({ where });
  }

  async save(entry: FinancialEntryEntity): Promise<void> {
    await this.prisma.financialEntry.create({
      data: {
        id: entry.id,
        tenant_id: entry.tenantId,
        appointment_id: entry.appointmentId,
        inspector_id: entry.inspectorId,
        entry_type: entry.entryType,
        amount: entry.amount,
        currency: entry.currency,
        status: entry.status,
        description: entry.description,
        effective_at: entry.effectiveAt,
        initiated_by_user_id: entry.initiatedByUserId,
        approved_by_user_id: entry.approvedByUserId,
        approved_at: entry.approvedAt,
        reference_entry_id: entry.referenceEntryId,
        reason: entry.reason,
      },
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: FinancialEntryStatus,
    approvedByUserId?: string,
    approvedAt?: Date,
  ): Promise<void> {
    await this.prisma.financialEntry.updateMany({
      where: { id, tenant_id: tenantId },
      data: {
        status,
        approved_by_user_id: approvedByUserId,
        approved_at: approvedAt,
      },
    });
  }

  async updateManualAdjustmentFields(
    id: string,
    tenantId: string,
    editorUserId: string,
    fields: { amount?: number; description?: string; effectiveAt?: Date; reason?: string },
  ): Promise<number> {
    // The editor becomes the recorded author of the economic content so the
    // self-approval guard blocks them from also approving it (maker≠checker).
    const data: Record<string, unknown> = { initiated_by_user_id: editorUserId };
    if (fields.amount !== undefined) data.amount = fields.amount;
    if (fields.description !== undefined) data.description = fields.description;
    if (fields.effectiveAt !== undefined) data.effective_at = fields.effectiveAt;
    if (fields.reason !== undefined) data.reason = fields.reason;

    // Status + type guard in the WHERE: a concurrent approve/void that flipped the
    // row out of (PENDING, MANUAL_ADJUSTMENT) makes this match zero rows, so the
    // edit is dropped atomically rather than overwriting a frozen ledger entry.
    const updated = await this.prisma.financialEntry.updateMany({
      where: { id, tenant_id: tenantId, status: 'PENDING', entry_type: 'MANUAL_ADJUSTMENT' },
      data,
    });
    return updated.count;
  }

  async approvePendingEntry(
    id: string,
    tenantId: string,
    approverUserId: string,
    approvedAt: Date,
  ): Promise<number> {
    // The maker≠checker predicate lives in the WHERE so the self-approval check is
    // atomic with the commit. A concurrent edit that re-bound initiated_by_user_id
    // to the approver (keeping status=PENDING) makes this match zero rows instead
    // of approving the approver's own content.
    //
    // The OR(null) branch is load-bearing: `NULL <> approver` is NULL (not TRUE) in
    // SQL, so `{ not: approverUserId }` alone would silently exclude system-minted
    // (null-initiator) entries, which are always approvable.
    const updated = await this.prisma.financialEntry.updateMany({
      where: {
        id,
        tenant_id: tenantId,
        status: 'PENDING',
        OR: [{ initiated_by_user_id: null }, { initiated_by_user_id: { not: approverUserId } }],
      },
      data: {
        status: 'APPROVED',
        approved_by_user_id: approverUserId,
        approved_at: approvedAt,
      },
    });
    return updated.count;
  }

  async transitionStatus(
    id: string,
    tenantId: string,
    fromStatus: FinancialEntryStatus,
    toStatus: FinancialEntryStatus,
    approvedByUserId?: string,
    approvedAt?: Date,
  ): Promise<void> {
    const allowedTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['VOIDED'],
    };

    const allowed = allowedTransitions[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      throw new InvalidEntryStatusTransitionError(fromStatus, toStatus);
    }

    const updated = await this.prisma.financialEntry.updateMany({
      where: { id, tenant_id: tenantId, status: fromStatus },
      data: {
        status: toStatus,
        approved_by_user_id: approvedByUserId,
        approved_at: approvedAt,
      },
    });

    if (updated.count === 0) {
      throw new InvalidEntryStatusTransitionError(fromStatus, toStatus);
    }
  }

  async sumApprovedPayoutsForInspectorInPeriod(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const result = await this.prisma.financialEntry.aggregate({
      where: {
        inspector_id: inspectorId,
        entry_type: { in: INSPECTOR_INVOICE_ENTRY_TYPES },
        status: 'APPROVED',
        effective_at: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
    });
    return Number(result._sum.amount) || 0;
  }

  async aggregateApprovedPayoutsForInspectorInPeriod(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalAmount: number; count: number; currencies: string[] }> {
    const rows = await this.prisma.financialEntry.groupBy({
      by: ['currency'],
      where: {
        inspector_id: inspectorId,
        entry_type: { in: INSPECTOR_INVOICE_ENTRY_TYPES },
        status: 'APPROVED',
        effective_at: { gte: periodStart, lte: periodEnd },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    let totalAmount = 0;
    let count = 0;
    const currencies: string[] = [];
    for (const row of rows) {
      totalAmount += Number(row._sum.amount ?? 0);
      count += row._count._all;
      currencies.push(row.currency);
    }
    return { totalAmount, count, currencies };
  }

  async findApprovedPayoutLinesForSnapshot(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ lines: InvoiceSnapshotLine[]; currencies: string[] }> {
    const [payoutRows, bonusRows] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where: {
          inspector_id: inspectorId,
          entry_type: 'INSPECTOR_PAYOUT',
          status: 'APPROVED',
          effective_at: { gte: periodStart, lte: periodEnd },
          appointment_id: { not: null },
        },
        orderBy: { effective_at: 'asc' },
        select: {
          amount: true,
          currency: true,
          effective_at: true,
          appointment: {
            select: {
              id: true,
              appointment_number: true,
              branch_id: true,
              property: { select: { street: true, suburb: true, state: true, postcode: true } },
              branch: { select: { name: true } },
              service_type: { select: { name: true } },
              tenant: { select: { id: true, name: true, appointment_code_prefix: true } },
            },
          },
        },
      }),
      // Q12 (F08-6): the bonus leg — no appointment. The display description is frozen
      // on the entry at approval; a reversal carries the original reward's id through
      // reference_entry_id. A second, separate query keeps the payout query untouched.
      this.prisma.financialEntry.findMany({
        where: {
          inspector_id: inspectorId,
          entry_type: 'INSPECTOR_BONUS',
          status: 'APPROVED',
          effective_at: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { effective_at: 'asc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          effective_at: true,
          description: true,
          reward_award_id: true,
          referenceEntry: { select: { reward_award_id: true } },
        },
      }),
    ]);

    const withAppointment = payoutRows.filter((row) => row.appointment !== null);
    // Tag each line with its instant so the two legs interleave by effective_at in the
    // persisted snapshot (serviceDate stays canonical YYYY-MM-DD; display is at the edge).
    const tagged: { effectiveAt: Date; line: InvoiceSnapshotLine }[] = [];

    for (const row of withAppointment) {
      const appt = row.appointment!;
      const p = appt.property;
      tagged.push({
        effectiveAt: row.effective_at,
        line: {
          kind: 'SERVICE',
          serviceDate: civilDateInTimezone(row.effective_at, PLATFORM_TIMEZONE),
          appointmentId: appt.id,
          appointmentCode: AppointmentCodeFormatter.formatParts(appt.appointment_number, appt.tenant?.appointment_code_prefix ?? null),
          propertyAddress: p ? `${p.street}, ${p.suburb} ${p.state} ${p.postcode}` : null,
          serviceType: appt.service_type?.name ?? null,
          amount: Number(row.amount),
          agencyId: appt.tenant?.id ?? null,
          agencyName: appt.tenant?.name ?? null,
          branchId: appt.branch_id ?? null,
          branchName: appt.branch?.name ?? null,
        },
      });
    }

    for (const row of bonusRows) {
      tagged.push({
        effectiveAt: row.effective_at,
        line: {
          kind: 'BONUS',
          serviceDate: civilDateInTimezone(row.effective_at, PLATFORM_TIMEZONE),
          appointmentId: null,
          appointmentCode: null,
          propertyAddress: null,
          serviceType: null,
          amount: Number(row.amount),
          agencyId: null,
          agencyName: null,
          branchId: null,
          branchName: null,
          entryId: row.id,
          rewardAwardId: row.reward_award_id ?? row.referenceEntry?.reward_award_id ?? null,
          description: row.description,
        },
      });
    }

    tagged.sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
    const lines = tagged.map((t) => t.line);
    const currencies = [...new Set([...withAppointment, ...bonusRows].map((row) => row.currency))];
    return { lines, currencies };
  }

  async sumRefundsByReferenceEntryId(referenceEntryId: string): Promise<number> {
    const result = await this.prisma.financialEntry.aggregate({
      where: {
        reference_entry_id: referenceEntryId,
        entry_type: 'REFUND',
        status: { not: 'CANCELLED' },
      },
      _sum: { amount: true },
    });
    return Number(result._sum.amount) || 0;
  }

  async sumApprovedEntriesForTenantInPeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalDebit: number; totalRefund: number; totalAdjustment: number }> {
    const grouped = await this.prisma.financialEntry.groupBy({
      by: ['entry_type'],
      where: {
        tenant_id: tenantId,
        status: 'APPROVED',
        effective_at: { gte: periodStart, lte: periodEnd },
        // Agency-facing aggregation: same allowlist + inspector-leg exclusion as
        // every other agency read. Currently uncalled, but it reads as a
        // ready-made agency total, so it must not ship the summary bug in wait.
        entry_type: { in: [...AGENCY_VISIBLE_ENTRY_TYPES] },
        inspector_id: null,
      },
      _sum: { amount: true },
    });

    let totalDebit = 0;
    let totalRefund = 0;
    let totalAdjustment = 0;

    for (const row of grouped) {
      const amount = Number(row._sum?.amount ?? 0);
      switch (row.entry_type) {
        case 'TENANT_DEBIT': totalDebit = amount; break;
        case 'REFUND': totalRefund = amount; break;
        case 'MANUAL_ADJUSTMENT': totalAdjustment = amount; break;
      }
    }

    return { totalDebit, totalRefund, totalAdjustment };
  }

  async voidEntry(
    id: string,
    tenantId: string,
    voidedByUserId: string,
    voidedAt: Date,
    voidReason: string,
  ): Promise<void> {
    const updated = await this.prisma.financialEntry.updateMany({
      where: { id, tenant_id: tenantId, status: 'APPROVED' },
      data: {
        status: 'VOIDED',
        voided_by_user_id: voidedByUserId,
        voided_at: voidedAt,
        void_reason: voidReason,
      },
    });

    if (updated.count === 0) {
      throw new InvalidEntryStatusTransitionError('APPROVED', 'VOIDED');
    }
  }

  // ─── IBonusEntryWriter (Q12 — F08-6) ─────────────────────────────────────
  // Implemented here so the inspector-program module never imports the financial
  // repository. All methods run inside the reward transaction (atomic with the CAS).

  async createApprovedBonus(tx: Prisma.TransactionClient, input: CreateApprovedBonusInput): Promise<string> {
    const id = randomUUID();
    await tx.financialEntry.create({
      data: {
        id,
        tenant_id: null, // platform↔inspector leg (CHECK enforces NULL for this type)
        appointment_id: null,
        inspector_id: input.inspectorId,
        entry_type: 'INSPECTOR_BONUS',
        amount: input.amount,
        currency: input.currency,
        status: 'APPROVED',
        description: input.description,
        effective_at: input.effectiveAt,
        initiated_by_user_id: null, // system-minted (never the literal 'SYSTEM' — PR #1229)
        approved_by_user_id: input.approvedByUserId,
        approved_at: input.approvedAt,
        reference_entry_id: null,
        reward_award_id: input.rewardAwardId,
      },
    });
    return id;
  }

  async voidBonusForReward(tx: Prisma.TransactionClient, input: VoidBonusInput): Promise<void> {
    // No-op when the reward never had an entry (e.g. a PENDING reward voided before approval).
    await tx.financialEntry.updateMany({
      where: { reward_award_id: input.rewardAwardId, entry_type: 'INSPECTOR_BONUS', status: 'APPROVED' },
      data: {
        status: 'VOIDED',
        voided_by_user_id: input.voidedByUserId,
        voided_at: input.voidedAt,
        void_reason: input.voidReason,
      },
    });
  }

  async createReversalForReward(tx: Prisma.TransactionClient, input: CreateBonusReversalInput): Promise<void> {
    const original = await tx.financialEntry.findFirst({
      where: { reward_award_id: input.rewardAwardId, entry_type: 'INSPECTOR_BONUS' },
      select: { id: true, amount: true, inspector_id: true, currency: true },
    });
    if (!original) throw new EntryNotFoundError();

    try {
      await tx.financialEntry.create({
        data: {
          id: randomUUID(),
          tenant_id: null,
          appointment_id: null,
          inspector_id: original.inspector_id,
          entry_type: 'INSPECTOR_BONUS',
          amount: -Number(original.amount), // negative reversal (shape CHECK requires amount < 0)
          currency: original.currency,
          status: 'APPROVED',
          description: input.description,
          effective_at: input.effectiveAt,
          initiated_by_user_id: null,
          approved_by_user_id: input.approvedByUserId,
          approved_at: input.effectiveAt,
          reference_entry_id: original.id, // links the reversal to the original (no reward_award_id)
          reward_award_id: null,
        },
      });
    } catch (error) {
      // The partial unique index `financial_entries_bonus_reversal_unique` is hand-written
      // (Prisma cannot model a partial index), so a duplicate surfaces as a raw 23505 rather
      // than P2002 (memory project_pricing_catalog_spec_execution). Map it to a 409.
      if (isBonusReversalUniqueViolation(error)) throw new BonusReversalAlreadyExistsError();
      throw error;
    }
  }
}

/** True when the error is the partial unique violation on the bonus reversal index. */
function isBonusReversalUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; message?: string; meta?: { target?: unknown } };
  if (e.code === 'P2002') return true; // Prisma-mapped (if it ever knows the index)
  const haystack = `${e.code ?? ''} ${e.message ?? ''} ${JSON.stringify(e.meta ?? {})}`;
  return haystack.includes('23505') || haystack.includes('financial_entries_bonus_reversal_unique');
}
