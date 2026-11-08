import type { InspectorReliabilityComputation } from '../../../reliability/application/reliability-metrics.service';
import type { ReliabilityMetricResult } from '@properfy/shared';
import { RELIABILITY_METRIC_KEYS } from '@properfy/shared';
import type { Goal } from '../goal.entity';

/** Default goal: VOLUME ≥ 10, weekly, $30, starts Mon 2026-11-02 (also a fortnight start), active. */
export function buildGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    title: 'Ten inspections',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    period: 'WEEKLY',
    scopeRegionId: null,
    scopeServiceTypeId: null,
    scopeInspectorId: null,
    rewardAmount: 30,
    startsAt: '2026-11-02',
    endsAt: null,
    active: true,
    deactivatedAt: null,
    nextTarget: null,
    nextRewardAmount: null,
    nextEffectiveFrom: null,
    createdByUserId: 'user-op',
    updatedByUserId: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

function metricResult(metric: ReliabilityMetricResult['metric'], rate: number | null): ReliabilityMetricResult {
  return {
    metric,
    rate,
    eligibleCount: rate === null ? 0 : 10,
    successCount: rate === null ? null : Math.round(rate * 10),
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

/**
 * Builds an `InspectorReliabilityComputation` for goal-evaluation tests. `rates`
 * overrides specific metric rates; `completedServiceDates` controls volume goals.
 */
export function buildComputation(
  overrides: Partial<InspectorReliabilityComputation> & { rates?: Partial<Record<ReliabilityMetricResult['metric'], number | null>> } = {},
): InspectorReliabilityComputation {
  const { rates, ...rest } = overrides;
  const completedServiceDates = rest.completedServiceDates ?? [];
  const metrics = RELIABILITY_METRIC_KEYS.map((metric) =>
    metricResult(metric, rates && metric in rates ? rates[metric]! : null),
  );
  return {
    inspectorId: 'insp-1',
    volume: rest.volume ?? completedServiceDates.length,
    completedCount: rest.completedCount ?? completedServiceDates.length,
    completedServiceDates,
    metrics: rest.metrics ?? metrics,
    ...rest,
  };
}
