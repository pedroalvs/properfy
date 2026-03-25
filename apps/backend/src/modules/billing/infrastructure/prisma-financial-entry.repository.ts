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

  async getSummary(tenantId?: string): Promise<FinancialEntrySummary> {
    const where: Record<string, unknown> = {};
    if (tenantId) where.tenant_id = tenantId;

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
}
