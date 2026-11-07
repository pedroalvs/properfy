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
 * The score uses each metric's **unrounded** rate (FR-027/FR-028), not the
 * 4-decimal display value: the exact rate is `weightedSuccess / weightedEligible`
 * (capped at 1 for VOLUME, whose `weightedSuccess` can exceed the reference). The
 * score itself is rounded half-up once, to 1 decimal.
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
    // FR-027/FR-028: score from the unrounded rate. A real non-null metric always
    // has weightedEligible > 0; the fallback to the (4-decimal) rate only guards
    // synthetic results that omit the weighted sums.
    const exactRate =
      metric.weightedEligible > 0
        ? Math.min(1, metric.weightedSuccess / metric.weightedEligible)
        : metric.rate;
    weightedRateSum += weight * exactRate;
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
