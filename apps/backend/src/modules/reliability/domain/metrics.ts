import { type ReliabilityMetricKey, type ReliabilityMetricResult } from '@properfy/shared';
import {
  isAttendanceFault,
  isCompletedDone,
  isDoneOccurrence,
  type ServiceFact,
} from './service-fact';
import { serviceWeightMinutes } from './service-weight';
import { evaluatePunctuality } from './punctuality';
import { evaluateGeofenceCompliance } from './geofence-compliance';
import { evaluateNoStuck } from './no-stuck';
import { wasNotifiedInAdvance } from './late-notice';
import { activeDaysInPeriod, effectiveVolumeReference, periodLengthDays, proratedVolumeRate } from './volume-prorata';
import { roundHalfUp } from './score';
import {
  assembleFailures,
  doneRejectedFailureDetail,
  geofenceFailureDetail,
  lateNoticeFailureDetail,
  noShowDetail,
  noStuckFailureDetail,
  punctualityFailureDetail,
  satisfactionFailureDetail,
} from './metric-failures';

export interface MetricContext {
  /** Check-in window tolerance (F03 `fieldEvents.checkInWindowToleranceMinutes`). */
  toleranceMinutes: number;
  /** Shared volume reference (median of active inspectors, or scaled override). */
  volumeReference: number;
  /** SATISFACTION floor below which the metric is null (L-F07-03). */
  minimumRatings: number;
  /** Civil period `[from, to]` (inclusive) — VOLUME pro-rata (L-F07-05). */
  from: string;
  to: string;
}

function weightOf(fact: ServiceFact): number {
  return serviceWeightMinutes(fact);
}

function emptyResult(metric: ReliabilityMetricKey, volume: number): ReliabilityMetricResult {
  return {
    metric,
    rate: null,
    eligibleCount: 0,
    successCount: metric === 'SATISFACTION' ? null : 0,
    averageRating: null,
    volumeReference: null,
    weightedSuccess: 0,
    weightedEligible: 0,
    volume,
    activeDays: null,
    failureCount: 0,
    failures: [],
  };
}

/**
 * Compute one reliability metric for one inspector from their service facts
 * (F07-1). `facts` is that inspector's universe for the period; metrics 1–7 use
 * the universe excluding late-rejection facts, metric 8 uses all DONE occurrences
 * (late rejections included). The rate is a weighted ratio stored at 4 decimals;
 * `null` means no eligible service (or SATISFACTION below its floor).
 */
