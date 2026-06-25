import type { InspectorInvoiceEntity } from './inspector-invoice.entity';
import type { InspectorInvoiceStatus } from '@properfy/shared';

export interface InvoiceFilters {
  inspectorId?: string;
  status?: InspectorInvoiceStatus;
  fromDate?: string;
  toDate?: string;
}

export interface InvoicePagination {
  page: number;
  pageSize: number;
}

export interface InvoiceUpdateData {
  status?: string;
  fileKey?: string | null;
  generatedByUserId?: string | null;
  generatedAt?: Date | null;
  paidAt?: Date | null;
  paidByUserId?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export interface ReconciliationAggregateFilters {
  from: Date;
  to: Date;
  inspectorId?: string;
}

export interface ReconciliationAggregateRow {
  status: InspectorInvoiceStatus;
  currency: string;
  sumAmount: number;
  count: number;
}

export interface IInspectorInvoiceRepository {
  findById(id: string): Promise<InspectorInvoiceEntity | null>;
  findByInspectorAndPeriod(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<InspectorInvoiceEntity | null>;
  findOverlapping(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<InspectorInvoiceEntity | null>;
  findAll(filters: InvoiceFilters, pagination: InvoicePagination): Promise<InspectorInvoiceEntity[]>;
  findManyByIds(ids: string[]): Promise<InspectorInvoiceEntity[]>;
  count(filters: InvoiceFilters): Promise<number>;
  save(invoice: InspectorInvoiceEntity): Promise<void>;
  update(id: string, data: InvoiceUpdateData): Promise<void>;
  deleteById(id: string): Promise<void>;
  /**
   * Returns raw aggregate rows grouped by (status, currency) filtered by generatedAt range.
   * Only includes invoices in CLOSED or PAID status.
   * The use case layer is responsible for detecting multi-currency scope and summing per status.
   */
  getReconciliationAggregates(filters: ReconciliationAggregateFilters): Promise<ReconciliationAggregateRow[]>;
}
