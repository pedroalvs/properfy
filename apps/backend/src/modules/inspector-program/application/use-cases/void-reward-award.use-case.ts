import type { PrismaClient } from '@prisma/client';
import type { AuthContext, RewardAwardResponse } from '@properfy/shared';
import type { AuditService } from '../../../../shared/domain/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { canVoid, type RewardAward } from '../../domain/reward-award.entity';
import type { IRewardAwardApprovalHook } from '../../domain/reward-award-approval.hook';
import type { IRewardAwardRepository } from '../../domain/reward-award.repository';
import {
  RewardAwardIdempotencyInProgressError,
  RewardAwardIdempotencyPayloadMismatchError,
  RewardAwardInvalidStatusError,
  RewardAwardNotFoundError,
} from '../../domain/inspector-program.errors';
import { toRewardAwardResponse } from '../mappers';

const IDEMPOTENCY_SCOPE = 'reward-award';
const IDEMPOTENCY_TTL_HOURS = 24;

export interface VoidRewardAwardCommand {
  awardId: string;
  idempotencyKey: string;
  reason: string;
  inspectorNote?: string;
  actor: AuthContext;
  requestId?: string;
}

/**
 * Void a reward award (03.13, FR-034). Only `PENDING`/`APPROVED` can be voided
 * here; `PAID` and already-`VOID` return `409` (void-after-invoicing is AM-only in
 * TASK-F08-6). `reason` is internal (AM/OP + report, DL5); the optional
 * `inspectorNote` is the only text the inspector sees. The void is a CAS and the
 * hook runs inside the transaction (no-op here, Q12). There is no manual payment.
 */
export class VoidRewardAwardUseCase {
  constructor(
    private readonly rewardRepo: IRewardAwardRepository,
    private readonly approvalHook: IRewardAwardApprovalHook,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly clock: Clock = new SystemClock(),
    private readonly prisma?: PrismaClient,
  ) {}

  async execute({ awardId, idempotencyKey, reason, inspectorNote, actor, requestId }: VoidRewardAwardCommand): Promise<RewardAwardResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.awards.void',
      entityType: 'RewardAward',
      entityId: awardId,
    });

    const note = inspectorNote ?? null;
    const payloadHash = hashIdempotencyPayload({ awardId, action: 'void', reason, inspectorNote: note, actorUserId: actor.userId });
    const claim = await this.idempotencyService.tryAcquire<RewardAwardResponse>(
      idempotencyKey,
      IDEMPOTENCY_SCOPE,
      payloadHash,
      IDEMPOTENCY_TTL_HOURS,
    );
    if (claim.status !== 'acquired' && claim.payloadHash !== payloadHash) {
      throw new RewardAwardIdempotencyPayloadMismatchError();
    }
    if (claim.status === 'completed') return claim.response;
    if (claim.status === 'in_progress') throw new RewardAwardIdempotencyInProgressError();
    const ownerToken = claim.ownerToken;

    try {
      const existing = await this.rewardRepo.findById(awardId);
      if (!existing) throw new RewardAwardNotFoundError();
      if (!canVoid(existing.status)) throw new RewardAwardInvalidStatusError(existing.status);

      const voidedAt = this.clock.now();
      const applied = await runInTransaction(this.prisma, async ({ tx }) => {
        const affected = await this.rewardRepo.voidPendingOrApproved(awardId, actor.userId, voidedAt, reason, note, tx);
        if (affected === 0) return false;
        const newState: RewardAward = {
          ...existing,
          status: 'VOID',
          voidedByUserId: actor.userId,
          voidedAt,
          voidReason: reason,
          inspectorNote: note,
        };
        await this.approvalHook.onVoided(newState, { tx, actorUserId: actor.userId, now: voidedAt });
        return true;
      });

      if (!applied) {
        const current = await this.rewardRepo.findById(awardId);
        if (!current) throw new RewardAwardNotFoundError();
        throw new RewardAwardInvalidStatusError(current.status);
      }

      const updated = await this.rewardRepo.findById(awardId);
      if (!updated) throw new RewardAwardNotFoundError();

      this.auditService.log({
        action: 'reward_award.voided',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'RewardAward',
        entityId: awardId,
        reason,
        requestId,
        before: { status: existing.status },
        after: { status: 'VOID', voidedBy: actor.userId, voidedAt: voidedAt.toISOString(), voidReason: reason },
      });

      const result = toRewardAwardResponse(updated);
      const completed = await this.idempotencyService.complete(
        idempotencyKey,
        IDEMPOTENCY_SCOPE,
        ownerToken,
        result,
        IDEMPOTENCY_TTL_HOURS,
        payloadHash,
      );
      if (!completed) throw new RewardAwardIdempotencyInProgressError();
      return result;
    } catch (error) {
      await this.idempotencyService.release(idempotencyKey, IDEMPOTENCY_SCOPE, payloadHash, ownerToken).catch(() => {});
      throw error;
    }
  }
}
