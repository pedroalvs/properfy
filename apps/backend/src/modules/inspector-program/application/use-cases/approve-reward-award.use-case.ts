import type { PrismaClient } from '@prisma/client';
import type { AuthContext, RewardAwardResponse } from '@properfy/shared';
import type { AuditService } from '../../../../shared/domain/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { canApprove, type RewardAward } from '../../domain/reward-award.entity';
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

export interface ApproveRewardAwardCommand {
  awardId: string;
  idempotencyKey: string;
  actor: AuthContext;
  requestId?: string;
}

/**
 * Approve a reward award (03.13, FR-033). A system award has no author, so any
 * AM/OP may approve it (DV2 — no self-approval check). The `PENDING → APPROVED`
 * move is a compare-and-swap (a concurrent duplicate loses and gets `409`), and
 * the approval hook runs inside the transaction so TASK-F08-6 can attach the
 * ledger entry atomically (no-op here, Q12). Idempotent on the `Idempotency-Key`.
 */
export class ApproveRewardAwardUseCase {
  constructor(
    private readonly rewardRepo: IRewardAwardRepository,
    private readonly approvalHook: IRewardAwardApprovalHook,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly idempotencyService: IIdempotencyService,
    private readonly clock: Clock = new SystemClock(),
    private readonly prisma?: PrismaClient,
  ) {}

  async execute({ awardId, idempotencyKey, actor, requestId }: ApproveRewardAwardCommand): Promise<RewardAwardResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.awards.approve',
      entityType: 'RewardAward',
      entityId: awardId,
    });

    const payloadHash = hashIdempotencyPayload({ awardId, action: 'approve', actorUserId: actor.userId });
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
      if (!canApprove(existing.status)) throw new RewardAwardInvalidStatusError(existing.status);

      const approvedAt = this.clock.now();
      const applied = await runInTransaction(this.prisma, async ({ tx }) => {
        const affected = await this.rewardRepo.approvePending(awardId, actor.userId, approvedAt, tx);
        if (affected === 0) return false;
        const newState: RewardAward = { ...existing, status: 'APPROVED', approvedByUserId: actor.userId, approvedAt };
        await this.approvalHook.onApproved(newState, { tx, actorUserId: actor.userId, now: approvedAt });
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
        action: 'reward_award.approved',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'RewardAward',
        entityId: awardId,
        requestId,
        before: { status: 'PENDING' },
        after: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: approvedAt.toISOString() },
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
