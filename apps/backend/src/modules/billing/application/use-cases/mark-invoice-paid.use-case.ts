import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotClosedError,
  InvoiceAlreadyPaidError,
  InvoicePaymentDateInvalidError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

const IDEMPOTENCY_SCOPE = 'mark-invoice-paid';
const IDEMPOTENCY_TTL_HOURS = 24;

/** Grace window in milliseconds to absorb clock skew when validating "future" paidAt values (Q4 clarification). */
const FUTURE_GRACE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Grace window in milliseconds for the "paidAt is before issuedAt" check.
 * Client-side date pickers (datetime-local, date) truncate precision below the
 * minute — sending e.g. `2026-04-18T14:45:00.000Z` when the invoice was in
 * fact generated at `2026-04-18T14:45:23.456Z`. Absorbing a small truncation
 * window prevents the UI from surfacing a 400 on the default "mark paid now"
 * flow immediately after an invoice is generated. Bug B-7 (QA 2026-04-18).
 */
const BEFORE_GENERATED_GRACE_MS = 60 * 1000; // 1 minute

export interface MarkInvoicePaidInput {
  invoiceId: string;
  paidAt?: string; // ISO datetime, defaults to now
  paymentReference?: string;
  idempotencyKey: string;
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
 * 2. Not before the invoice issuedAt timestamp
 * Throws `InvoicePaymentDateInvalidError` with the specific reason.
 */
export function validatePaidAt(paidAt: Date, issuedAt: Date | null, now: Date = new Date()): void {
  if (paidAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    throw new InvoicePaymentDateInvalidError('future');
  }
  if (issuedAt && paidAt.getTime() < issuedAt.getTime() - BEFORE_GENERATED_GRACE_MS) {
    throw new InvoicePaymentDateInvalidError('before_generated_at');
  }
}

export class MarkInvoicePaidUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: MarkInvoicePaidInput): Promise<MarkInvoicePaidOutput> {
    const { invoiceId, actor } = input;

    // 1. Validate actor role (AM/OP only)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.mark_paid',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
    });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the mutation twice.
    const payloadHash = hashIdempotencyPayload({
      invoiceId,
      paidAt: input.paidAt ?? null,
      paymentReference: input.paymentReference ?? null,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<MarkInvoicePaidOutput>(
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
      return await this.doExecute(input, payloadHash, ownerToken);
    } catch (error) {
      await this.idempotencyService.release(input.idempotencyKey, IDEMPOTENCY_SCOPE, payloadHash, ownerToken).catch(() => {});
      throw error;
    }
  }

  private async doExecute(
    input: MarkInvoicePaidInput,
    payloadHash: string,
    ownerToken: string,
  ): Promise<MarkInvoicePaidOutput> {
    const { invoiceId, actor } = input;

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
    const now = this.clock.now();
    const paidAt = input.paidAt ? new Date(input.paidAt) : now;
    validatePaidAt(paidAt, invoice.issuedAt, now);

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

    const result: MarkInvoicePaidOutput = {
      id: invoiceId,
      status: 'PAID',
      paidAt: paidAt.toISOString(),
      paidByUserId: actor.userId,
      paymentReference,
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
  }
}
