import { describe, expect, it } from 'vitest';
import { compareAwardsForRanking, type RankableAward } from './ordering';

const award = (over: Partial<RankableAward>): RankableAward => ({
  comparator: 'GTE',
  achievedValue: 10,
  indexScoreAtClose: 80,
  achievedOn: '2026-11-10',
  inspectorId: 'a',
  ...over,
});

const sortIds = (awards: RankableAward[]) =>
  [...awards].sort(compareAwardsForRanking).map((a) => a.inspectorId);

describe('compareAwardsForRanking', () => {
  it('GTE: higher value first', () => {
    expect(sortIds([award({ inspectorId: 'low', achievedValue: 5 }), award({ inspectorId: 'high', achievedValue: 9 })])).toEqual([
      'high',
      'low',
    ]);
  });

  it('CANT_DO_MAX (LTE): lower value first', () => {
    const opts = { comparator: 'LTE' as const };
    expect(
      sortIds([award({ ...opts, inspectorId: 'high', achievedValue: 9 }), award({ ...opts, inspectorId: 'low', achievedValue: 5 })]),
    ).toEqual(['low', 'high']);
  });

  it('ties break by index score desc, nulls last', () => {
    expect(
      sortIds([
        award({ inspectorId: 'null', indexScoreAtClose: null }),
        award({ inspectorId: 'low', indexScoreAtClose: 70 }),
        award({ inspectorId: 'high', indexScoreAtClose: 90 }),
      ]),
    ).toEqual(['high', 'low', 'null']);
  });

  it('then by achievedOn asc, then inspectorId asc', () => {
    expect(
      sortIds([
        award({ inspectorId: 'z', achievedOn: '2026-11-05' }),
        award({ inspectorId: 'a', achievedOn: '2026-11-05' }),
        award({ inspectorId: 'early', achievedOn: '2026-11-01' }),
      ]),
    ).toEqual(['early', 'a', 'z']);
  });
});
