import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotPaidError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ReverseInvoicePaymentInput {
  invoiceId: string;
  reason: string;
  actor: AuthContext;
}

export interface ReverseInvoicePaymentOutput {
  id: string;
  status: 'CLOSED';
  paidAt: null;
  paidByUserId: null;
  paymentReference: null;
}

/**
 * Reverses a payment recording, transitioning PAID → CLOSED.
 * Clears paid_at, paid_by_user_id, and payment_reference.
 * Requires a mandatory reason (FR-011) which is persisted in the audit record.
 */
export class ReverseInvoicePaymentUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ReverseInvoicePaymentInput): Promise<ReverseInvoicePaymentOutput> {
    const { invoiceId, reason, actor } = input;

    // 1. Role gate (FR-012)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.reverse_payment',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
    });

    // 2. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 3. Status check (FR-013)
    if (!invoice.canBeReversed()) {
      throw new InvoiceNotPaidError();
    }

    const before = {
      status: invoice.status,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      paidByUserId: invoice.paidByUserId,
      paymentReference: invoice.paymentReference,
    };

    // 4. Transition entity and persist
    invoice.reversePayment();

    await this.invoiceRepo.update(invoiceId, {
      status: 'CLOSED',
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
    });

    // 5. Audit log with reason (FR-020)
    this.auditService.log({
      action: 'invoice.payment_reversed',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      reason,
      before,
      after: {
        status: 'CLOSED',
        paidAt: null,
        paidByUserId: null,
        paymentReference: null,
      },
    });

    return {
      id: invoiceId,
      status: 'CLOSED',
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
    };
  }
}
