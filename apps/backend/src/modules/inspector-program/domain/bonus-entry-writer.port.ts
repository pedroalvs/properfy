import type { Prisma } from '@prisma/client';

/**
 * Input for creating the original `INSPECTOR_BONUS` ledger entry at reward approval.
 */
export interface CreateApprovedBonusInput {
  rewardAwardId: string;
  inspectorId: string;
  /** Positive bonus amount (the reward amount). */
  amount: number;
  currency: string;
  /** The AM/OP who approved the reward (the entry's approver; initiator is null — PR #1229). */
  approvedByUserId: string;
  approvedAt: Date;
  effectiveAt: Date;
  description: string;
}

/** Input for the negative reversal created when an AM voids an already-invoiced reward. */
export interface CreateBonusReversalInput {
  rewardAwardId: string;
  /** The AM who voided the invoiced reward (the reversal's approver). */
  approvedByUserId: string;
  effectiveAt: Date;
  description: string;
}

/** Input for voiding the original bonus entry when a not-yet-invoiced reward is voided. */
export interface VoidBonusInput {
  rewardAwardId: string;
  voidedByUserId: string;
  voidedAt: Date;
  voidReason: string;
}

/**
 * Port (inspector-program domain) for the bonus side of the ledger. Implemented by the
 * billing module's `PrismaFinancialEntryRepository`, so the reward module never imports
 * the financial repository (Clean Architecture; mirrors F08-1 `IRegionGoalUsageChecker`).
 * Every method runs inside the caller's transaction so the ledger write commits atomically
 * with the reward status change.
 */
export interface IBonusEntryWriter {
  /** Create the original `INSPECTOR_BONUS` `APPROVED` entry. Returns the new entry id. */
  createApprovedBonus(tx: Prisma.TransactionClient, input: CreateApprovedBonusInput): Promise<string>;
  /**
   * Void the original bonus entry of a not-yet-invoiced reward (`APPROVED → VOIDED`).
   * A no-op when no `APPROVED` entry exists (e.g. a `PENDING` reward never had one).
   */
  voidBonusForReward(tx: Prisma.TransactionClient, input: VoidBonusInput): Promise<void>;
  /**
   * Create the negative reversal of an already-invoiced reward's bonus, linked to the
   * original via `reference_entry_id`. Idempotent: a duplicate reversal raises `409`.
   */
  createReversalForReward(tx: Prisma.TransactionClient, input: CreateBonusReversalInput): Promise<void>;
}
