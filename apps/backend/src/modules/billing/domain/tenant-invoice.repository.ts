import type { TenantInvoiceEntity } from './tenant-invoice.entity';
import type { TenantInvoiceStatus } from '@properfy/shared';

export interface TenantInvoiceFilters {
  tenantId?: string;
  status?: TenantInvoiceStatus;
  fromDate?: string;
  toDate?: string;
}

export interface TenantInvoicePagination {
  page: number;
  pageSize: number;
}

export interface ITenantInvoiceRepository {
  findById(id: string): Promise<TenantInvoiceEntity | null>;
  findByTenantAndPeriod(tenantId: string, periodFrom: Date, periodTo: Date): Promise<TenantInvoiceEntity | null>;
  findOverlapping(tenantId: string, periodFrom: Date, periodTo: Date): Promise<TenantInvoiceEntity | null>;
  findAll(filters: TenantInvoiceFilters, pagination: TenantInvoicePagination): Promise<TenantInvoiceEntity[]>;
  count(filters: TenantInvoiceFilters): Promise<number>;
  save(invoice: TenantInvoiceEntity): Promise<void>;
  update(id: string, data: Partial<{
    status: string;
    fileKey: string;
    generatedAt: Date;
    notes: string;
  }>): Promise<void>;
}
