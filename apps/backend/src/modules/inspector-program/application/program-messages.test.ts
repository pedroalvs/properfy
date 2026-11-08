import { describe, expect, it } from 'vitest';
import type { SnapshotSettings } from '../../reliability/domain/reliability-snapshot.entity';
import type { RewardAward } from '../domain/reward-award.entity';
import { computeWeightsVersion, groupGoalReachedAwards } from './program-messages';

function award(overrides: Partial<RewardAward>): RewardAward {
  return {
    id: 'a', goalId: 'g', inspectorId: 'i1', periodType: 'WEEKLY', periodStart: '2026-11-02',
    periodEnd: '2026-11-08', goalTitle: 'Goal', metric: 'VOLUME', comparator: 'GTE', target: 10,
    amount: 30, scopeLabel: null, achievedValue: 12, serviceCount: 12, achievedOn: '2026-11-06',
    indexScoreAtClose: 80, levelAtClose: 'SILVER', indexSnapshotDate: '2026-11-08', status: 'PENDING',
    approvedByUserId: null, approvedAt: null, paidAt: null, voidedByUserId: null, voidedAt: null,
    voidReason: null, inspectorNote: null, inspectorInvoiceId: null,
    createdAt: new Date('2026-11-08T04:45:00.000Z'), updatedAt: new Date('2026-11-08T04:45:00.000Z'),
    ...overrides,
  };
}

const ACTIVE = new Set(['i1', 'i2']);

describe('groupGoalReachedAwards', () => {
  it('groups by (inspectorId, periodEnd)', () => {
    const groups = groupGoalReachedAwards(
      [
        award({ id: 'a1', inspectorId: 'i1', periodEnd: '2026-11-08' }),
        award({ id: 'a2', inspectorId: 'i1', periodEnd: '2026-11-15' }),
        award({ id: 'a3', inspectorId: 'i2', periodEnd: '2026-11-08' }),
      ],
      ACTIVE,
    );
    expect(groups).toHaveLength(3);
  });

  it('aggregates same inspector + same period end into one group', () => {
    const groups = groupGoalReachedAwards(
      [
        award({ id: 'a1', inspectorId: 'i1', periodEnd: '2026-11-15', achievedValue: 50 }),
        award({ id: 'a2', inspectorId: 'i1', periodEnd: '2026-11-15', achievedValue: 80 }),
      ],
      ACTIVE,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.awards).toHaveLength(2);
  });

  it('orders a group by P9 (achievedValue desc, index desc nulls last, achievedOn asc, title)', () => {
    const groups = groupGoalReachedAwards(
      [
        award({ id: 'low', achievedValue: 20, goalTitle: 'Low' }),
        award({ id: 'high', achievedValue: 90, goalTitle: 'High' }),
        award({ id: 'mid', achievedValue: 50, goalTitle: 'Mid' }),
      ],
      ACTIVE,
    );
    expect(groups[0]!.awards.map((a) => a.goalTitle)).toEqual(['High', 'Mid', 'Low']);
  });

  it('excludes inactive inspectors and void awards', () => {
    const groups = groupGoalReachedAwards(
      [
        award({ id: 'a1', inspectorId: 'ghost' }),
        award({ id: 'a2', inspectorId: 'i1', status: 'VOID' }),
        award({ id: 'a3', inspectorId: 'i1' }),
      ],
      ACTIVE,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.awards.map((a) => a.id)).toEqual(['a3']);
  });
});

describe('computeWeightsVersion', () => {
  const base: SnapshotSettings = {
    weights: { PUNCTUALITY: 1, GEOFENCE: 1, NO_STUCK: 1, SATISFACTION: 1, LATE_NOTICE: 1, CANT_ATTEND: 1, VOLUME: 1, DONE_REJECTED: 1 },
    minimumVolume: 10,
    minimumRatings: 3,
    toleranceMinutes: 10,
    volumeReference: { value: 9.5, source: 'MEDIAN', activeInspectors: 6, periodDays: 30 },
  };

  it('is stable for identical settings regardless of key order', () => {
    const reordered: SnapshotSettings = {
      ...base,
      weights: { DONE_REJECTED: 1, VOLUME: 1, CANT_ATTEND: 1, LATE_NOTICE: 1, SATISFACTION: 1, NO_STUCK: 1, GEOFENCE: 1, PUNCTUALITY: 1 },
    };
    expect(computeWeightsVersion(base)).toBe(computeWeightsVersion(reordered));
  });

  it('changes when a weight, minimumVolume, toleranceMinutes or volumeReference.source changes', () => {
    expect(computeWeightsVersion({ ...base, weights: { ...base.weights, PUNCTUALITY: 3 } })).not.toBe(computeWeightsVersion(base));
    expect(computeWeightsVersion({ ...base, minimumVolume: 12 })).not.toBe(computeWeightsVersion(base));
    expect(computeWeightsVersion({ ...base, toleranceMinutes: 15 })).not.toBe(computeWeightsVersion(base));
    expect(
      computeWeightsVersion({ ...base, volumeReference: { ...base.volumeReference, source: 'OVERRIDE' } }),
    ).not.toBe(computeWeightsVersion(base));
  });

  it('does not change when only the volume-reference value or minimumRatings changes (data, not tuning)', () => {
    expect(computeWeightsVersion({ ...base, volumeReference: { ...base.volumeReference, value: 10 } })).toBe(
      computeWeightsVersion(base),
    );
    expect(computeWeightsVersion({ ...base, minimumRatings: 5 })).toBe(computeWeightsVersion(base));
  });
});
