/**
 * One reliability "service" occurrence for one inspector (F07-1, P1).
 *
 * A fact is either a DONE occurrence (current or later-rejected) or a
 * `CANT_ATTEND` / OP `NO_SHOW_REJECTED` event. It is built by
 * `build-service-facts` from the reader's raw rows and consumed by the pure
 * metric evaluators. It NEVER carries a latitude/longitude (D12 / F03 D10) —
 * only distances, accuracies, the geofence radius snapshot and flags.
 *
 * Timing fields are UTC instants; `serviceDate`/`inspectorCreatedOn` are civil
 * dates (`YYYY-MM-DD`) in the agency / platform timezone.
 */

export type ServiceFactKind = 'EXECUTED' | 'DONE_WITHOUT_EXECUTION' | 'CANT_ATTEND' | 'NO_SHOW_REJECTED';
export type ServiceFactOrigin = 'CURRENT_DONE' | 'REJECTED_DONE' | 'CANT_ATTEND' | 'NO_SHOW_REJECTED';

/** A late-notice event, kept raw so `late-notice` can resolve its effective time. */
export interface LateNoticeEvent {
  clientOccurredAt: Date | null;
  createdAt: Date;
}

export interface ServiceFact {
  inspectorId: string;
  appointmentId: string;
  tenantId: string;
  /** Agency IANA timezone (for rendering wall-clock times in failure details). */
  timezone: string;
  kind: ServiceFactKind;
  origin: ServiceFactOrigin;
  /** Civil date (agency tz) the service belongs to (P2); rejection date for a late NOT_EXECUTED (L-F07-07). */
  serviceDate: string;
  /** This fact is a DONE that was later rejected (DONE → REJECTED with NOT_EXECUTED). */
  doneRejected: boolean;
  /** The rejection landed > 30 days after the service, in a later period (L-F07-07): metric 8 only. */
  lateRejection: boolean;

  // Weight inputs (03.5 / P7)
  durationMinutes: number;
  plannedTravelMinutes: number;

  // Slot window (UTC instants built from the agency-tz wall time)
  windowStartAt: Date | null;
  windowEndAt: Date | null;

  // Timing (raw; punctuality resolves the effective start itself)
  startedAt: Date | null;
  startClientAt: Date | null;
  finishedAt: Date | null;
  resumedAt: Date | null;
  outOfWindow: boolean;
  publishedEtaAt: Date | null;
  publishedServiceStartAt: Date | null;

  // Geofence (distances/accuracies/flags only — never coordinates)
  outOfRadius: boolean;
  finishOutOfRadius: boolean;
  geolocationDistanceMeters: number | null;
  finishGeolocationDistanceMeters: number | null;
  startAccuracyM: number | null;
  finishAccuracyM: number | null;
  /** The geofence radius snapshotted at check-in; null only for pre-F03 executions. */
  geofenceRadiusM: number | null;

  // Satisfaction
  rating: number | null;

  // Notices
  lateNotices: LateNoticeEvent[];
  /** Effective notice time of the CANT_ATTEND (already resolved via resolveEffectiveEventTime). */
  cantAttendNoticeAt: Date | null;

  // Pro-rata (L-F07-05)
  inspectorCreatedOn: string;
}

/** A current or later-rejected DONE occurrence (EXECUTED or DONE_WITHOUT_EXECUTION). */
export function isDoneOccurrence(fact: ServiceFact): boolean {
  return fact.kind === 'EXECUTED' || fact.kind === 'DONE_WITHOUT_EXECUTION';
}

/** A current-DONE occurrence that counts toward completedCount (volume). */
export function isCompletedDone(fact: ServiceFact): boolean {
  return fact.origin === 'CURRENT_DONE' && isDoneOccurrence(fact);
}

/** A no-show-equivalent: dropped the job (CANT_ATTEND) or OP-marked no-show. */
export function isAttendanceFault(fact: ServiceFact): boolean {
  return fact.kind === 'CANT_ATTEND' || fact.kind === 'NO_SHOW_REJECTED';
}
