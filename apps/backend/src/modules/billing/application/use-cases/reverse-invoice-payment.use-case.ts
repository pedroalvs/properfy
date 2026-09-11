import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotPaidError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';

const IDEMPOTENCY_SCOPE = 'reverse-invoice-payment';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface ReverseInvoicePaymentInput {
  invoiceId: string;
  reason: string;
  idempotencyKey: string;
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
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: ReverseInvoicePaymentInput): Promise<ReverseInvoicePaymentOutput> {
    const { invoiceId, reason, actor } = input;

    // 1. Role gate (FR-012)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.reverse_payment',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
    });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the mutation twice.
    const payloadHash = hashIdempotencyPayload({
      invoiceId,
      reason,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<ReverseInvoicePaymentOutput>(
      input.idempotencyKey,
      IDEMPOTENCY_SCOPE,
      payloadHash,
      IDEMPOTENCY_TTL_HOURS,
    );
    if (claim.status !== 'acquired' && claim.payloadHash !== payloadHash) {
      throw new BillingIdempotencyPayloadMismatchError();
    }
    if (claim.status === 'completed') {
      return claim.response;
    }
    if (claim.status === 'in_progress') {
      throw new BillingIdempotencyInProgressError();
    }
    const ownerToken = claim.ownerToken;

    try {
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

      const result: ReverseInvoicePaymentOutput = {
        id: invoiceId,
        status: 'CLOSED',
        paidAt: null,
        paidByUserId: null,
        paymentReference: null,
      };

      const completed = await this.idempotencyService.complete(
        input.idempotencyKey,
        IDEMPOTENCY_SCOPE,
        ownerToken,
        result,
        IDEMPOTENCY_TTL_HOURS,
        payloadHash,
      );
      if (!completed) {
        throw new BillingIdempotencyInProgressError();
      }

      return result;
    } catch (error) {
      await this.idempotencyService.release(input.idempotencyKey, IDEMPOTENCY_SCOPE, payloadHash, ownerToken).catch(() => {});
      throw error;
    }
  }
}
