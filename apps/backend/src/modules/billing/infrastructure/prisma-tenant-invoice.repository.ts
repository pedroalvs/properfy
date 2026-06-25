import type { PrismaClient } from '@prisma/client';
import type { TenantInvoiceStatus } from '@properfy/shared';
import { TenantInvoiceEntity } from '../domain/tenant-invoice.entity';
import type {
  ITenantInvoiceRepository,
  TenantInvoiceFilters,
  TenantInvoicePagination,
} from '../domain/tenant-invoice.repository';

function mapToEntity(row: any): TenantInvoiceEntity {
  return new TenantInvoiceEntity({
    id: row.id,
    tenantId: row.tenant_id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    totalDebit: Number(row.total_debit),
    totalRefund: Number(row.total_refund),
    totalAdjustment: Number(row.total_adjustment),
    netAmount: Number(row.net_amount),
    currency: row.currency,
    status: row.status as TenantInvoiceStatus,
    fileKey: row.file_key,
    previousInvoiceId: row.previous_invoice_id,
    generatedByUserId: row.generated_by_user_id,
    generatedAt: row.generated_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function buildWhereClause(filters: TenantInvoiceFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.tenantId) where.tenant_id = filters.tenantId;
  if (filters.status) where.status = filters.status;

  if (filters.fromDate || filters.toDate) {
    const periodFrom: Record<string, Date> = {};
    if (filters.fromDate) periodFrom.gte = new Date(filters.fromDate);
    if (filters.toDate) periodFrom.lte = new Date(filters.toDate + 'T23:59:59.999Z');
    where.period_from = periodFrom;
  }

  return where;
}

export class PrismaTenantInvoiceRepository implements ITenantInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TenantInvoiceEntity | null> {
    const row = await this.prisma.tenantInvoice.findUnique({ where: { id } });
    return row ? mapToEntity(row) : null;
  }

  async findByTenantAndPeriod(
    tenantId: string,
    periodFrom: Date,
    periodTo: Date,
  ): Promise<TenantInvoiceEntity | null> {
    const row = await this.prisma.tenantInvoice.findFirst({
      where: {
        tenant_id: tenantId,
        period_from: periodFrom,
        period_to: periodTo,
        status: { not: 'SUPERSEDED' },
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findOverlapping(
    tenantId: string,
    periodFrom: Date,
    periodTo: Date,
  ): Promise<TenantInvoiceEntity | null> {
    const row = await this.prisma.tenantInvoice.findFirst({
      where: {
        tenant_id: tenantId,
        period_from: { lte: periodTo },
        period_to: { gte: periodFrom },
        status: { in: ['OPEN', 'CLOSED'] },
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: TenantInvoiceFilters,
    pagination: TenantInvoicePagination,
  ): Promise<TenantInvoiceEntity[]> {
    const where = buildWhereClause(filters);

    const rows = await this.prisma.tenantInvoice.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { period_from: 'desc' },
    });

    return rows.map(mapToEntity);
  }

  async count(filters: TenantInvoiceFilters): Promise<number> {
    const where = buildWhereClause(filters);
    return this.prisma.tenantInvoice.count({ where });
  }

  async save(invoice: TenantInvoiceEntity): Promise<void> {
    await this.prisma.tenantInvoice.create({
      data: {
        id: invoice.id,
        tenant_id: invoice.tenantId,
        period_from: invoice.periodFrom,
        period_to: invoice.periodTo,
        total_debit: invoice.totalDebit,
        total_refund: invoice.totalRefund,
        total_adjustment: invoice.totalAdjustment,
        net_amount: invoice.netAmount,
        currency: invoice.currency,
        status: invoice.status,
        file_key: invoice.fileKey,
        previous_invoice_id: invoice.previousInvoiceId,
        generated_by_user_id: invoice.generatedByUserId,
        generated_at: invoice.generatedAt,
        notes: invoice.notes,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{ status: string; fileKey: string; generatedAt: Date; notes: string }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.fileKey !== undefined) updateData.file_key = data.fileKey;
    if (data.generatedAt !== undefined) updateData.generated_at = data.generatedAt;
    if (data.notes !== undefined) updateData.notes = data.notes;
    await this.prisma.tenantInvoice.update({ where: { id }, data: updateData });
  }
}
