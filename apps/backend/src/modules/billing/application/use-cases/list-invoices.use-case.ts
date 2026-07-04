import type { AuthContext, InvoiceStatusBucket } from '@properfy/shared';
import { INVOICE_STATUS_BUCKETS, INVOICE_DONE_STATUSES, formatInvoiceNumber } from '@properfy/shared';
import type {
  IInspectorInvoiceRepository,
  InvoiceFilters,
  InvoicePagination,
} from '../../domain/inspector-invoice.repository';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface ListInvoicesInput {
  inspectorId?: string;
  agencyId?: string;
  branchId?: string;
  status?: string; // 3-bucket: pending | approved | rejected
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
  actor: AuthContext;
}

export interface InvoiceOutputItem {
  id: string;
  invoiceNumber: number | null;
  invoiceNumberDisplay: string | null;
  inspectorId: string;
  inspectorName: string | null;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  status: string;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  paidByUserId: string | null;
  paymentReference: string | null;
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

    // Inspector Property Invoices are global (not tenant-scoped): AM/OP list all; INSP own-only.
    // (spec 032 reverses the earlier OP exclusion — an inspector invoice is a platform document.)
    if (actor.role === 'AM' || actor.role === 'OP') {
      if (input.inspectorId) filters.inspectorId = input.inspectorId;
    } else if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      filters.inspectorId = actor.inspectorId;
    } else {
      throw new ForbiddenError('FORBIDDEN', 'You do not have permission to list invoices');
    }

    // hasOwnProperty (not `in`) so inherited Object.prototype keys like 'toString' can't slip
    // through and later blow up on a spread of a function.
    if (input.status === 'done') {
      // "Done" tab: everything no longer pending review (approved ∪ rejected).
      filters.statusIn = [...INVOICE_DONE_STATUSES];
    } else if (input.status && Object.prototype.hasOwnProperty.call(INVOICE_STATUS_BUCKETS, input.status)) {
      filters.statusIn = [...INVOICE_STATUS_BUCKETS[input.status as InvoiceStatusBucket]];
    }
    if (input.agencyId) filters.agencyId = input.agencyId;
    if (input.branchId) filters.branchId = input.branchId;
    if (input.fromDate) filters.fromDate = input.fromDate;
    if (input.toDate) filters.toDate = input.toDate;

    const [data, total] = await Promise.all([
      this.invoiceRepo.findAll(filters, pagination),
      this.invoiceRepo.count(filters),
    ]);

    return {
      data: data.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceNumberDisplay: formatInvoiceNumber(invoice.invoiceNumber),
        inspectorId: invoice.inspectorId,
        inspectorName: invoice.inspectorName,
        periodStart: formatDate(invoice.periodStart),
        periodEnd: formatDate(invoice.periodEnd),
        periodType: invoice.periodType,
        status: invoice.status,
        totalAmount: Number(invoice.totalAmount),
        currency: invoice.currency,
        fileKey: invoice.fileKey,
        issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
        paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        paidByUserId: invoice.paidByUserId,
        paymentReference: invoice.paymentReference,
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
