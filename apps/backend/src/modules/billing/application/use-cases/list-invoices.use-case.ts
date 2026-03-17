import type { AuthContext } from '@properfy/shared';
import type {
  IInspectorInvoiceRepository,
  InvoiceFilters,
  InvoicePagination,
} from '../../domain/inspector-invoice.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ListInvoicesInput {
  inspectorId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
  actor: AuthContext;
}

export interface InvoiceOutputItem {
  id: string;
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  status: string;
  totalAmount: string;
  currency: string;
  generatedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ListInvoicesOutput {
  data: InvoiceOutputItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListInvoicesUseCase {
  constructor(private readonly invoiceRepo: IInspectorInvoiceRepository) {}

  async execute(input: ListInvoicesInput): Promise<ListInvoicesOutput> {
    const { actor } = input;

    const filters: InvoiceFilters = {};
    const pagination: InvoicePagination = {
      page: input.page,
      pageSize: input.pageSize,
    };

    if (actor.role === 'AM' || actor.role === 'OP') {
      // AM/OP can filter by any inspectorId
      if (input.inspectorId) filters.inspectorId = input.inspectorId;
    } else if (actor.role === 'INSP') {
      // Inspector: forced to own invoices
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      filters.inspectorId = actor.inspectorId;
    } else {
      throw new ForbiddenError('FORBIDDEN', 'You do not have permission to list invoices');
    }

    if (input.status) filters.status = input.status as InvoiceFilters['status'];
    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    const [data, total] = await Promise.all([
      this.invoiceRepo.findAll(filters, pagination),
      this.invoiceRepo.count(filters),
    ]);

    return {
      data: data.map((invoice) => ({
        id: invoice.id,
        inspectorId: invoice.inspectorId,
        periodStart: formatDate(invoice.periodStart),
        periodEnd: formatDate(invoice.periodEnd),
        periodType: invoice.periodType,
        status: invoice.status,
        totalAmount: invoice.totalAmount.toString(),
        currency: invoice.currency,
        generatedAt: invoice.generatedAt ? invoice.generatedAt.toISOString() : null,
        paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        createdAt: invoice.createdAt.toISOString(),
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
