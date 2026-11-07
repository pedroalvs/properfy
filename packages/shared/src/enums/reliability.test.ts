import { describe, it, expect } from 'vitest';
import {
  ReliabilityMetricKey,
  RELIABILITY_METRIC_KEYS,
  RELIABILITY_METRIC_LABELS,
  RELIABILITY_METRIC_DESCRIPTIONS,
  ReliabilityScoreStatus,
  RELIABILITY_WINDOW_DAYS,
  RELIABILITY_TRAVEL_FACTOR,
  CANT_ATTEND_EARLY_NOTICE_HOURS,
  RELIABILITY_FAILURES_MAX,
} from './reliability';

describe('ReliabilityMetricKey', () => {
  it('has exactly the 8 keys in canonical order', () => {
    expect(RELIABILITY_METRIC_KEYS).toEqual([
      'PUNCTUALITY',
      'GEOFENCE',
      'NO_STUCK',
      'SATISFACTION',
      'LATE_NOTICE',
      'CANT_ATTEND',
      'VOLUME',
      'DONE_REJECTED',
    ]);
    expect(RELIABILITY_METRIC_KEYS).toHaveLength(8);
  });

  it('each key maps to itself in the const object', () => {
    for (const key of RELIABILITY_METRIC_KEYS) {
      expect(ReliabilityMetricKey[key]).toBe(key);
    }
    expect(Object.values(ReliabilityMetricKey)).toEqual([...RELIABILITY_METRIC_KEYS]);
  });

  it('has a non-empty label and description for all 8 keys', () => {
    expect(Object.keys(RELIABILITY_METRIC_LABELS)).toHaveLength(8);
    expect(Object.keys(RELIABILITY_METRIC_DESCRIPTIONS)).toHaveLength(8);
    for (const key of RELIABILITY_METRIC_KEYS) {
      expect(RELIABILITY_METRIC_LABELS[key]).toBeTruthy();
      expect(RELIABILITY_METRIC_DESCRIPTIONS[key]).toBeTruthy();
    }
  });
});

describe('ReliabilityScoreStatus', () => {
  it('exposes the three statuses this slice emits', () => {
    expect(ReliabilityScoreStatus.SCORED).toBe('SCORED');
    expect(ReliabilityScoreStatus.INSUFFICIENT_VOLUME).toBe('INSUFFICIENT_VOLUME');
    expect(ReliabilityScoreStatus.NO_WEIGHTED_DATA).toBe('NO_WEIGHTED_DATA');
  });
});

describe('reliability constants', () => {
  it('pins the window, travel factor, early-notice window and failures cap', () => {
    expect(RELIABILITY_WINDOW_DAYS).toBe(30);
    expect(RELIABILITY_TRAVEL_FACTOR).toBe(1);
    expect(CANT_ATTEND_EARLY_NOTICE_HOURS).toBe(24);
    expect(RELIABILITY_FAILURES_MAX).toBe(20);
  });
});
