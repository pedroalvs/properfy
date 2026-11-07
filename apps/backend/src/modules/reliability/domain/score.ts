import {
  ReliabilityScoreStatus,
  type ReliabilityIndexSetting,
  type ReliabilityMetricResult,
} from '@properfy/shared';

/**
 * Half-up rounding to `decimals` places for non-negative values (P9).
 * `Number.EPSILON` corrects IEEE-754 boundary cases (0.78250 → 78.3, 0.782499 →
 * 78.2). Used for the 4-decimal rates and the 1-decimal score.
 */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * The 0–100 reliability score for one window (P9 formula, D3 gating):
 * `100 × Σ Wₖ·rₖ / Σ Wₖ` over the metrics with a non-null rate and a weight > 0.
 *
 * - `volume < minimumVolume` → `INSUFFICIENT_VOLUME`, score null (metrics are
 *   still passed in, so the drawer can show them).
 * - every weighted metric dropped (all null, or all weights 0) → `NO_WEIGHTED_DATA`.
 * - otherwise `SCORED`.
 *
 * Rates are the metric results' 4-decimal working values; the score is rounded
 * once to 1 decimal (never re-rounding through a coarser precision).
 */
export function computeReliabilityScore(
  metrics: ReliabilityMetricResult[],
  settings: ReliabilityIndexSetting,
  volume: number,
): { status: ReliabilityScoreStatus; score: number | null } {
  if (volume < settings.minimumVolume) {
    return { status: ReliabilityScoreStatus.INSUFFICIENT_VOLUME, score: null };
  }

  let weightedRateSum = 0;
  let weightSum = 0;
  for (const metric of metrics) {
    if (metric.rate === null) continue;
    const weight = settings.weights[metric.metric];
    if (!weight || weight <= 0) continue;
    weightedRateSum += weight * metric.rate;
    weightSum += weight;
  }

  if (weightSum === 0) {
    return { status: ReliabilityScoreStatus.NO_WEIGHTED_DATA, score: null };
  }

  return {
    status: ReliabilityScoreStatus.SCORED,
    score: roundHalfUp((100 * weightedRateSum) / weightSum, 1),
  };
}
