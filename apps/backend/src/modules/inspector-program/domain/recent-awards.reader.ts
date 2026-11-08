import type { RewardAward } from './reward-award.entity';

/**
 * Read-only access to recent reward awards for the inspector-facing program
 * endpoint and the goal-reached message step (TASK-F08-4). Kept separate from the
 * AM/OP `IRewardAwardRepository` because these are projections, not the write model.
 */
export interface IRecentRewardAwardReader {
  /** The inspector's latest awards, newest period first (the My results history). */
  findRecentByInspector(inspectorId: string, limit: number): Promise<RewardAward[]>;
  /**
   * Non-void awards created at/after `since` (the 48h goal-reached scan). The step
   * filters to ACTIVE inspectors and groups by `(inspectorId, periodEnd)`.
   */
  findRecentNonVoidByCreatedAt(since: Date): Promise<RewardAward[]>;
}
