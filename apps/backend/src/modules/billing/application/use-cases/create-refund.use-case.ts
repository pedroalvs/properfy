import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { FinancialEntryEntity } from '../../domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotRefundableError,
  RefundExceedsOriginalAmountError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';

const IDEMPOTENCY_SCOPE = 'refund';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface CreateRefundInput {
  entryId: string;
  description: string;
  reason: string;
  amount?: number;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface CreateRefundOutput {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  entryType: 'REFUND';
  amount: number;
  currency: string;
  status: 'PENDING';
  description: string;
  reason: string;
  referenceEntryId: string;
  initiatedByUserId: string;
  createdAt: Date;
}

export class CreateRefundUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: CreateRefundInput): Promise<CreateRefundOutput> {
    const { actor } = input;

    // 1. Validate actor role
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'financial.refund', entityType: 'FinancialEntry' });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the mutation twice.
    const payloadHash = hashIdempotencyPayload({
      entryId: input.entryId,
      description: input.description,
      reason: input.reason,
      amount: input.amount ?? null,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<CreateRefundOutput>(
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
    input: CreateRefundInput,
    payloadHash: string,
    ownerToken: string,
  ): Promise<CreateRefundOutput> {
    const { entryId, description, reason, actor } = input;

    // 2. Load original entry
    const original = await this.financialEntryRepo.findById(entryId);
    if (!original) {
      throw new EntryNotFoundError();
    }

    // 3. Validate original is an approved TENANT_DEBIT
    if (original.entryType !== 'TENANT_DEBIT' || !original.isApproved()) {
      throw new EntryNotRefundableError();
    }

    // 4. Compute refund amount and validate against cap
    const refundAmount = input.amount ?? original.amount;
    const existingRefundsTotal = await this.financialEntryRepo.sumRefundsByReferenceEntryId(entryId);
    const remainingRefundable = original.amount - existingRefundsTotal;

    if (refundAmount > remainingRefundable) {
      throw new RefundExceedsOriginalAmountError(refundAmount, remainingRefundable);
    }

    // 5. Create refund entry
    const now = new Date();
    const id = randomUUID();

    const refundEntry = new FinancialEntryEntity({
      id,
      tenantId: original.tenantId,
      appointmentId: original.appointmentId,
      inspectorId: null,
      entryType: 'REFUND',
      amount: refundAmount,
      currency: original.currency,
      status: 'PENDING',
      description,
      effectiveAt: now,
      initiatedByUserId: actor.userId,
      approvedByUserId: null,
      approvedAt: null,
      referenceEntryId: original.id,
      reason,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Persist
    await this.financialEntryRepo.save(refundEntry);

    // 7. Audit log
    this.auditService.log({
      action: 'financial_entry.refund_created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: id,
      tenantId: original.tenantId,
      after: {
        entryType: 'REFUND',
        amount: refundAmount,
        referenceEntryId: original.id,
        appointmentId: original.appointmentId,
        reason,
      },
    });

    const result: CreateRefundOutput = {
      id,
      tenantId: original.tenantId,
      appointmentId: original.appointmentId,
      entryType: 'REFUND',
      amount: refundAmount,
      currency: original.currency,
      status: 'PENDING',
      description,
      reason,
      referenceEntryId: original.id,
      initiatedByUserId: actor.userId,
      createdAt: now,
    };

    // The refund entry is already persisted and audited at this point. A `false`
    // here means the completion write itself failed (e.g. the claim's ownership
    // was lost or the record expired mid-request) — NOT that the mutation
    // failed. Throwing here would let the caller's release() free the key, and
    // a retry would re-run doExecute() and create a duplicate refund entry. So
    // we log and return the authoritative, already-committed result instead of
    // throwing.
    const completed = await this.idempotencyService.complete(
      input.idempotencyKey,
      IDEMPOTENCY_SCOPE,
      ownerToken,
      result,
      IDEMPOTENCY_TTL_HOURS,
      payloadHash,
    );
    if (!completed) {
      console.warn(
        `[CreateRefundUseCase] idempotency complete() returned false for key=${input.idempotencyKey} after the refund entry was already persisted (id=${id}) — not releasing the claim to avoid a duplicate on retry.`,
      );
    }

    return result;
  }
}
