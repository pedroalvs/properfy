import { createHash } from 'node:crypto';
import { resolveInspectorLevel, type InspectorLevel, type ReliabilityDetailStatus } from '@properfy/shared';

/** Minimum number of ranked inspectors before the leaderboard is shown (DV4). */
export const RANKING_MINIMUM_COHORT = 5;

/**
 * The minimal, structural view of a current-index row the anonymiser needs. A
 * `CurrentIndex` from the reliability reader satisfies this (extra fields ignored).
 */
export interface RankingIndexInput {
  inspectorId: string;
  score: number | null;
  status: ReliabilityDetailStatus;
  /** Platform-wide competition position, or null when the inspector is not ranked. */
  position: number | null;
}

export interface AnonymousRankingEntry {
  position: number;
  score: number;
  level: InspectorLevel | null;
  isMe: boolean;
}

export interface AnonymousRanking {
  myPosition: number | null;
  myScore: number | null;
  totalRanked: number;
  notRankedReason: 'NOT_ENOUGH_DATA' | 'NOT_COMPUTED' | null;
  cohortTooSmall: boolean;
  entries: AnonymousRankingEntry[];
}

export interface BuildAnonymousRankingInput {
  indexes: RankingIndexInput[];
  selfInspectorId: string;
  thresholds: { silverMinScore: number; goldMinScore: number };
  snapshotDate: string | null;
}

/**
 * Builds the anonymous leaderboard (03.A3): the caller's own position/score plus
 * the other inspectors' positions/scores/levels with **no identifying field**.
 * Entries are ordered by competition position, ties broken by a per-day stable
 * hash of `snapshotDate:inspectorId` (never by name or insertion order, DV4). The
 * `inspectorId` is dropped here, before anything is serialised. Below
 * {@link RANKING_MINIMUM_COHORT} ranked inspectors the entry list is empty.
 */
export function buildAnonymousRanking({
  indexes,
  selfInspectorId,
  thresholds,
  snapshotDate,
}: BuildAnonymousRankingInput): AnonymousRanking {
  const ranked = indexes.filter((i) => i.position !== null);
  const totalRanked = ranked.length;

  const self = indexes.find((i) => i.inspectorId === selfInspectorId);
  const myPosition = self?.position ?? null;
  const myScore = self?.score ?? null;

  let notRankedReason: AnonymousRanking['notRankedReason'] = null;
  if (myPosition === null) {
    // No snapshot row at all (or absent from the list) → NOT_COMPUTED; a row that
    // exists but is not scored (insufficient volume / no weighted data) → NOT_ENOUGH_DATA.
    notRankedReason = !self || self.status === 'NOT_COMPUTED' ? 'NOT_COMPUTED' : 'NOT_ENOUGH_DATA';
  }

  const cohortTooSmall = totalRanked < RANKING_MINIMUM_COHORT;

  const entries: AnonymousRankingEntry[] = cohortTooSmall
    ? []
    : [...ranked]
        .sort((a, b) => {
          if (a.position !== b.position) return (a.position as number) - (b.position as number);
          return tieHash(snapshotDate, a.inspectorId).localeCompare(tieHash(snapshotDate, b.inspectorId));
        })
        .map((i) => ({
          position: i.position as number,
          // A ranked inspector is SCORED, so the score is non-null.
          score: i.score as number,
          level: resolveInspectorLevel(i.score, thresholds),
          isMe: i.inspectorId === selfInspectorId,
        }));

  return { myPosition, myScore, totalRanked, notRankedReason, cohortTooSmall, entries };
}

function tieHash(snapshotDate: string | null, inspectorId: string): string {
  return createHash('sha256').update(`${snapshotDate ?? ''}:${inspectorId}`).digest('hex');
}
