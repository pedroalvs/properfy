import { describe, expect, it } from 'vitest';
import {
  CLOSE_CATCH_UP_MAX_PERIODS,
  GOAL_METRIC_COMPARATOR,
  GOAL_METRIC_KIND,
  GOAL_METRIC_LABELS,
  GOAL_METRIC_RELIABILITY_KEY,
  GOAL_METRICS,
  GOAL_RATE_MINIMUM_VOLUME,
  GoalMetric,
  INSPECTOR_LEVEL_LABELS,
  InspectorLevel,
  REWARD_AWARD_STATUS_LABELS,
  RewardAwardStatus,
  UPCOMING_GOAL_LOOKAHEAD_DAYS,
} from './inspector-program';

describe('GoalMetric', () => {
  it('is exactly the ten metrics in canonical order', () => {
    expect(GOAL_METRICS).toEqual([
      'VOLUME',
      'REGION_VOLUME',
      'SERVICE_TYPE_VOLUME',
      'INDEX_AT_LEAST',
      'PUNCTUALITY',
      'GEOFENCE',
      'NO_STUCK',
      'SATISFACTION',
      'LATE_NOTICE',
      'CANT_DO_MAX',
    ]);
    expect(Object.values(GoalMetric).sort()).toEqual([...GOAL_METRICS].sort());
  });
});

describe('GOAL_METRIC_COMPARATOR', () => {
  it('is LTE only for CANT_DO_MAX, GTE for the other nine', () => {
    expect(GOAL_METRIC_COMPARATOR.CANT_DO_MAX).toBe('LTE');
    for (const metric of GOAL_METRICS) {
      if (metric === 'CANT_DO_MAX') continue;
      expect(GOAL_METRIC_COMPARATOR[metric]).toBe('GTE');
    }
  });
});

describe('GOAL_METRIC_RELIABILITY_KEY', () => {
  it('maps rate metrics to their reliability key and volume/index to null', () => {
    expect(GOAL_METRIC_RELIABILITY_KEY.PUNCTUALITY).toBe('PUNCTUALITY');
    expect(GOAL_METRIC_RELIABILITY_KEY.GEOFENCE).toBe('GEOFENCE');
    expect(GOAL_METRIC_RELIABILITY_KEY.NO_STUCK).toBe('NO_STUCK');
    expect(GOAL_METRIC_RELIABILITY_KEY.SATISFACTION).toBe('SATISFACTION');
    expect(GOAL_METRIC_RELIABILITY_KEY.LATE_NOTICE).toBe('LATE_NOTICE');
    expect(GOAL_METRIC_RELIABILITY_KEY.CANT_DO_MAX).toBe('CANT_ATTEND');
    expect(GOAL_METRIC_RELIABILITY_KEY.VOLUME).toBeNull();
    expect(GOAL_METRIC_RELIABILITY_KEY.REGION_VOLUME).toBeNull();
    expect(GOAL_METRIC_RELIABILITY_KEY.SERVICE_TYPE_VOLUME).toBeNull();
    expect(GOAL_METRIC_RELIABILITY_KEY.INDEX_AT_LEAST).toBeNull();
  });
});

describe('GOAL_METRIC_KIND', () => {
  it('classifies three volumes, one index, six rates', () => {
    expect(GOAL_METRIC_KIND.VOLUME).toBe('VOLUME');
    expect(GOAL_METRIC_KIND.REGION_VOLUME).toBe('VOLUME');
    expect(GOAL_METRIC_KIND.SERVICE_TYPE_VOLUME).toBe('VOLUME');
    expect(GOAL_METRIC_KIND.INDEX_AT_LEAST).toBe('INDEX');
    const rates = GOAL_METRICS.filter((m) => GOAL_METRIC_KIND[m] === 'RATE');
    expect(rates).toEqual(['PUNCTUALITY', 'GEOFENCE', 'NO_STUCK', 'SATISFACTION', 'LATE_NOTICE', 'CANT_DO_MAX']);
  });
});

describe('labels', () => {
  it('cover every metric, status and level', () => {
    for (const metric of GOAL_METRICS) expect(GOAL_METRIC_LABELS[metric]).toBeTruthy();
    for (const status of Object.values(RewardAwardStatus)) expect(REWARD_AWARD_STATUS_LABELS[status]).toBeTruthy();
    for (const level of Object.values(InspectorLevel)) expect(INSPECTOR_LEVEL_LABELS[level]).toBeTruthy();
  });
});

describe('constants', () => {
  it('fixes the documented values', () => {
    expect(GOAL_RATE_MINIMUM_VOLUME).toBe(10);
    expect(CLOSE_CATCH_UP_MAX_PERIODS).toBe(8);
    expect(UPCOMING_GOAL_LOOKAHEAD_DAYS).toBe(7);
  });
});
