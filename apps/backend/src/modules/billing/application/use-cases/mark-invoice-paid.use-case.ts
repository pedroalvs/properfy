import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotClosedError,
  InvoiceAlreadyPaidError,
  InvoicePaymentDateInvalidError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';

/** Grace window in milliseconds to absorb clock skew when validating "future" paidAt values (Q4 clarification). */
const FUTURE_GRACE_MS = 60 * 60 * 1000; // 1 hour

export interface MarkInvoicePaidInput {
  invoiceId: string;
  paidAt?: string; // ISO datetime, defaults to now
  paymentReference?: string;
  actor: AuthContext;
}

export interface MarkInvoicePaidOutput {
  id: string;
  status: 'PAID';
  paidAt: string;
  paidByUserId: string;
  paymentReference: string | null;
}

/**
 * Validate the provided paidAt against two constraints:
 * 1. Not in the future (beyond serverUtcNow + 1h grace) — Q4 clarification
 * 2. Not before the invoice generatedAt timestamp
 * Throws `InvoicePaymentDateInvalidError` with the specific reason.
 */
export function validatePaidAt(paidAt: Date, generatedAt: Date | null, now: Date = new Date()): void {
  if (paidAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    throw new InvoicePaymentDateInvalidError('future');
  }
  if (generatedAt && paidAt.getTime() < generatedAt.getTime()) {
    throw new InvoicePaymentDateInvalidError('before_generated_at');
  }
}

export class MarkInvoicePaidUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: MarkInvoicePaidInput): Promise<MarkInvoicePaidOutput> {
    const { invoiceId, actor } = input;

    // 1. Validate actor role (AM/OP only)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.mark_paid',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
    });

    // 2. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 3. Check status — already paid and non-closed get distinct errors for better UX
    if (invoice.isPaid()) {
      throw new InvoiceAlreadyPaidError();
    }
    if (!invoice.canBeMarkedPaid()) {
      throw new InvoiceNotClosedError();
    }

    // 4. Determine paidAt and validate date constraints (FR-006)
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    validatePaidAt(paidAt, invoice.generatedAt);

    const paymentReference = input.paymentReference ?? null;
    const before = {
      status: invoice.status,
      paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
      paidByUserId: invoice.paidByUserId,
      paymentReference: invoice.paymentReference,
    };

    // 5. Transition entity state
    invoice.markPaid(paidAt, actor.userId, paymentReference);

    // 6. Persist
    await this.invoiceRepo.update(invoiceId, {
      status: 'PAID',
      paidAt,
      paidByUserId: actor.userId,
      paymentReference,
    });

    // 7. Audit log (FR-019)
    this.auditService.log({
      action: 'invoice.marked_paid',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      before,
      after: {
        status: 'PAID',
        paidAt: paidAt.toISOString(),
        paidByUserId: actor.userId,
        paymentReference,
      },
    });

    return {
      id: invoiceId,
      status: 'PAID',
      paidAt: paidAt.toISOString(),
      paidByUserId: actor.userId,
      paymentReference,
    };
  }
}
