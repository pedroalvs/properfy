import type { PrismaClient } from '@prisma/client';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import { FinancialEntryEntity } from '../domain/financial-entry.entity';
import type {
  IFinancialEntryRepository,
  FinancialEntryFilters,
  FinancialEntryPagination,
} from '../domain/financial-entry.repository';

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

  async findById(id: string): Promise<FinancialEntryEntity | null> {
    const row = await this.prisma.financialEntry.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
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
    status: FinancialEntryStatus,
    approvedByUserId?: string,
    approvedAt?: Date,
  ): Promise<void> {
    await this.prisma.financialEntry.update({
      where: { id },
      data: {
        status,
        approved_by_user_id: approvedByUserId,
        approved_at: approvedAt,
      },
    });
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
