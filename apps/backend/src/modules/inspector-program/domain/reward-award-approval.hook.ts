import type { Prisma } from '@prisma/client';
import type { RewardAward } from './reward-award.entity';

/**
 * Context handed to the approval hook, inside the approve/void transaction so any
 * ledger write commits atomically with the status change.
 */
export interface RewardAwardApprovalContext {
  /** The transaction the status change runs in (absent only in unwrapped test runs). */
  tx?: Prisma.TransactionClient;
  actorUserId: string;
  now: Date;
}

/**
 * Extension point for TASK-F08-6 (Q12 boundary). This slice touches no billing;
 * approving or voiding a reward invokes these no-op hooks inside the transaction,
 * and F08-6 plugs in the `INSPECTOR_BONUS` ledger entry + reversal there without
 * reopening this code.
 */
export interface IRewardAwardApprovalHook {
  /** The award has just become `APPROVED` (its new state is passed in). */
  onApproved(award: RewardAward, ctx: RewardAwardApprovalContext): Promise<void>;
  /** The award has just become `VOID` (its new state is passed in). */
  onVoided(award: RewardAward, ctx: RewardAwardApprovalContext): Promise<void>;
}

/** Default no-op hook until TASK-F08-6 provides the billing integration. */
export class NoopRewardAwardApprovalHook implements IRewardAwardApprovalHook {
  async onApproved(): Promise<void> {
    /* no-op (Q12: ledger entry is TASK-F08-6) */
  }

  async onVoided(): Promise<void> {
    /* no-op (Q12: reversal is TASK-F08-6) */
  }
}
