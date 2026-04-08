import type { AuthContext } from '@properfy/shared';
import type {
  ITenantInvoiceRepository,
  TenantInvoiceFilters,
  TenantInvoicePagination,
} from '../../domain/tenant-invoice.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ListTenantInvoicesInput {
  tenantId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
  actor: AuthContext;
}

export interface TenantInvoiceOutputItem {
  id: string;
  tenantId: string;
  periodFrom: string;
  periodTo: string;
  totalDebit: number;
  totalRefund: number;
  totalAdjustment: number;
  netAmount: number;
  currency: string;
  status: string;
  fileKey: string | null;
  previousInvoiceId: string | null;
  generatedByUserId: string | null;
  generatedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTenantInvoicesOutput {
  data: TenantInvoiceOutputItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListTenantInvoicesUseCase {
  constructor(private readonly tenantInvoiceRepo: ITenantInvoiceRepository) {}

  async execute(input: ListTenantInvoicesInput): Promise<ListTenantInvoicesOutput> {
    const { actor } = input;

    const filters: TenantInvoiceFilters = {};
    const pagination: TenantInvoicePagination = {
      page: input.page,
      pageSize: input.pageSize,
    };

    if (actor.role === 'AM' || actor.role === 'OP') {
      if (input.tenantId) filters.tenantId = input.tenantId;
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId) {
        throw new ForbiddenError('TENANT_NOT_LINKED', 'Tenant not linked to user account');
      }
      filters.tenantId = actor.tenantId;
    } else {
      throw new ForbiddenError('FORBIDDEN', 'You do not have permission to list tenant invoices');
    }

    if (input.status) filters.status = input.status as TenantInvoiceFilters['status'];
    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    const [data, total] = await Promise.all([
      this.tenantInvoiceRepo.findAll(filters, pagination),
      this.tenantInvoiceRepo.count(filters),
    ]);

    return {
      data: data.map((invoice) => ({
        id: invoice.id,
        tenantId: invoice.tenantId,
        periodFrom: formatDate(invoice.periodFrom),
        periodTo: formatDate(invoice.periodTo),
        totalDebit: Number(invoice.totalDebit),
        totalRefund: Number(invoice.totalRefund),
        totalAdjustment: Number(invoice.totalAdjustment),
        netAmount: Number(invoice.netAmount),
        currency: invoice.currency,
        status: invoice.status,
        fileKey: invoice.fileKey,
        previousInvoiceId: invoice.previousInvoiceId,
        generatedByUserId: invoice.generatedByUserId,
        generatedAt: invoice.generatedAt?.toISOString() ?? null,
        notes: invoice.notes,
        createdAt: invoice.createdAt.toISOString(),
        updatedAt: invoice.updatedAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
