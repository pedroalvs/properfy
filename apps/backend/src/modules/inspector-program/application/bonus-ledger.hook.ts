import type {
  IRewardAwardApprovalHook,
  RewardAwardApprovalContext,
} from '../domain/reward-award-approval.hook';
import type { RewardAward } from '../domain/reward-award.entity';
import { isAwardInvoiced } from '../domain/reward-award.entity';
import type { IBonusEntryWriter } from '../domain/bonus-entry-writer.port';
import { bonusEntryDescription, bonusReversalDescription } from '../domain/bonus-description';

/** The reward program pays in AUD (platform currency; mixed currencies fail at invoicing). */
const BONUS_CURRENCY = 'AUD';

/**
 * Q12 (F08-6): the real approval hook. Replaces F08-1's `NoopRewardAwardApprovalHook`.
 *
 * - `onApproved`: mints the original `INSPECTOR_BONUS` `APPROVED` ledger entry, inside the
 *   approval transaction, so the ledger write commits atomically with the `PENDING → APPROVED`
 *   CAS (a failure rolls the whole thing back — no approved reward without an entry).
 * - `onVoided`: a reward not yet on an invoice voids its ledger entry; an already-invoiced one
 *   (the `VoidRewardAwardUseCase` has enforced AM-only by here) gets a negative reversal entry.
 *
 * The `tx` is always present when invoked from the approve/void use cases (they wrap the hook in
 * `runInTransaction`); a missing `tx` is a wiring bug and fails loudly rather than writing
 * non-transactionally.
 */
export class BonusLedgerHook implements IRewardAwardApprovalHook {
  constructor(private readonly bonusWriter: IBonusEntryWriter) {}

  async onApproved(award: RewardAward, ctx: RewardAwardApprovalContext): Promise<void> {
    const tx = requireTx(ctx);
    await this.bonusWriter.createApprovedBonus(tx, {
      rewardAwardId: award.id,
      inspectorId: award.inspectorId,
      amount: award.amount,
      currency: BONUS_CURRENCY,
      approvedByUserId: ctx.actorUserId,
      approvedAt: ctx.now,
      effectiveAt: ctx.now,
      description: bonusEntryDescription(award.goalTitle, award.periodType, award.periodStart),
    });
  }

  async onVoided(award: RewardAward, ctx: RewardAwardApprovalContext): Promise<void> {
    const tx = requireTx(ctx);
    if (isAwardInvoiced(award)) {
      // Already on a CLOSED/PAID invoice: correct it forward with a reversal (DL3). The AM-only
      // gate is enforced by VoidRewardAwardUseCase before the transaction.
      await this.bonusWriter.createReversalForReward(tx, {
        rewardAwardId: award.id,
        approvedByUserId: ctx.actorUserId,
        effectiveAt: ctx.now,
        description: bonusReversalDescription(award.goalTitle, award.periodType, award.periodStart),
      });
      return;
    }
    // Not yet invoiced: void the original entry (a no-op if the reward was still PENDING).
    await this.bonusWriter.voidBonusForReward(tx, {
      rewardAwardId: award.id,
      voidedByUserId: ctx.actorUserId,
      voidedAt: ctx.now,
      voidReason: award.voidReason ?? '',
    });
  }
}

function requireTx(ctx: RewardAwardApprovalContext) {
  if (!ctx.tx) {
    throw new Error('BonusLedgerHook requires a transaction client (ctx.tx is undefined)');
  }
  return ctx.tx;
}
