import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';

const IDEMPOTENCY_SCOPE = 'reject-draft-invoice';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface RejectDraftInvoiceInput {
  invoiceId: string;
  reason: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface RejectDraftInvoiceOutput {
  invoiceId: string;
  status: 'VOID';
}

export class RejectDraftInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: RejectDraftInvoiceInput): Promise<RejectDraftInvoiceOutput> {
    const { invoiceId, reason, actor } = input;

    // 1. Validate actor role (AM/OP only)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.reject_draft_invoice',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
    });

    // 1.5 Idempotency (HOL-3b): claim the key before any write so a retry or a
    // concurrent duplicate never re-runs the PENDING_REVIEW → VOID transition.
    // The DB optimistic guard (voidIfPendingReview) already blocks a second
    // mutation, but without this a legitimate retry would get
    // InvoiceNotPendingReviewError instead of the original success response.
    const payloadHash = hashIdempotencyPayload({
      invoiceId,
      reason,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<RejectDraftInvoiceOutput>(
      input.idempotencyKey,
      IDEMPOTENCY_SCOPE,
      payloadHash,
      IDEMPOTENCY_TTL_HOURS,
    );
    if (claim.status !== 'acquired' && claim.payloadHash !== payloadHash) {
      throw new BillingIdempotencyPayloadMismatchError();
    }
    if (claim.status === 'completed') {
      // Output is all primitives, so no Date coercion is needed on replay.
      return claim.response;
    }
    if (claim.status === 'in_progress') {
      throw new BillingIdempotencyInProgressError();
    }
    const ownerToken = claim.ownerToken;

    try {
      return await this.reject(invoiceId, reason, actor, input.idempotencyKey, ownerToken, payloadHash);
    } catch (error) {
      await this.idempotencyService
        .release(input.idempotencyKey, IDEMPOTENCY_SCOPE, payloadHash, ownerToken)
        .catch(() => {});
      throw error;
    }
  }

  private async reject(
    invoiceId: string,
    reason: string,
    actor: AuthContext,
    idempotencyKey: string,
    ownerToken: string,
    payloadHash: string,
  ): Promise<RejectDraftInvoiceOutput> {
    // 2. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 3. Check status must be PENDING_REVIEW
    if (invoice.status !== 'PENDING_REVIEW') {
      throw new InvoiceNotPendingReviewError();
    }

    // 4. Transition PENDING_REVIEW → VOID via the domain method (validates the reason), then persist
    //    with a guarded conditional update so a concurrent approval can't be silently overwritten.
    //    Retained in history (no hard delete).
    invoice.void(reason);
    const transitioned = await this.invoiceRepo.voidIfPendingReview(invoiceId, invoice.notes ?? reason);
    if (!transitioned) {
      // Lost the race — the invoice was approved/rejected concurrently.
      throw new InvoiceNotPendingReviewError();
    }

    // 5. Audit.
    this.auditService.log({
      action: 'inspector_invoice.draft_rejected',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      after: {
        inspectorId: invoice.inspectorId,
        invoiceId,
        draftedByInspectorId: invoice.draftedByInspectorId,
        rejectedByUserId: actor.userId,
        // Log the persisted (trimmed) reason so the audit trail matches invoice.notes exactly.
        reason: invoice.notes,
      },
    });

    const result: RejectDraftInvoiceOutput = {
      invoiceId,
      status: 'VOID',
    };

    const completed = await this.idempotencyService.complete(
      idempotencyKey,
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
  }
}
