import { createHash } from 'node:crypto';
import type { SnapshotSettings } from '../../reliability/domain/reliability-snapshot.entity';
import type { CivilDate } from '../domain/goal.entity';
import type { RewardAward } from '../domain/reward-award.entity';

/** Non-void awards of one inspector that closed for the same period end (L-F08-01). */
export interface GoalReachedGroup {
  inspectorId: string;
  periodEnd: CivilDate;
  /** Ordered by the P9 ranking so the aggregated message lists titles deterministically. */
  awards: RewardAward[];
}

/**
 * Groups non-void awards by `(inspectorId, periodEnd)`, keeping only ACTIVE inspectors,
 * and orders each group by P9 (achieved value desc, index desc with nulls last, achieved
 * date asc, then title). One group → one "goal reached" notice.
 */
export function groupGoalReachedAwards(
  awards: RewardAward[],
  activeInspectorIds: Set<string>,
): GoalReachedGroup[] {
  const groups = new Map<string, GoalReachedGroup>();
  for (const a of awards) {
    if (a.status === 'VOID') continue;
    if (!activeInspectorIds.has(a.inspectorId)) continue;
    const key = `${a.inspectorId}|${a.periodEnd}`;
    const group = groups.get(key) ?? { inspectorId: a.inspectorId, periodEnd: a.periodEnd, awards: [] };
    group.awards.push(a);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.awards.sort(compareByP9);
  return [...groups.values()];
}

function compareByP9(a: RewardAward, b: RewardAward): number {
  if (b.achievedValue !== a.achievedValue) return b.achievedValue - a.achievedValue;
  if (a.indexScoreAtClose !== b.indexScoreAtClose) {
    if (a.indexScoreAtClose === null) return 1;
    if (b.indexScoreAtClose === null) return -1;
    return b.indexScoreAtClose - a.indexScoreAtClose;
  }
  if (a.achievedOn !== b.achievedOn) return a.achievedOn < b.achievedOn ? -1 : 1;
  return a.goalTitle < b.goalTitle ? -1 : a.goalTitle > b.goalTitle ? 1 : 0;
}

/**
 * A stable fingerprint of the index tuning that affects the score (L-F08-06): the
 * weights, the minimum volume, the tolerance and the volume-reference *source*. A
 * change here means the score moved because the rules changed, not the inspector's
 * work, so a level-change crossing between the two days is suppressed. The volume
 * reference *value* and `minimumRatings` are deliberately excluded — a data shift,
 * not a tuning change.
 */
export function computeWeightsVersion(settings: SnapshotSettings): string {
  const weights = Object.keys(settings.weights)
    .sort()
    .map((k) => `${k}:${settings.weights[k as keyof typeof settings.weights]}`)
    .join(',');
  const payload = [
    weights,
    `minVolume:${settings.minimumVolume}`,
    `tolerance:${settings.toleranceMinutes}`,
    `volumeSource:${settings.volumeReference.source}`,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
