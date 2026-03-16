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

export interface IInspectorInvoiceRepository {
  findById(id: string): Promise<InspectorInvoiceEntity | null>;
  findByInspectorAndPeriod(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<InspectorInvoiceEntity | null>;
  findOverlapping(inspectorId: string, periodStart: Date, periodEnd: Date): Promise<InspectorInvoiceEntity | null>;
  findAll(filters: InvoiceFilters, pagination: InvoicePagination): Promise<InspectorInvoiceEntity[]>;
  count(filters: InvoiceFilters): Promise<number>;
  save(invoice: InspectorInvoiceEntity): Promise<void>;
  update(id: string, data: Partial<{ status: string; fileKey: string; generatedAt: Date; paidAt: Date; notes: string }>): Promise<void>;
}
