import type { PrismaClient } from '@prisma/client';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import { FinancialEntryEntity } from '../domain/financial-entry.entity';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
  FinancialEntryPagination,
  FinancialEntrySummary,
  FinancialEntryEnriched,
} from '../domain/financial-entry.repository';
import { InvalidEntryStatusTransitionError } from '../domain/billing.errors';

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

  if (filters.tenantId) where.tenant_id = filters.tenantId;
  if (filters.appointmentId) where.appointment_id = filters.appointmentId;
  if (filters.inspectorId) where.inspector_id = filters.inspectorId;
  if (filters.entryType) where.entry_type = filters.entryType;
  else if (filters.entryTypeIn) where.entry_type = { in: filters.entryTypeIn };
  if (filters.status) where.status = filters.status;

  if (filters.fromDate || filters.toDate) {
    const effectiveAt: Record<string, Date> = {};
    if (filters.fromDate) effectiveAt.gte = new Date(filters.fromDate);
    if (filters.toDate) effectiveAt.lte = new Date(filters.toDate + 'T23:59:59.999Z');
    where.effective_at = effectiveAt;
  }

  return where;
}

export class PrismaFinancialEntryRepository implements IFinancialEntryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(tenantId?: string, dateRange?: { effectiveFrom?: string; effectiveTo?: string }): Promise<FinancialEntrySummary> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenant_id = tenantId;

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
      }
    }

    return summary;
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
        entry_type: 'INSPECTOR_PAYOUT',
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
        entry_type: 'INSPECTOR_PAYOUT',
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
        entry_type: { in: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'] },
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
}
