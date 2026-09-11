import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import {
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import { validatePaidAt } from './mark-invoice-paid.use-case';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

const IDEMPOTENCY_SCOPE = 'batch-mark-invoices-paid';
const IDEMPOTENCY_TTL_HOURS = 24;

export type BatchSkipReason = 'ALREADY_PAID' | 'NOT_CLOSED' | 'NOT_FOUND' | 'TENANT_SCOPE';

export interface BatchMarkInvoicesPaidInput {
  invoiceIds: string[];
  paidAt?: string;
  paymentReference?: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface BatchMarkInvoicesPaidOutput {
  processed: Array<{ id: string; status: 'PAID' }>;
  skipped: Array<{ id: string; reason: BatchSkipReason }>;
}

/**
 * Batch mark-as-paid use case.
 *
 * Per FR-007/FR-008/FR-009/FR-009a:
 * - Iterates over the provided invoice IDs
 * - Processes CLOSED invoices, skipping already-paid and non-closed without failing the batch
 * - Produces ONE audit record per processed invoice (not one for the batch)
 * - Shared paidAt/paymentReference across the whole batch
 * - Validates paidAt once for the whole batch (UTC + 1h grace); per-invoice "before issuedAt"
 *   check is performed inside the loop
 *
 * Note: Idempotency (one Idempotency-Key per batch request — Q3 clarification) covers the
 * WHOLE batch as a single unit of replay via the atomic `tryAcquire`/`complete`/`release`
 * flow — there are no per-invoice sub-keys, and a replay returns the stored per-invoice
 * `processed`/`skipped` results without re-running any invoice update.
 */
export class BatchMarkInvoicesPaidUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: BatchMarkInvoicesPaidInput): Promise<BatchMarkInvoicesPaidOutput> {
    const { invoiceIds, actor } = input;

    // 1. Role gate
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.mark_paid',
      entityType: 'InspectorInvoice',
    });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the batch twice. ONE key covers the
    // whole batch — the batch is the unit of replay.
    const payloadHash = hashIdempotencyPayload({
      invoiceIds,
      paidAt: input.paidAt ?? null,
      paymentReference: input.paymentReference ?? null,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<BatchMarkInvoicesPaidOutput>(
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
    input: BatchMarkInvoicesPaidInput,
    payloadHash: string,
    ownerToken: string,
  ): Promise<BatchMarkInvoicesPaidOutput> {
    const { invoiceIds, actor } = input;

    // 2. Determine and validate shared paidAt (once per batch)
    const now = this.clock.now();
    const paidAt = input.paidAt ? new Date(input.paidAt) : now;
    // Shared "not in future" validation — use null issuedAt so only the future check applies here
    validatePaidAt(paidAt, null, now);

    const paymentReference = input.paymentReference ?? null;

    // 3. Load all requested invoices in a single query
    const invoices = await this.invoiceRepo.findManyByIds(invoiceIds);
    const byId = new Map(invoices.map((i) => [i.id, i]));

    const processed: Array<{ id: string; status: 'PAID' }> = [];
    const skipped: Array<{ id: string; reason: BatchSkipReason }> = [];

    // 4. Loop over requested IDs (preserve caller order)
    for (const id of invoiceIds) {
      const invoice = byId.get(id);
      if (!invoice) {
        skipped.push({ id, reason: 'NOT_FOUND' });
        continue;
      }

      if (invoice.isPaid()) {
        skipped.push({ id, reason: 'ALREADY_PAID' });
        continue;
      }

      if (!invoice.canBeMarkedPaid()) {
        skipped.push({ id, reason: 'NOT_CLOSED' });
        continue;
      }

      // Per-invoice "not before issuedAt" check — skip instead of throwing so the batch
      // semantics remain "process what can be processed". Mirror the 60s grace from
      // `validatePaidAt` so client-side datetime truncation (datetime-local drops seconds)
      // doesn't push the batch path into a false "before issuedAt" verdict for the
      // common "mark paid now right after invoice generation" case (Bug B-7).
      const BATCH_BEFORE_GENERATED_GRACE_MS = 60 * 1000;
      if (
        invoice.issuedAt &&
        paidAt.getTime() < invoice.issuedAt.getTime() - BATCH_BEFORE_GENERATED_GRACE_MS
      ) {
        // For this edge case, surface it as a skip with NOT_CLOSED (closest existing reason).
        // A future refinement could add a more specific INVALID_DATE reason.
        skipped.push({ id, reason: 'NOT_CLOSED' });
        continue;
      }

      const before = {
        status: invoice.status,
        paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
        paidByUserId: invoice.paidByUserId,
        paymentReference: invoice.paymentReference,
      };

      invoice.markPaid(paidAt, actor.userId, paymentReference);

      await this.invoiceRepo.update(id, {
        status: 'PAID',
        paidAt,
        paidByUserId: actor.userId,
        paymentReference,
      });

      // Individual audit record (FR-009)
      this.auditService.log({
        action: 'invoice.marked_paid',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'InspectorInvoice',
        entityId: id,
        before,
        after: {
          status: 'PAID',
          paidAt: paidAt.toISOString(),
          paidByUserId: actor.userId,
          paymentReference,
        },
        metadata: { batch: true },
      });

      processed.push({ id, status: 'PAID' });
    }

    const result: BatchMarkInvoicesPaidOutput = { processed, skipped };

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
