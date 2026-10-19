import type { AuthContext } from '@properfy/shared';
import type { FinancialEntryType, FinancialEntryStatus } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import type { FinancialEntryEntity } from '../../domain/financial-entry.entity';
import {
  EntryNotFoundError,
  EntryNotEditableError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';

const IDEMPOTENCY_SCOPE = 'update-entry';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface UpdateFinancialEntryInput {
  entryId: string;
  amount?: number;
  description?: string;
  effectiveAt?: Date;
  reason?: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface UpdateFinancialEntryOutput {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  inspectorId: string | null;
  entryType: FinancialEntryType;
  amount: number;
  currency: string;
  status: FinancialEntryStatus;
  description: string;
  effectiveAt: Date;
  initiatedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  referenceEntryId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toOutput(entry: FinancialEntryEntity): UpdateFinancialEntryOutput {
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    appointmentId: entry.appointmentId,
    inspectorId: entry.inspectorId,
    entryType: entry.entryType,
    amount: entry.amount,
    currency: entry.currency,
    status: entry.status,
    description: entry.description,
    effectiveAt: entry.effectiveAt,
    initiatedByUserId: entry.initiatedByUserId,
    approvedByUserId: entry.approvedByUserId,
    approvedAt: entry.approvedAt,
    referenceEntryId: entry.referenceEntryId,
    reason: entry.reason,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * In-place edit of a PENDING manual adjustment (WEB-FIN-TYPING / PR-N).
 *
 * Scope is deliberately narrow (see `FinancialEntryEntity.canBeEdited`): only a
 * MANUAL_ADJUSTMENT still in PENDING may be mutated, and only its amount,
 * description, effectiveAt and reason. AM/OP only; the write is tenant-scoped and
 * status/type-guarded at the DB layer, audited, and wrapped by the shared
 * idempotency guard (mirrors the HOL-3b pattern on void/manual-adjustment).
 */
export class UpdateFinancialEntryUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: UpdateFinancialEntryInput): Promise<UpdateFinancialEntryOutput> {
    const { entryId, actor } = input;

    // 1. Role gate — manual financial adjustments are AM/OP only (root §6).
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.update_entry',
      entityType: 'FinancialEntry',
      entityId: entryId,
    });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the mutation twice.
    const payloadHash = hashIdempotencyPayload({
      entryId,
      amount: input.amount ?? null,
      description: input.description ?? null,
      effectiveAt: input.effectiveAt ? input.effectiveAt.toISOString() : null,
      reason: input.reason ?? null,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<UpdateFinancialEntryOutput>(
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
    input: UpdateFinancialEntryInput,
    payloadHash: string,
    ownerToken: string,
  ): Promise<UpdateFinancialEntryOutput> {
    const { entryId, actor } = input;

    // 2. Load. AM/OP act cross-tenant, so the entry's own tenant_id is the scope
    // (not the actor's JWT tenant) — mirrors create-manual-adjustment / void.
    const entry = await this.financialEntryRepo.findById(entryId);
    if (!entry) {
      throw new EntryNotFoundError();
    }

    // 3. Editability guard (fast, precise 409 before any write attempt).
    if (!entry.canBeEdited()) {
      throw new EntryNotEditableError();
    }

    // 4. Atomic, tenant + status + type guarded update. A concurrent approve/void
    // that collapsed the PENDING window makes this affect zero rows → 409.
    const affected = await this.financialEntryRepo.updateManualAdjustmentFields(entryId, entry.tenantId, {
      amount: input.amount,
      description: input.description,
      effectiveAt: input.effectiveAt,
      reason: input.reason,
    });
    if (affected === 0) {
      throw new EntryNotEditableError();
    }

    // 5. Re-read the authoritative row (reflects the DB-managed updated_at and the
    // persisted values) for the response.
    const updated = await this.financialEntryRepo.findById(entryId);
    if (!updated) {
      throw new EntryNotFoundError();
    }

    // 6. Audit the adjustment with a before/after column snapshot.
    this.auditService.log({
      action: 'financial_entry.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'FinancialEntry',
      entityId: entryId,
      tenantId: entry.tenantId,
      reason: input.reason ?? undefined,
      before: {
        amount: entry.amount,
        description: entry.description,
        effectiveAt: entry.effectiveAt.toISOString(),
        reason: entry.reason,
      },
      after: {
        amount: updated.amount,
        description: updated.description,
        effectiveAt: updated.effectiveAt.toISOString(),
        reason: updated.reason,
      },
    });

    const result = toOutput(updated);

    // The edit is already persisted and audited. A `false` here means the
    // completion write itself failed (ownership lost / record expired) — NOT that
    // the mutation failed. Throwing would let the caller's release() free the key
    // and a retry would re-apply + re-audit the same edit, so we log and return
    // the authoritative, already-committed result instead (mirrors manual-adjustment).
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
        `[UpdateFinancialEntryUseCase] idempotency complete() returned false for key=${input.idempotencyKey} after the entry was already updated (id=${entryId}) — not releasing the claim to avoid re-applying on retry.`,
      );
    }

    return result;
  }
}
