import {
  GOAL_METRIC_KIND,
  GOAL_METRIC_RELIABILITY_KEY,
  GOAL_RATE_MINIMUM_VOLUME,
  type GoalComparator,
  type GoalMetric,
  type ReliabilityIndexSetting,
} from '@properfy/shared';
import { computeReliabilityScore, roundHalfUp } from '../../reliability/domain/score';
import type { InspectorReliabilityComputation } from '../../reliability/application/reliability-metrics.service';
import type { CivilDate } from './goal.entity';

/** Why a goal was not met (surfaced to the app via the progress read model). */
export type GoalEvaluationReason = 'NOT_ENOUGH_SERVICES' | 'NO_DATA';

export interface GoalEvaluation {
  achieved: boolean;
  /** Volume goals: the count. Rate goals: the percentage (P8). Index goals: the score. `null` when undefined. */
  value: number | null;
  /** Total services in the inspector's universe for the period. */
  serviceCount: number;
  /** Civil date the target was reached (volume: the Nth service date; else the period end). */
  achievedOn: CivilDate | null;
  reason?: GoalEvaluationReason;
}

/** What `evaluateGoal` reads from a goal. */
export interface GoalEvaluationInput {
  metric: GoalMetric;
  comparator: GoalComparator;
  /** The target in force for the period (resolve via `goalTermsForPeriod` first). */
  target: number;
}

export interface GoalEvaluationContext {
  reliabilityIndex: ReliabilityIndexSetting;
  periodEnd: CivilDate;
}

/** Percentage value for a rate metric (P8); `CANT_DO_MAX` measures the complement. */
function ratePercent(metric: GoalMetric, rate: number): number {
  return metric === 'CANT_DO_MAX' ? roundHalfUp((1 - rate) * 100, 2) : roundHalfUp(rate * 100, 2);
}

/**
 * Evaluate one goal for one inspector over a closed period (Algorithm C). Pure:
 * it reads only the computation and the context, never the override or pro-rata
 * (DR3 — volume goals compare the raw count; index goals use the batch's already
 * scaled metrics).
 */
export function evaluateGoal(
  goal: GoalEvaluationInput,
  computation: InspectorReliabilityComputation | undefined,
  ctx: GoalEvaluationContext,
): GoalEvaluation {
  if (!computation) {
    return { achieved: false, value: 0, serviceCount: 0, achievedOn: null };
  }
  const serviceCount = computation.volume;
  const kind = GOAL_METRIC_KIND[goal.metric];

  if (kind === 'VOLUME') {
    const value = computation.completedCount;
    const achieved = value >= goal.target;
    const achievedOn = achieved ? (computation.completedServiceDates[goal.target - 1] ?? null) : null;
    return { achieved, value, serviceCount, achievedOn };
  }

  if (kind === 'INDEX') {
    const { status, score } = computeReliabilityScore(computation.metrics, ctx.reliabilityIndex, computation.volume);
    if (status === 'INSUFFICIENT_VOLUME') {
      return { achieved: false, value: null, serviceCount, achievedOn: null, reason: 'NOT_ENOUGH_SERVICES' };
    }
    if (status === 'NO_WEIGHTED_DATA' || score === null) {
      return { achieved: false, value: null, serviceCount, achievedOn: null, reason: 'NO_DATA' };
    }
    const achieved = score >= goal.target;
    return { achieved, value: score, serviceCount, achievedOn: achieved ? ctx.periodEnd : null };
  }

  // RATE
  const key = GOAL_METRIC_RELIABILITY_KEY[goal.metric];
  const metric = key ? computation.metrics.find((m) => m.metric === key) : undefined;
  const rate = metric?.rate ?? null;
  // DV6: LATE_NOTICE with a null rate (no late services) counts as a perfect 100.
  const value = rate === null ? (goal.metric === 'LATE_NOTICE' ? 100 : null) : ratePercent(goal.metric, rate);

  // The 10-service minimum comes before everything else (even the DV6 exception).
  if (computation.volume < GOAL_RATE_MINIMUM_VOLUME) {
    return { achieved: false, value, serviceCount, achievedOn: null, reason: 'NOT_ENOUGH_SERVICES' };
  }
  if (value === null) {
    return { achieved: false, value: null, serviceCount, achievedOn: null, reason: 'NO_DATA' };
  }
  const achieved = goal.comparator === 'LTE' ? value <= goal.target : value >= goal.target;
  return { achieved, value, serviceCount, achievedOn: achieved ? ctx.periodEnd : null };
}
