import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotClosedError,
} from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface MarkInvoicePaidInput {
  invoiceId: string;
  paidAt?: string; // ISO datetime, defaults to now
  actor: AuthContext;
}

export interface MarkInvoicePaidOutput {
  id: string;
  status: 'PAID';
  paidAt: string;
  markedBy: string;
}

export class MarkInvoicePaidUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: MarkInvoicePaidInput): Promise<MarkInvoicePaidOutput> {
    const { invoiceId, actor } = input;

    // 1. Validate actor role
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP can mark invoices as paid');
    }

    // 2. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 3. Check status is CLOSED
    if (!invoice.isClosed()) {
      throw new InvoiceNotClosedError();
    }

    // 4. Determine paidAt timestamp
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    // 5. Update invoice
    await this.invoiceRepo.update(invoiceId, { status: 'PAID', paidAt });

    // 6. Audit log
    this.auditService.log({
      action: 'invoice.marked_paid',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      before: { status: 'CLOSED' },
      after: { status: 'PAID', paidAt: paidAt.toISOString(), markedBy: actor.userId },
    });

    return {
      id: invoiceId,
      status: 'PAID',
      paidAt: paidAt.toISOString(),
      markedBy: actor.userId,
    };
  }
}
