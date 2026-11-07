import { describe, it, expect } from 'vitest';
import {
  RELIABILITY_METRIC_KEYS,
  type ReliabilityIndexSetting,
  type ReliabilityMetricKey,
  type ReliabilityMetricResult,
} from '@properfy/shared';
import { computeReliabilityScore, roundHalfUp } from './score';

function metricResult(metric: ReliabilityMetricKey, rate: number | null): ReliabilityMetricResult {
  return {
    metric,
    rate,
    eligibleCount: 0,
    successCount: null,
    averageRating: null,
    volumeReference: null,
    weightedSuccess: 0,
    weightedEligible: 0,
    volume: 0,
    activeDays: null,
    failureCount: 0,
    failures: [],
  };
}

function resultsFrom(rates: Partial<Record<ReliabilityMetricKey, number | null>>): ReliabilityMetricResult[] {
  return RELIABILITY_METRIC_KEYS.map((k) => metricResult(k, k in rates ? (rates[k] ?? null) : 1));
}

const equalWeights = {
  PUNCTUALITY: 1,
  GEOFENCE: 1,
  NO_STUCK: 1,
  SATISFACTION: 1,
  LATE_NOTICE: 1,
  CANT_ATTEND: 1,
  VOLUME: 1,
  DONE_REJECTED: 1,
} as const;

function settings(overrides: Partial<ReliabilityIndexSetting> = {}): ReliabilityIndexSetting {
  return {
    weights: { ...equalWeights },
    minimumVolume: 10,
    volumeReferenceOverride: null,
    minimumRatings: 3,
    ...overrides,
  };
}

const ana = resultsFrom({
  PUNCTUALITY: 0.8333,
  GEOFENCE: 0.9167,
  NO_STUCK: 1,
  SATISFACTION: 0.8125,
  LATE_NOTICE: 0.5,
  CANT_ATTEND: 1,
  VOLUME: 1,
  DONE_REJECTED: 1,
});

describe('computeReliabilityScore — worked examples', () => {
  it('Ana with equal weights → 88.3', () => {
    expect(computeReliabilityScore(ana, settings(), 12)).toEqual({ status: 'SCORED', score: 88.3 });
  });

  it('Ana with PUNCTUALITY weight 3 → 87.3 (the score follows the weights, 03.A1)', () => {
    const s = settings({ weights: { ...equalWeights, PUNCTUALITY: 3 } });
    expect(computeReliabilityScore(ana, s, 12).score).toBe(87.3);
  });

  it('Ana with VOLUME weight 0 → 86.6', () => {
    const s = settings({ weights: { ...equalWeights, VOLUME: 0 } });
    expect(computeReliabilityScore(ana, s, 12).score).toBe(86.6);
  });

  it('Ana with volume override 20 (VOLUME rate 0.6) → 83.3', () => {
    const anaOverride = resultsFrom({
      PUNCTUALITY: 0.8333,
      GEOFENCE: 0.9167,
      NO_STUCK: 1,
      SATISFACTION: 0.8125,
      LATE_NOTICE: 0.5,
      CANT_ATTEND: 1,
      VOLUME: 0.6,
      DONE_REJECTED: 1,
    });
    expect(computeReliabilityScore(anaOverride, settings(), 12).score).toBe(83.3);
  });

  it('Ben (SATISFACTION null) → 79.0', () => {
    const ben = resultsFrom({
      PUNCTUALITY: 0.5333,
      GEOFENCE: 1,
      NO_STUCK: 1,
      SATISFACTION: null,
      LATE_NOTICE: 0,
      CANT_ATTEND: 1,
      VOLUME: 1,
      DONE_REJECTED: 1,
    });
    expect(computeReliabilityScore(ben, settings(), 10).score).toBe(79.0);
  });

  it('Dan (SATISFACTION and LATE_NOTICE null) → 89.0', () => {
    const dan = resultsFrom({
      PUNCTUALITY: 0.7,
      GEOFENCE: 1,
      NO_STUCK: 1,
      SATISFACTION: null,
      LATE_NOTICE: null,
      CANT_ATTEND: 0.8,
      VOLUME: 0.8421,
      DONE_REJECTED: 1,
    });
    expect(computeReliabilityScore(dan, settings(), 10).score).toBe(89.0);
  });

  it('Eva → 100', () => {
    const eva = resultsFrom({ SATISFACTION: null, LATE_NOTICE: null });
    expect(computeReliabilityScore(eva, settings(), 10).score).toBe(100);
  });

  it('Fábio → 97.5', () => {
    const fabio = resultsFrom({
      SATISFACTION: null,
      LATE_NOTICE: null,
      VOLUME: 0.9474,
      DONE_REJECTED: 0.9,
    });
    expect(computeReliabilityScore(fabio, settings(), 10).score).toBe(97.5);
  });

  it('Gil (9 DONE + 1 no-show, universe 10) → 95.8', () => {
    const gil = resultsFrom({
      PUNCTUALITY: 0.9,
      GEOFENCE: 1,
      NO_STUCK: 1,
      SATISFACTION: null,
      LATE_NOTICE: null,
      CANT_ATTEND: 0.9,
      VOLUME: 0.9474,
      DONE_REJECTED: 1,
    });
    // Volume is the universe size (9 DONE + 1 NO_SHOW_REJECTED), so Gil is SCORED.
    expect(computeReliabilityScore(gil, settings(), 10).score).toBe(95.8);
  });

  it('Eva + 3 ratings (SATISFACTION 0.6667) → 95.2', () => {
    const eva3 = resultsFrom({ SATISFACTION: 0.6667, LATE_NOTICE: null });
    expect(computeReliabilityScore(eva3, settings(), 10).score).toBe(95.2);
  });
});

describe('computeReliabilityScore — statuses', () => {
  it('is INSUFFICIENT_VOLUME below minimumVolume (Carla, 9 < 10)', () => {
    expect(computeReliabilityScore(resultsFrom({}), settings(), 9)).toEqual({
      status: 'INSUFFICIENT_VOLUME',
      score: null,
    });
  });

  it('scores Carla when minimumVolume is lowered to 9', () => {
    expect(computeReliabilityScore(resultsFrom({}), settings({ minimumVolume: 9 }), 9).status).toBe('SCORED');
  });

  it('is NO_WEIGHTED_DATA when the only weighted metric has a null rate', () => {
    const onlySatisfaction = {
      ...equalWeights,
      PUNCTUALITY: 0,
      GEOFENCE: 0,
      NO_STUCK: 0,
      SATISFACTION: 1,
      LATE_NOTICE: 0,
      CANT_ATTEND: 0,
      VOLUME: 0,
      DONE_REJECTED: 0,
    };
    const noSurveys = resultsFrom({ SATISFACTION: null });
    expect(computeReliabilityScore(noSurveys, settings({ weights: onlySatisfaction }), 20)).toEqual({
      status: 'NO_WEIGHTED_DATA',
      score: null,
    });
  });
});

describe('roundHalfUp', () => {
  it('rounds the final score half-up at 1 decimal', () => {
    expect(roundHalfUp(78.25, 1)).toBe(78.3);
    expect(roundHalfUp(78.2499, 1)).toBe(78.2);
    expect(roundHalfUp(100, 1)).toBe(100);
    expect(roundHalfUp(0, 1)).toBe(0);
  });

  it('rounds rates half-up at 4 decimals', () => {
    expect(roundHalfUp(10 / 12, 4)).toBe(0.8333);
    expect(roundHalfUp(11 / 12, 4)).toBe(0.9167);
    expect(roundHalfUp(8 / 9.5, 4)).toBe(0.8421);
  });
});
