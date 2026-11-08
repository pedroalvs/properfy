import { describe, expect, it } from 'vitest';
import { rankSnapshots, type RankCandidate } from './ranking';

function scored(name: string, score: number, volume = 10, completedCount = 10, active = true): RankCandidate {
  return {
    inspectorId: name.toLowerCase(),
    inspectorName: name,
    active,
    snapshot: { status: 'SCORED', score, volume, completedCount },
  };
}

describe('rankSnapshots', () => {
  it('ranks SCORED active inspectors by score desc (positions 1..5)', () => {
    const { ranked } = rankSnapshots([
      scored('Eva', 100),
      scored('Fábio', 97.5),
      scored('Dan', 89.0),
      scored('Ana', 88.3),
      scored('Ben', 79.0),
    ]);
    expect(ranked.map((r) => [r.inspectorName, r.position])).toEqual([
      ['Eva', 1],
      ['Fábio', 2],
      ['Dan', 3],
      ['Ana', 4],
      ['Ben', 5],
    ]);
  });

  it('uses competition ranking on ties (1, 2, 2, 4) with name order', () => {
    const { ranked } = rankSnapshots([
      scored('Eva', 100),
      scored('Fábio', 97.5),
      scored('Bia', 97.5),
      scored('Dan', 89.0),
    ]);
    expect(ranked.map((r) => [r.inspectorName, r.position])).toEqual([
      ['Eva', 1],
      ['Bia', 2],
      ['Fábio', 2],
      ['Dan', 4],
    ]);
  });

  it('lists INSUFFICIENT_VOLUME / NO_WEIGHTED_DATA in notEnoughData by volume desc then name', () => {
    const { ranked, notEnoughData } = rankSnapshots([
      scored('Eva', 100),
      { inspectorId: 'carla', inspectorName: 'Carla', active: true, snapshot: { status: 'INSUFFICIENT_VOLUME', score: null, volume: 9, completedCount: 9 } },
      { inspectorId: 'ned', inspectorName: 'Ned', active: true, snapshot: { status: 'NO_WEIGHTED_DATA', score: null, volume: 12, completedCount: 12 } },
      { inspectorId: 'amy', inspectorName: 'Amy', active: true, snapshot: { status: 'INSUFFICIENT_VOLUME', score: null, volume: 12, completedCount: 12 } },
    ]);
    expect(ranked.map((r) => r.inspectorName)).toEqual(['Eva']);
    expect(notEnoughData.map((r) => [r.inspectorName, r.volume, r.status])).toEqual([
      ['Amy', 12, 'INSUFFICIENT_VOLUME'],
      ['Ned', 12, 'NO_WEIGHTED_DATA'],
      ['Carla', 9, 'INSUFFICIENT_VOLUME'],
    ]);
  });

  it('places an active inspector with no snapshot row into notEnoughData (volume 0, INSUFFICIENT_VOLUME)', () => {
    const { ranked, notEnoughData } = rankSnapshots([
      scored('Eva', 100),
      { inspectorId: 'new', inspectorName: 'New Hire', active: true, snapshot: null },
    ]);
    expect(ranked.map((r) => r.inspectorName)).toEqual(['Eva']);
    expect(notEnoughData).toEqual([
      { inspectorId: 'new', inspectorName: 'New Hire', volume: 0, status: 'INSUFFICIENT_VOLUME' },
    ]);
  });

  it('excludes INACTIVE inspectors from both lists', () => {
    const { ranked, notEnoughData } = rankSnapshots([
      scored('Eva', 100),
      scored('Gone', 95, 10, 10, false),
      { inspectorId: 'old', inspectorName: 'Old', active: false, snapshot: { status: 'INSUFFICIENT_VOLUME', score: null, volume: 2, completedCount: 2 } },
    ]);
    expect(ranked.map((r) => r.inspectorName)).toEqual(['Eva']);
    expect(notEnoughData).toEqual([]);
  });

  it('produces one platform-wide list regardless of region (R2)', () => {
    // Candidates carry no region; ranking is a single competition list.
    const { ranked } = rankSnapshots([
      scored('Eva', 100), // region A
      scored('Dan', 89.0), // region A
      scored('Fábio', 97.5), // region B
      scored('Ana', 88.3), // region B
      scored('Ben', 79.0), // region B
    ]);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
    expect(ranked.map((r) => r.inspectorName)).toEqual(['Eva', 'Fábio', 'Dan', 'Ana', 'Ben']);
  });
});
