import type { AuthContext, InvoiceSnapshotLine } from '@properfy/shared';
import { formatInvoiceNumber } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import { InvoiceNotFoundError } from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface GetInvoiceInput {
  invoiceId: string;
  actor: AuthContext;
}

export interface GetInvoiceOutput {
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
  lineItemsSnapshot: InvoiceSnapshotLine[] | null;
  fileKey: string | null;
  generatedByUserId: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  paidByUserId: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export class GetInvoiceUseCase {
  constructor(private readonly invoiceRepo: IInspectorInvoiceRepository) {}

  async execute(input: GetInvoiceInput): Promise<GetInvoiceOutput> {
    const { invoiceId, actor } = input;

    // 1. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 2. Scope check (spec 032): inspector invoices are global platform documents.
    //    AM/OP have full access; INSP is restricted to its own.
    if (actor.role === 'AM' || actor.role === 'OP') {
      // Full access
    } else if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (invoice.inspectorId !== actor.inspectorId) {
        throw new InvoiceNotFoundError();
      }
    } else {
      throw new ForbiddenError('FORBIDDEN', 'You do not have permission to view invoices');
    }

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceNumberDisplay: formatInvoiceNumber(invoice.invoiceNumber),
      inspectorId: invoice.inspectorId,
      inspectorName: invoice.inspectorName,
      periodStart: invoice.periodStart.toISOString().slice(0, 10),
      periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
      periodType: invoice.periodType,
      status: invoice.status,
      totalAmount: Number(invoice.totalAmount),
      currency: invoice.currency,
      lineItemsSnapshot: invoice.lineItemsSnapshot,
      fileKey: invoice.fileKey,
      generatedByUserId: invoice.generatedByUserId,
      issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      paidByUserId: invoice.paidByUserId,
      paymentReference: invoice.paymentReference,
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }
}
