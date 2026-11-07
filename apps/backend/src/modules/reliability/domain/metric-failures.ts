import { RELIABILITY_FAILURES_MAX, type ReliabilityMetricFailure } from '@properfy/shared';
import { resolveEffectiveEventTime } from '../../inspector-execution/domain/client-occurred-at';
import type { ServiceFact } from './service-fact';
import type { PunctualityResult } from './punctuality';
import { advanceNoticeDeadline } from './late-notice';

/**
 * Failure detail strings (L-F07-06). English, ≤ 80 characters, with agency
 * wall-clock times and derived values only — never an address, a coordinate or an
 * agency name (D12). TASK-F07-3 (ESTEIO, T030/T033) finalises the exact wording.
 */

/** 24-hour wall-clock `HH:mm` of an instant in `timeZone`; stable across Node ICU versions. */
function wallHm(instant: Date | null, timeZone: string): string {
  if (!instant) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour === '24' ? '00' : hour}:${minute}`;
}

/** The no-show-equivalent reason, by fact kind. */
export function noShowDetail(fact: ServiceFact): string {
  if (fact.kind === 'DONE_WITHOUT_EXECUTION') return 'Marked done without check-in';
  if (fact.kind === 'NO_SHOW_REJECTED') return "Rejected: inspector didn't attend";
  return "Dropped: can't attend";
}

export function punctualityFailureDetail(fact: ServiceFact, result: PunctualityResult): string {
  if (result === 'NO_SHOW') return noShowDetail(fact);
  const tz = fact.timezone;
  const window = `window ${wallHm(fact.windowStartAt, tz)}–${wallHm(fact.windowEndAt, tz)}`;
  const effectiveStartAt = fact.startedAt
    ? resolveEffectiveEventTime(fact.startClientAt, fact.startedAt).effectiveAt
    : null;
  const checkedIn = `Checked in ${wallHm(effectiveStartAt, tz)}`;
  if (result === 'EARLY') return `${checkedIn}, ${window}`;
  const planned = fact.publishedServiceStartAt
    ? `, planned ${wallHm(fact.publishedServiceStartAt, tz)}`
    : '';
  return `${checkedIn}, ${window}${planned}`;
}

export function geofenceFailureDetail(fact: ServiceFact): string {
  const radius = fact.geofenceRadiusM ?? 0;
  const checkInMiss =
    fact.outOfRadius &&
    fact.geolocationDistanceMeters !== null &&
    (fact.startAccuracyM === null || fact.startAccuracyM <= radius);
  if (checkInMiss) {
    return `Check-in ${Math.round(fact.geolocationDistanceMeters!)} m from the property (radius ${radius} m)`;
  }
  return `Check-out ${Math.round(fact.finishGeolocationDistanceMeters ?? 0)} m from the property (radius ${radius} m)`;
}

export function noStuckFailureDetail(fact: ServiceFact): string {
  const ms = (fact.finishedAt?.getTime() ?? 0) - (fact.startedAt?.getTime() ?? 0);
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `Finished ${hours}h ${minutes}m after check-in`;
}

export function satisfactionFailureDetail(fact: ServiceFact): string {
  return `Rated ${fact.rating} / 5`;
}

export function lateNoticeFailureDetail(fact: ServiceFact): string {
  return `Late without notice before ${wallHm(advanceNoticeDeadline(fact), fact.timezone)}`;
}

export function doneRejectedFailureDetail(): string {
  return 'Rejected after completion: not carried out';
}

/**
 * Sort the failed facts most-recent `serviceDate` first, cap at
 * `RELIABILITY_FAILURES_MAX`, and keep the true total in `failureCount`.
 */
export function assembleFailures(
  failed: Array<{ fact: ServiceFact; detail: string }>,
): { failures: ReliabilityMetricFailure[]; failureCount: number } {
  const sorted = [...failed].sort((a, b) =>
    a.fact.serviceDate < b.fact.serviceDate ? 1 : a.fact.serviceDate > b.fact.serviceDate ? -1 : 0,
  );
  const failures = sorted.slice(0, RELIABILITY_FAILURES_MAX).map(({ fact, detail }) => ({
    appointmentId: fact.appointmentId,
    serviceDate: fact.serviceDate,
    detail: detail.slice(0, 80),
  }));
  return { failures, failureCount: failed.length };
}
