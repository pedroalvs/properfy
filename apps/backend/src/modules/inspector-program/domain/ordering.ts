import type { GoalComparator } from '@properfy/shared';
import type { CivilDate } from './goal.entity';

/** The award fields the ranking comparator reads (P9). */
export interface RankableAward {
  comparator: GoalComparator;
  achievedValue: number;
  indexScoreAtClose: number | null;
  achievedOn: CivilDate;
  inspectorId: string;
}

/**
 * Order awards of one goal/period for the AM/OP panel and export (P9): best value
 * first (higher for `GTE`, lower for `CANT_DO_MAX`), then index score desc (null
 * last), then `achievedOn` asc, then `inspectorId` asc. Ordering only — there is
 * no winner cap.
 */
export function compareAwardsForRanking(a: RankableAward, b: RankableAward): number {
  if (a.achievedValue !== b.achievedValue) {
    return a.comparator === 'LTE'
      ? a.achievedValue - b.achievedValue // lower is better
      : b.achievedValue - a.achievedValue; // higher is better
  }
  if (a.indexScoreAtClose !== b.indexScoreAtClose) {
    if (a.indexScoreAtClose === null) return 1; // nulls last
    if (b.indexScoreAtClose === null) return -1;
    return b.indexScoreAtClose - a.indexScoreAtClose; // desc
  }
  if (a.achievedOn !== b.achievedOn) return a.achievedOn < b.achievedOn ? -1 : 1; // asc
  if (a.inspectorId !== b.inspectorId) return a.inspectorId < b.inspectorId ? -1 : 1; // asc
  return 0;
}
