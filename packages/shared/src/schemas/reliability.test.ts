import { describe, expect, it } from 'vitest';
import {
  inspectorReliabilityParamsSchema,
  inspectorReliabilityResponseSchema,
  reliabilityRankingResponseSchema,
} from './reliability';
import { RELIABILITY_METRIC_KEYS } from '../enums/reliability';

function metricResult(overrides: Record<string, unknown> = {}) {
  return {
    metric: 'PUNCTUALITY',
    rate: 0.95,
    eligibleCount: 10,
    successCount: 9,
    averageRating: null,
    volumeReference: null,
    weightedSuccess: 540,
    weightedEligible: 600,
    volume: 10,
    activeDays: null,
    failureCount: 1,
    failures: [{ appointmentId: '11111111-1111-1111-1111-111111111111', serviceDate: '2026-11-20', detail: 'Late' }],
    weight: 1,
    ...overrides,
  };
}

const rankingExample = {
  snapshotDate: '2026-12-01',
  windowFrom: '2026-11-01',
  windowTo: '2026-11-30',
  computedAt: '2026-11-30T17:15:04.000Z',
  isStale: false,
  settingsUpdatedAt: null,
  minimumVolume: 10,
  volumeReference: 9.5,
  volumeReferenceSource: 'MEDIAN' as const,
  ranked: [
    { position: 1, inspectorId: '11111111-1111-1111-1111-111111111111', inspectorName: 'Eva', score: 100, volume: 10, completedCount: 10 },
  ],
  notEnoughData: [
    { inspectorId: '22222222-2222-2222-2222-222222222222', inspectorName: 'Carla', volume: 9, status: 'INSUFFICIENT_VOLUME' as const },
  ],
};

const detailExample = {
  inspectorId: '11111111-1111-1111-1111-111111111111',
  inspectorName: 'Ana',
  inspectorStatus: 'ACTIVE' as const,
  status: 'SCORED' as const,
  snapshotDate: '2026-12-01',
  windowFrom: '2026-11-01',
  windowTo: '2026-11-30',
  computedAt: '2026-11-30T17:15:04.000Z',
  isStale: false,
  settingsUpdatedAt: null,
  score: 88.3,
  position: 4,
  rankedCount: 5,
  volume: 12,
  completedCount: 12,
  minimumVolume: 10,
  minimumRatings: 3,
  volumeReference: 9.5,
  volumeReferenceSource: 'MEDIAN' as const,
  metrics: RELIABILITY_METRIC_KEYS.map((metric) => metricResult({ metric })),
};

describe('reliabilityRankingResponseSchema', () => {
  it('accepts the documented ranking example', () => {
    expect(() => reliabilityRankingResponseSchema.parse(rankingExample)).not.toThrow();
  });

  it('accepts an empty ranking with null snapshot metadata', () => {
    expect(() =>
      reliabilityRankingResponseSchema.parse({
        snapshotDate: null,
        windowFrom: null,
        windowTo: null,
        computedAt: null,
        isStale: false,
        settingsUpdatedAt: null,
        minimumVolume: 10,
        volumeReference: null,
        volumeReferenceSource: null,
        ranked: [],
        notEnoughData: [],
      }),
    ).not.toThrow();
  });

  it('rejects a ranked score out of 0–100', () => {
    const bad = { ...rankingExample, ranked: [{ ...rankingExample.ranked[0], score: 101 }] };
    expect(() => reliabilityRankingResponseSchema.parse(bad)).toThrow();
  });

  it('rejects position 0', () => {
    const bad = { ...rankingExample, ranked: [{ ...rankingExample.ranked[0], position: 0 }] };
    expect(() => reliabilityRankingResponseSchema.parse(bad)).toThrow();
  });

  it('requires isStale and settingsUpdatedAt', () => {
    const { isStale: _i, ...noStale } = rankingExample;
    expect(() => reliabilityRankingResponseSchema.parse(noStale)).toThrow();
    const { settingsUpdatedAt: _s, ...noSettings } = rankingExample;
    expect(() => reliabilityRankingResponseSchema.parse(noSettings)).toThrow();
  });
});

describe('inspectorReliabilityResponseSchema', () => {
  it('accepts the SCORED detail example', () => {
    expect(() => inspectorReliabilityResponseSchema.parse(detailExample)).not.toThrow();
  });

  it('accepts NOT_COMPUTED with an empty metrics array', () => {
    expect(() =>
      inspectorReliabilityResponseSchema.parse({
        ...detailExample,
        status: 'NOT_COMPUTED',
        score: null,
        position: null,
        rankedCount: 5,
        volume: 0,
        completedCount: 0,
        volumeReference: null,
        volumeReferenceSource: null,
        metrics: [],
      }),
    ).not.toThrow();
  });

  it('rejects a metric with more than 20 failures', () => {
    const failures = Array.from({ length: 21 }, (_v, i) => ({
      appointmentId: '11111111-1111-1111-1111-111111111111',
      serviceDate: '2026-11-20',
      detail: `Late ${i}`,
    }));
    const bad = { ...detailExample, metrics: [metricResult({ failures, failureCount: 21 })] };
    expect(() => inspectorReliabilityResponseSchema.parse(bad)).toThrow();
  });

  it('requires isStale and settingsUpdatedAt', () => {
    const { isStale: _i, ...noStale } = detailExample;
    expect(() => inspectorReliabilityResponseSchema.parse(noStale)).toThrow();
  });
});

describe('inspectorReliabilityParamsSchema', () => {
  it('requires a uuid inspectorId', () => {
    expect(() => inspectorReliabilityParamsSchema.parse({ inspectorId: 'not-a-uuid' })).toThrow();
    expect(() =>
      inspectorReliabilityParamsSchema.parse({ inspectorId: '11111111-1111-1111-1111-111111111111' }),
    ).not.toThrow();
  });
});