export function computeMetricFromFacts(
  metric: ReliabilityMetricKey,
  facts: ServiceFact[],
  ctx: MetricContext,
): ReliabilityMetricResult {
  const universe = facts.filter((f) => !f.lateRejection);
  const volume = universe.length;

  switch (metric) {
    case 'PUNCTUALITY': {
      const evals = universe.map((fact) => ({
        fact,
        result: evaluatePunctuality(fact, { toleranceMinutes: ctx.toleranceMinutes }),
      }));
      const eligible = evals.filter((e) => e.result !== 'NOT_EVALUABLE');
      let weightedSuccess = 0;
      let weightedEligible = 0;
      let successCount = 0;
      for (const { fact, result } of eligible) {
        const w = weightOf(fact);
        weightedEligible += w;
        if (result === 'PUNCTUAL') {
          weightedSuccess += w;
          successCount += 1;
        }
      }
      const { failures, failureCount } = assembleFailures(
        eligible
          .filter((e) => e.result !== 'PUNCTUAL')
          .map((e) => ({ fact: e.fact, detail: punctualityFailureDetail(e.fact, e.result) })),
      );
      return {
        ...emptyResult(metric, volume),
        rate: weightedEligible > 0 ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null,
        eligibleCount: eligible.length,
        successCount,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    case 'GEOFENCE': {
      const evals = universe.map((fact) => ({ fact, result: evaluateGeofenceCompliance(fact) }));
      const eligible = evals.filter((e) => e.result === 'PASS' || e.result === 'MISS');
      let weightedSuccess = 0;
      let weightedEligible = 0;
      let successCount = 0;
      for (const { fact, result } of eligible) {
        const w = weightOf(fact);
        weightedEligible += w;
        if (result === 'PASS') {
          weightedSuccess += w;
          successCount += 1;
        }
      }
      const { failures, failureCount } = assembleFailures(
        eligible
          .filter((e) => e.result === 'MISS')
          .map((e) => ({ fact: e.fact, detail: geofenceFailureDetail(e.fact) })),
      );
      return {
        ...emptyResult(metric, volume),
        rate: weightedEligible > 0 ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null,
        eligibleCount: eligible.length,
        successCount,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    case 'NO_STUCK': {
      const evals = universe.map((fact) => ({ fact, result: evaluateNoStuck(fact) }));
      const eligible = evals.filter((e) => e.result === 'OK' || e.result === 'STUCK');
      let weightedSuccess = 0;
      let weightedEligible = 0;
      let successCount = 0;
      for (const { fact, result } of eligible) {
        const w = weightOf(fact);
        weightedEligible += w;
        if (result === 'OK') {
          weightedSuccess += w;
          successCount += 1;
        }
      }
      const { failures, failureCount } = assembleFailures(
        eligible
          .filter((e) => e.result === 'STUCK')
          .map((e) => ({ fact: e.fact, detail: noStuckFailureDetail(e.fact) })),
      );
      return {
        ...emptyResult(metric, volume),
        rate: weightedEligible > 0 ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null,
        eligibleCount: eligible.length,
        successCount,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    case 'SATISFACTION': {
      const surveyed = universe.filter((f) => f.rating !== null && isDoneOccurrence(f));
      const eligibleCount = surveyed.length;
      const averageRating =
        eligibleCount > 0 ? surveyed.reduce((sum, f) => sum + (f.rating ?? 0), 0) / eligibleCount : null;
      let weightedSuccess = 0;
      let weightedEligible = 0;
      for (const fact of surveyed) {
        const w = weightOf(fact);
        weightedEligible += w;
        weightedSuccess += (w * ((fact.rating ?? 0) - 1)) / 4;
      }
      const belowMinimum = eligibleCount < ctx.minimumRatings;
      const rate =
        eligibleCount > 0 && !belowMinimum ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null;
      const { failures, failureCount } = assembleFailures(
        surveyed
          .filter((f) => (f.rating ?? 0) <= 2)
          .map((f) => ({ fact: f, detail: satisfactionFailureDetail(f) })),
      );
      return {
        ...emptyResult(metric, volume),
        rate,
        eligibleCount,
        successCount: null,
        averageRating,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    case 'LATE_NOTICE': {
      const lateFacts = universe.filter(
        (f) => evaluatePunctuality(f, { toleranceMinutes: ctx.toleranceMinutes }) === 'LATE',
      );
      let weightedSuccess = 0;
      let weightedEligible = 0;
      let successCount = 0;
      for (const fact of lateFacts) {
        const w = weightOf(fact);
        weightedEligible += w;
        if (wasNotifiedInAdvance(fact)) {
          weightedSuccess += w;
          successCount += 1;
        }
      }
      const { failures, failureCount } = assembleFailures(
        lateFacts
          .filter((f) => !wasNotifiedInAdvance(f))
          .map((f) => ({ fact: f, detail: lateNoticeFailureDetail(f) })),
      );
      return {
        ...emptyResult(metric, volume),
        rate: weightedEligible > 0 ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null,
        eligibleCount: lateFacts.length,
        successCount,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    case 'CANT_ATTEND': {
      let weightedSuccess = 0;
      let weightedEligible = 0;
      let successCount = 0;
      for (const fact of universe) {
        const w = weightOf(fact);
        weightedEligible += w;
        if (!isAttendanceFault(fact)) {
          weightedSuccess += w;
          successCount += 1;
        }
      }
      const { failures, failureCount } = assembleFailures(
        universe.filter(isAttendanceFault).map((f) => ({ fact: f, detail: noShowDetail(f) })),
      );
      return {
        ...emptyResult(metric, volume),
        rate: weightedEligible > 0 ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null,
        eligibleCount: universe.length,
        successCount,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    case 'VOLUME': {
      const completedCount = universe.filter(isCompletedDone).length;
      const periodDays = periodLengthDays(ctx.from, ctx.to);
      const createdOn = facts[0]?.inspectorCreatedOn;
      const activeDays = createdOn ? activeDaysInPeriod(createdOn, ctx.from, ctx.to) : periodDays;
      const weightedEligible = effectiveVolumeReference(ctx.volumeReference, activeDays, periodDays);
      const rawRate = proratedVolumeRate(completedCount, ctx.volumeReference, activeDays, periodDays);
      return {
        ...emptyResult(metric, volume),
        rate: rawRate === null ? null : roundHalfUp(rawRate, 4),
        eligibleCount: completedCount,
        successCount: completedCount,
        volumeReference: ctx.volumeReference,
        weightedSuccess: completedCount,
        weightedEligible,
        activeDays,
        failures: [],
        failureCount: 0,
      };
    }

    case 'DONE_REJECTED': {
      const occurrences = facts.filter(isDoneOccurrence);
      let weightedSuccess = 0;
      let weightedEligible = 0;
      let successCount = 0;
      for (const fact of occurrences) {
        const w = weightOf(fact);
        weightedEligible += w;
        if (!fact.doneRejected) {
          weightedSuccess += w;
          successCount += 1;
        }
      }
      const { failures, failureCount } = assembleFailures(
        occurrences.filter((f) => f.doneRejected).map((f) => ({ fact: f, detail: doneRejectedFailureDetail() })),
      );
      return {
        ...emptyResult(metric, volume),
        rate: weightedEligible > 0 ? roundHalfUp(weightedSuccess / weightedEligible, 4) : null,
        eligibleCount: occurrences.length,
        successCount,
        weightedSuccess,
        weightedEligible,
        failures,
        failureCount,
      };
    }

    default: {
      const exhaustive: never = metric;
      throw new Error(`Unknown reliability metric: ${String(exhaustive)}`);
    }
  }
}
