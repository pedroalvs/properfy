import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import {
  EntryNotFoundError,
  EntryNotApprovedError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';

const IDEMPOTENCY_SCOPE = 'void-entry';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface VoidFinancialEntryInput {
  entryId: string;
  reason: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export interface VoidFinancialEntryOutput {
  id: string;
  status: 'VOIDED';
  voidedBy: string;
  voidedAt: Date;
  voidReason: string;
}

export class VoidFinancialEntryUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: VoidFinancialEntryInput): Promise<VoidFinancialEntryOutput> {
    const { entryId, reason, actor } = input;

    // 1. Validate actor role — financial status intervention allowed for AM and OP
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'financial.void', entityType: 'FinancialEntry' });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the mutation twice.
    const payloadHash = hashIdempotencyPayload({
      entryId,
      reason,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<VoidFinancialEntryOutput>(
      input.idempotencyKey,
      IDEMPOTENCY_SCOPE,
      payloadHash,
      IDEMPOTENCY_TTL_HOURS,
    );
    if (claim.status !== 'acquired' && claim.payloadHash !== payloadHash) {
      throw new BillingIdempotencyPayloadMismatchError();
    }
    if (claim.status === 'completed') {
      // The cached response round-trips through JSON storage: `voidedAt` comes
      // back as a string, not a `Date` instance, even though the first-call
      // response carries a real `Date`. Coerce it back so callers see the same
      // shape on replay as on the original call.
      return { ...claim.response, voidedAt: new Date(claim.response.voidedAt) };
    }
    if (claim.status === 'in_progress') {
      throw new BillingIdempotencyInProgressError();
    }
    const ownerToken = claim.ownerToken;

    try {
      // 2. Load entry
      const entry = await this.financialEntryRepo.findById(entryId);
      if (!entry) {
        throw new EntryNotFoundError();
      }

      // 3. Check status is APPROVED
      if (!entry.canBeVoided()) {
        throw new EntryNotApprovedError();
      }

      // 4. Void the entry
      const voidedAt = new Date();
      await this.financialEntryRepo.voidEntry(entryId, entry.tenantId, actor.userId, voidedAt, reason);

      // 5. Audit log
      this.auditService.log({
        action: 'financial_entry.voided',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'FinancialEntry',
        entityId: entryId,
        tenantId: entry.tenantId,
        reason,
        before: { status: 'APPROVED' },
        after: { status: 'VOIDED', voidedBy: actor.userId, voidedAt: voidedAt.toISOString(), voidReason: reason },
      });

      const result: VoidFinancialEntryOutput = {
        id: entryId,
        status: 'VOIDED',
        voidedBy: actor.userId,
        voidedAt,
        voidReason: reason,
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
