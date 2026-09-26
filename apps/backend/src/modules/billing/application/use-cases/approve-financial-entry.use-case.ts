import type { AuthContext } from '@properfy/shared';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import {
  EntryNotFoundError,
  EntryNotPendingError,
  BillingIdempotencyPayloadMismatchError,
  BillingIdempotencyInProgressError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import type { FinancialEntryOutputItem } from './list-financial-entries.use-case';

const IDEMPOTENCY_SCOPE = 'approve-financial-entry';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface ApproveFinancialEntryInput {
  entryId: string;
  idempotencyKey: string;
  actor: AuthContext;
}

export type ApproveFinancialEntryOutput = FinancialEntryOutputItem;

export class ApproveFinancialEntryUseCase {
  constructor(
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
  ) {}

  async execute(input: ApproveFinancialEntryInput): Promise<ApproveFinancialEntryOutput> {
    const { entryId, actor } = input;

    // 1. Validate actor role
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'financial.approve', entityType: 'FinancialEntry' });

    // 1.5 Idempotency: acquire the claim before any write so a retry (or a
    // concurrent duplicate) never runs the mutation twice.
    const payloadHash = hashIdempotencyPayload({
      entryId,
      actor: { userId: actor.userId, tenantId: actor.tenantId, role: actor.role },
    });
    const claim = await this.idempotencyService.tryAcquire<ApproveFinancialEntryOutput>(
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
      // 2. Load entry
      const entry = await this.financialEntryRepo.findById(entryId);
      if (!entry) {
        throw new EntryNotFoundError();
      }

      // 3. Check status is PENDING
      if (!entry.canBeApproved()) {
        throw new EntryNotPendingError();
      }

      // 4. Prevent self-approval
      this.authorizationService.assertNotSelfApproval(actor.userId, entry.initiatedByUserId, {
        action: 'financial.approve',
        entityType: 'FinancialEntry',
        entityId: input.entryId,
      });

      // 5. Approve (validate PENDING -> APPROVED transition)
      const approvedAt = new Date();
      await this.financialEntryRepo.transitionStatus(entryId, entry.tenantId, 'PENDING', 'APPROVED', actor.userId, approvedAt);

      // 6. Audit log
      this.auditService.log({
        action: 'financial_entry.approved',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'FinancialEntry',
        entityId: entryId,
        tenantId: entry.tenantId,
        before: { status: 'PENDING' },
        after: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: approvedAt.toISOString() },
      });

      // 7. Return full enriched entity so the route response schema is satisfied
      const enriched = await this.financialEntryRepo.findByIdEnriched(entryId, entry.tenantId);
      if (!enriched) {
        throw new EntryNotFoundError();
      }

      const { entity: approved, appointmentCode, relatedEntityName, approvedByName } = enriched;

      const result: ApproveFinancialEntryOutput = {
        id: approved.id,
        tenantId: approved.tenantId,
        appointmentId: approved.appointmentId,
        inspectorId: approved.inspectorId,
        entryType: approved.entryType,
        amount: Number(approved.amount),
        currency: approved.currency,
        status: approved.status,
        description: approved.description,
        effectiveAt: approved.effectiveAt.toISOString(),
        reason: approved.reason,
        referenceEntryId: approved.referenceEntryId,
        initiatedByUserId: approved.initiatedByUserId,
        approvedByUserId: approved.approvedByUserId,
        approvedAt: approved.approvedAt ? approved.approvedAt.toISOString() : null,
        createdAt: approved.createdAt.toISOString(),
        updatedAt: approved.updatedAt.toISOString(),
        appointmentCode,
        relatedEntityName,
        approvedByName,
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
