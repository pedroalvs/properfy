import { Prisma, type PrismaClient } from '@prisma/client';
import type { InspectorInvoiceStatus, BillingPeriodType, InvoiceSnapshotLine } from '@properfy/shared';
import { InspectorInvoiceEntity } from '../domain/inspector-invoice.entity';
import type {
  IInspectorInvoiceRepository,
  InvoiceFilters,
  InvoicePagination,
  InvoiceUpdateData,
  ReconciliationAggregateFilters,
  ReconciliationAggregateRow,
} from '../domain/inspector-invoice.repository';

/** Serialize a snapshot for a nullable Json column (DbNull → SQL NULL). */
function toSnapshotJson(
  snapshot: InvoiceSnapshotLine[] | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return snapshot === null ? Prisma.DbNull : (snapshot as unknown as Prisma.InputJsonValue);
}

function mapToEntity(row: any): InspectorInvoiceEntity {
  return new InspectorInvoiceEntity({
    id: row.id,
    invoiceNumber: row.invoice_number ?? null,
    inspectorId: row.inspector_id,
    // Prefer the frozen snapshot name; fall back to the live inspector join for pre-approval reads.
    inspectorName: row.inspector_name ?? row.inspector?.name ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    periodType: row.period_type as BillingPeriodType,
    status: row.status as InspectorInvoiceStatus,
    totalAmount: Number(row.total_amount),
    currency: row.currency,
    lineItemsSnapshot: (row.line_items_snapshot as InvoiceSnapshotLine[] | null) ?? null,
    fileKey: row.file_key,
    previousInvoiceId: row.previous_invoice_id ?? null,
    generatedByUserId: row.generated_by_user_id,
    issuedAt: row.issued_at,
    paidAt: row.paid_at,
    paidByUserId: row.paid_by_user_id ?? null,
    paymentReference: row.payment_reference ?? null,
    notes: row.notes,
    draftedByInspectorId: row.drafted_by_inspector_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function buildWhereClause(filters: InvoiceFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.inspectorId) where.inspector_id = filters.inspectorId;
  if (filters.status) where.status = filters.status;

  if (filters.fromDate || filters.toDate) {
    const periodStart: Record<string, Date> = {};
    if (filters.fromDate) periodStart.gte = new Date(filters.fromDate);
    if (filters.toDate) periodStart.lte = new Date(filters.toDate + 'T23:59:59.999Z');
    where.period_start = periodStart;
  }

  return where;
}

export class PrismaInspectorInvoiceRepository implements IInspectorInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<InspectorInvoiceEntity | null> {
    const row = await this.prisma.inspectorInvoice.findUnique({
      where: { id },
      include: { inspector: { select: { name: true } } },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByInspectorAndPeriod(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<InspectorInvoiceEntity | null> {
    const row = await this.prisma.inspectorInvoice.findFirst({
      where: {
        inspector_id: inspectorId,
        period_start: periodStart,
        period_end: periodEnd,
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findActiveByInspectorAndPeriod(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<InspectorInvoiceEntity | null> {
    const row = await this.prisma.inspectorInvoice.findFirst({
      where: {
        inspector_id: inspectorId,
        period_start: periodStart,
        period_end: periodEnd,
        status: { in: ['PENDING_REVIEW', 'CLOSED', 'PAID'] },
      },
      include: { inspector: { select: { name: true } } },
    });
    return row ? mapToEntity(row) : null;
  }

  async findOverlapping(
    inspectorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<InspectorInvoiceEntity | null> {
    const row = await this.prisma.inspectorInvoice.findFirst({
      where: {
        inspector_id: inspectorId,
        period_start: { lte: periodEnd },
        period_end: { gte: periodStart },
        status: { in: ['OPEN', 'CLOSED'] },
      },
    });
    return row ? mapToEntity(row) : null;
  }

  async findAll(
    filters: InvoiceFilters,
    pagination: InvoicePagination,
  ): Promise<InspectorInvoiceEntity[]> {
    const where = buildWhereClause(filters);

    const rows = await this.prisma.inspectorInvoice.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: { period_start: 'desc' },
      include: { inspector: { select: { name: true } } },
    });

    return rows.map(mapToEntity);
  }

  async findManyByIds(ids: string[]): Promise<InspectorInvoiceEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.inspectorInvoice.findMany({
      where: { id: { in: ids } },
    });
    return rows.map(mapToEntity);
  }

  async count(filters: InvoiceFilters): Promise<number> {
    const where = buildWhereClause(filters);
    return this.prisma.inspectorInvoice.count({ where });
  }

  async save(invoice: InspectorInvoiceEntity): Promise<void> {
    await this.prisma.inspectorInvoice.create({
      data: {
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        inspector_id: invoice.inspectorId,
        inspector_name: invoice.inspectorName,
        period_start: invoice.periodStart,
        period_end: invoice.periodEnd,
        period_type: invoice.periodType,
        status: invoice.status,
        total_amount: invoice.totalAmount,
        currency: invoice.currency,
        line_items_snapshot: toSnapshotJson(invoice.lineItemsSnapshot),
        file_key: invoice.fileKey,
        previous_invoice_id: invoice.previousInvoiceId,
        generated_by_user_id: invoice.generatedByUserId,
        issued_at: invoice.issuedAt,
        paid_at: invoice.paidAt,
        paid_by_user_id: invoice.paidByUserId,
        payment_reference: invoice.paymentReference,
        notes: invoice.notes,
        drafted_by_inspector_id: invoice.draftedByInspectorId,
      },
    });
  }

  async update(id: string, data: InvoiceUpdateData): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.invoiceNumber !== undefined) updateData.invoice_number = data.invoiceNumber;
    if (data.inspectorName !== undefined) updateData.inspector_name = data.inspectorName;
    if (data.lineItemsSnapshot !== undefined) updateData.line_items_snapshot = toSnapshotJson(data.lineItemsSnapshot);
    if (data.fileKey !== undefined) updateData.file_key = data.fileKey;
    if (data.generatedByUserId !== undefined) updateData.generated_by_user_id = data.generatedByUserId;
    if (data.issuedAt !== undefined) updateData.issued_at = data.issuedAt;
    if (data.paidAt !== undefined) updateData.paid_at = data.paidAt;
    if (data.paidByUserId !== undefined) updateData.paid_by_user_id = data.paidByUserId;
    if (data.paymentReference !== undefined) updateData.payment_reference = data.paymentReference;
    if (data.notes !== undefined) updateData.notes = data.notes;
    await this.prisma.inspectorInvoice.update({ where: { id }, data: updateData });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.inspectorInvoice.delete({ where: { id } });
  }

  async getReconciliationAggregates(
    filters: ReconciliationAggregateFilters,
  ): Promise<ReconciliationAggregateRow[]> {
    const where: Record<string, unknown> = {
      issued_at: {
        gte: filters.from,
        lte: filters.to,
      },
      status: { in: ['CLOSED', 'PAID'] },
    };
    if (filters.inspectorId) where.inspector_id = filters.inspectorId;

    const rows = await this.prisma.inspectorInvoice.groupBy({
      by: ['status', 'currency'],
      where,
      _sum: { total_amount: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      status: row.status as InspectorInvoiceStatus,
      currency: row.currency,
      sumAmount: Number(row._sum.total_amount ?? 0),
      count: row._count._all,
    }));
  }
}
