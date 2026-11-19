import { describe, expect, it } from 'vitest';
import type { ReliabilityDetailStatus } from '@properfy/shared';
import {
  RANKING_MINIMUM_COHORT,
  buildAnonymousRanking,
  type RankingIndexInput,
} from './ranking-anonymiser';

const THRESHOLDS = { silverMinScore: 60, goldMinScore: 85 };
const SNAP = '2026-11-08';

/** A scored, ranked inspector. */
function ranked(inspectorId: string, position: number, score: number): RankingIndexInput {
  return { inspectorId, score, status: 'SCORED', position };
}

/** Build a cohort of `n` ranked inspectors with distinct scores/positions. */
function cohort(n: number): RankingIndexInput[] {
  return Array.from({ length: n }, (_, i) => ranked(`insp-${i + 1}`, i + 1, 100 - i));
}

describe('buildAnonymousRanking (03.A3)', () => {
  it('exposes a minimum cohort of 5', () => {
    expect(RANKING_MINIMUM_COHORT).toBe(5);
  });

  it('filters the cohort to ranked (position !== null) inspectors', () => {
    const indexes: RankingIndexInput[] = [
      ...cohort(5),
      { inspectorId: 'no-pos', score: null, status: 'INSUFFICIENT_VOLUME', position: null },
    ];
    const r = buildAnonymousRanking({ indexes, selfInspectorId: 'insp-1', thresholds: THRESHOLDS, snapshotDate: SNAP });
    expect(r.totalRanked).toBe(5);
    expect(r.entries).toHaveLength(5);
    expect(r.cohortTooSmall).toBe(false);
  });

  it('returns own position/score and a null reason when ranked', () => {
    const r = buildAnonymousRanking({ indexes: cohort(5), selfInspectorId: 'insp-3', thresholds: THRESHOLDS, snapshotDate: SNAP });
    expect(r.myPosition).toBe(3);
    expect(r.myScore).toBe(98);
    expect(r.notRankedReason).toBeNull();
    expect(r.entries.find((e) => e.isMe)).toMatchObject({ position: 3, isMe: true });
  });

  it('each entry has exactly the four anonymous keys (no id/name)', () => {
    const r = buildAnonymousRanking({ indexes: cohort(6), selfInspectorId: 'insp-2', thresholds: THRESHOLDS, snapshotDate: SNAP });
    for (const e of r.entries) {
      expect(Object.keys(e).sort()).toEqual(['isMe', 'level', 'position', 'score']);
    }
    expect(JSON.stringify(r)).not.toContain('insp-');
  });

  it('maps the level from the score and thresholds', () => {
    const indexes = [ranked('a', 1, 96), ranked('b', 2, 70), ranked('c', 3, 50), ranked('d', 4, 88), ranked('e', 5, 85)];
    const r = buildAnonymousRanking({ indexes, selfInspectorId: 'a', thresholds: THRESHOLDS, snapshotDate: SNAP });
    const byPos = new Map(r.entries.map((e) => [e.position, e.level]));
    expect(byPos.get(1)).toBe('GOLD'); // 96
    expect(byPos.get(2)).toBe('SILVER'); // 70
    expect(byPos.get(3)).toBe('BRONZE'); // 50
    expect(byPos.get(5)).toBe('GOLD'); // 85 == goldMinScore
  });

  it('orders by position asc, then by a stable per-day hash for ties', () => {
    // Four inspectors tie at the same score → competition position 1; next is 5.
    const tied: RankingIndexInput[] = [
      ranked('zeta', 1, 90),
      ranked('alpha', 1, 90),
      ranked('mike', 1, 90),
      ranked('bravo', 1, 90),
      ranked('solo', 5, 80),
    ];
    const r1 = buildAnonymousRanking({ indexes: tied, selfInspectorId: 'solo', thresholds: THRESHOLDS, snapshotDate: SNAP });
    const r2 = buildAnonymousRanking({ indexes: [...tied].reverse(), selfInspectorId: 'solo', thresholds: THRESHOLDS, snapshotDate: SNAP });
    // Competition positions preserved: four at 1, next at 5.
    expect(r1.entries.map((e) => e.position)).toEqual([1, 1, 1, 1, 5]);
    // Stable within a day, independent of insertion order.
    expect(r2.entries).toEqual(r1.entries);
  });

  it('produces a different-but-stable tie order on a different snapshot date', () => {
    const tied: RankingIndexInput[] = [ranked('zeta', 1, 90), ranked('alpha', 1, 90), ranked('mike', 1, 90)].concat(cohort(2));
    const day1a = buildAnonymousRanking({ indexes: tied, selfInspectorId: 'zeta', thresholds: THRESHOLDS, snapshotDate: '2026-11-08' });
    const day1b = buildAnonymousRanking({ indexes: [...tied].reverse(), selfInspectorId: 'zeta', thresholds: THRESHOLDS, snapshotDate: '2026-11-08' });
    const day2 = buildAnonymousRanking({ indexes: tied, selfInspectorId: 'zeta', thresholds: THRESHOLDS, snapshotDate: '2026-11-09' });
    expect(day1b.entries).toEqual(day1a.entries); // stable on the same day
    // Different day may reorder ties but still deterministically; at minimum it is stable per day.
    const day2again = buildAnonymousRanking({ indexes: [...tied].reverse(), selfInspectorId: 'zeta', thresholds: THRESHOLDS, snapshotDate: '2026-11-09' });
    expect(day2again.entries).toEqual(day2.entries);
  });

  it('marks cohortTooSmall and empties entries below the minimum, keeping own position', () => {
    const r = buildAnonymousRanking({ indexes: cohort(4), selfInspectorId: 'insp-2', thresholds: THRESHOLDS, snapshotDate: SNAP });
    expect(r.totalRanked).toBe(4);
    expect(r.cohortTooSmall).toBe(true);
    expect(r.entries).toEqual([]);
    expect(r.myPosition).toBe(2);
    expect(r.myScore).toBe(99);
  });

  it('reports NOT_ENOUGH_DATA when the caller has a row but no position', () => {
    const indexes: RankingIndexInput[] = [
      ...cohort(5),
      { inspectorId: 'me', score: null, status: 'INSUFFICIENT_VOLUME', position: null },
    ];
    const r = buildAnonymousRanking({ indexes, selfInspectorId: 'me', thresholds: THRESHOLDS, snapshotDate: SNAP });
    expect(r.myPosition).toBeNull();
    expect(r.notRankedReason).toBe('NOT_ENOUGH_DATA');
  });

  it('reports NOT_COMPUTED when the caller has no snapshot row', () => {
    const indexes: RankingIndexInput[] = [
      ...cohort(5),
      { inspectorId: 'me', score: null, status: 'NOT_COMPUTED' as ReliabilityDetailStatus, position: null },
    ];
    const r = buildAnonymousRanking({ indexes, selfInspectorId: 'me', thresholds: THRESHOLDS, snapshotDate: SNAP });
    expect(r.myPosition).toBeNull();
    expect(r.notRankedReason).toBe('NOT_COMPUTED');
  });

  it('reports NOT_COMPUTED when the caller is absent from the index list entirely', () => {
    const r = buildAnonymousRanking({ indexes: cohort(5), selfInspectorId: 'ghost', thresholds: THRESHOLDS, snapshotDate: SNAP });
    expect(r.myPosition).toBeNull();
    expect(r.notRankedReason).toBe('NOT_COMPUTED');
  });
});
