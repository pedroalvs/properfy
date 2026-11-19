import type { ReliabilityScoreStatus } from '@properfy/shared';

/** The snapshot facts the ranking needs from one inspector's latest row. */
export interface RankSnapshotFacts {
  status: ReliabilityScoreStatus;
  score: number | null;
  volume: number;
  completedCount: number;
}

/**
 * One inspector considered for the ranking: the latest-snapshot row (or `null`
 * when the inspector has no row yet — created after the last compute) plus the
 * live `active` flag. INACTIVE inspectors are dropped entirely.
 */
export interface RankCandidate {
  inspectorId: string;
  inspectorName: string;
  active: boolean;
  snapshot: RankSnapshotFacts | null;
}

export interface RankedInspector {
  position: number;
  inspectorId: string;
  inspectorName: string;
  score: number;
  volume: number;
  completedCount: number;
}

export interface NotEnoughDataInspector {
  inspectorId: string;
  inspectorName: string;
  volume: number;
  status: 'INSUFFICIENT_VOLUME' | 'NO_WEIGHTED_DATA';
}

export interface RankResult {
  ranked: RankedInspector[];
  notEnoughData: NotEnoughDataInspector[];
}

function byName(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Builds the platform-wide reliability ranking (R2) from the latest snapshot's
 * candidates. `ranked` holds the SCORED active inspectors by score desc with a
 * **competition ranking** (ties share a position, next rank skips: 1, 2, 2, 4),
 * ties ordered by name; `notEnoughData` holds the active inspectors below the
 * minimum (or with no weighted data, or no row yet) by volume desc then name.
 * Pure — region/service-type/agency never enter (the position is one platform list).
 */
export function rankSnapshots(candidates: RankCandidate[]): RankResult {
  const active = candidates.filter((c) => c.active);

  const scored = active
    .filter((c): c is RankCandidate & { snapshot: RankSnapshotFacts & { score: number } } =>
      c.snapshot?.status === 'SCORED' && c.snapshot.score !== null,
    )
    .sort((a, b) => b.snapshot.score - a.snapshot.score || byName(a.inspectorName, b.inspectorName));

  // Competition ranking: a tie shares the previous row's position; the next distinct
  // score jumps to its ordinal (1, 2, 2, 4).
  const ranked: RankedInspector[] = [];
  scored.forEach((c, i) => {
    const prev = i > 0 ? scored[i - 1] : undefined;
    const prevRanked = ranked[i - 1];
    const position = prev && prevRanked && prev.snapshot.score === c.snapshot.score ? prevRanked.position : i + 1;
    ranked.push({
      position,
      inspectorId: c.inspectorId,
      inspectorName: c.inspectorName,
      score: c.snapshot.score,
      volume: c.snapshot.volume,
      completedCount: c.snapshot.completedCount,
    });
  });

  const notEnoughData: NotEnoughDataInspector[] = active
    .filter((c) => c.snapshot === null || c.snapshot.status !== 'SCORED')
    .map((c): NotEnoughDataInspector => ({
      inspectorId: c.inspectorId,
      inspectorName: c.inspectorName,
      volume: c.snapshot?.volume ?? 0,
      status: c.snapshot?.status === 'NO_WEIGHTED_DATA' ? 'NO_WEIGHTED_DATA' : 'INSUFFICIENT_VOLUME',
    }))
    .sort((a, b) => b.volume - a.volume || byName(a.inspectorName, b.inspectorName));

  return { ranked, notEnoughData };
}

/**
 * The competition position of one inspector within the platform-wide ranking of
 * the same candidate set (R2) — identical to the `position` `rankSnapshots`
 * assigns. Returns `null` when the inspector is not SCORED/active. `rankedCount`
 * is the number of SCORED active inspectors.
 */
export function positionOf(
  candidates: RankCandidate[],
  inspectorId: string,
): { position: number | null; rankedCount: number } {
  const { ranked } = rankSnapshots(candidates);
  const found = ranked.find((r) => r.inspectorId === inspectorId);
  return { position: found?.position ?? null, rankedCount: ranked.length };
}
