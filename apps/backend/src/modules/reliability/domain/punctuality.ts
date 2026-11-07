import { CANT_ATTEND_EARLY_NOTICE_HOURS } from '@properfy/shared';
import { resolveEffectiveEventTime } from '../../inspector-execution/domain/client-occurred-at';
import type { ServiceFact } from './service-fact';

export type PunctualityResult = 'PUNCTUAL' | 'EARLY' | 'LATE' | 'NO_SHOW' | 'NOT_EVALUABLE';

const CANT_ATTEND_EARLY_NOTICE_MS = CANT_ATTEND_EARLY_NOTICE_HOURS * 60 * 60 * 1000;

/**
 * Metric 1 — punctuality (detail 1, D10, R1).
 *
 * - `DONE_WITHOUT_EXECUTION` / `NO_SHOW_REJECTED` → `NO_SHOW`.
 * - `CANT_ATTEND` → `NO_SHOW`, unless warned ≥ 24 h before the window start
 *   (strictly), which is `NOT_EVALUABLE` (the OP had a day to re-offer, L-F07-01).
 * - `EXECUTED` with a pre-F03 null radius → `NOT_EVALUABLE` (`out_of_window` is
 *   not trustworthy there).
 * - `EXECUTED` in window (`!outOfWindow`) → `PUNCTUAL` (used as stored; an
 *   implausible client time was already resolved to in-window by F03, R1).
 * - out of window: `EARLY` if the effective start is before the window start
 *   minus tolerance; else `PUNCTUAL` if a published service start exists and the
 *   effective start is within tolerance of it (rescues lateness only); else `LATE`.
 */
export function evaluatePunctuality(
  fact: ServiceFact,
  opts: { toleranceMinutes: number },
): PunctualityResult {
  const toleranceMs = opts.toleranceMinutes * 60 * 1000;

  if (fact.kind === 'DONE_WITHOUT_EXECUTION' || fact.kind === 'NO_SHOW_REJECTED') {
    return 'NO_SHOW';
  }
  if (fact.kind === 'CANT_ATTEND') {
    if (
      fact.cantAttendNoticeAt &&
      fact.windowStartAt &&
      fact.cantAttendNoticeAt.getTime() < fact.windowStartAt.getTime() - CANT_ATTEND_EARLY_NOTICE_MS
    ) {
      return 'NOT_EVALUABLE';
    }
    return 'NO_SHOW';
  }

  // EXECUTED
  if (fact.geofenceRadiusM === null) return 'NOT_EVALUABLE';
  if (!fact.outOfWindow) return 'PUNCTUAL';
  if (!fact.startedAt || !fact.windowStartAt) return 'NOT_EVALUABLE';

  const effectiveStartAt = resolveEffectiveEventTime(fact.startClientAt, fact.startedAt).effectiveAt;
  if (effectiveStartAt.getTime() < fact.windowStartAt.getTime() - toleranceMs) return 'EARLY';
  if (
    fact.publishedServiceStartAt &&
    effectiveStartAt.getTime() <= fact.publishedServiceStartAt.getTime() + toleranceMs
  ) {
    return 'PUNCTUAL';
  }
  return 'LATE';
}
