import type { Prisma } from '@prisma/client';

/**
 * Raw rows for the reliability facts reader (F07-1). The infrastructure reader
 * runs a fixed set of queries (Q1–Q7 + the auxiliaries) and returns these rows;
 * the pure `build-service-facts` deduplicates and annotates them into
 * `ServiceFact`s. No row carries a latitude/longitude (D12).
 */

export interface ReliabilityCivilRange {
  from: string; // 'YYYY-MM-DD' (inclusive)
  to: string; // 'YYYY-MM-DD' (inclusive)
  inspectorIds?: string[];
}

interface ReliabilityBaseRow {
  appointmentId: string;
  inspectorId: string;
  tenantId: string;
  timezone: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string | null;
  defaultDurationMinutes: number;
  /** Inspector registration instant (converted to a Sydney civil date by build-facts). */
  inspectorCreatedAt: Date;
  /** Civil date (agency tz) the service belongs to, computed in SQL. */
  serviceDate: string;
}

/** Q1a/Q1b (current DONE) and Q2 (later-rejected DONE). */
export interface ReliabilityDoneRow extends ReliabilityBaseRow {
  origin: 'CURRENT_DONE' | 'REJECTED_DONE';
  doneRejected: boolean;
  /** Civil date (agency tz) of the DONE → REJECTED audit; only for REJECTED_DONE (L-F07-07). */
  rejectedOn: string | null;
  startedAt: Date | null;
  startClientAt: Date | null;
  finishedAt: Date | null;
  resumedAt: Date | null;
  outOfWindow: boolean | null;
  outOfRadius: boolean | null;
  finishOutOfRadius: boolean | null;
  geolocationDistanceMeters: number | null;
  finishGeolocationDistanceMeters: number | null;
  startAccuracyM: number | null;
  finishAccuracyM: number | null;
  geofenceRadiusM: number | null;
}

/** Q3 (CANT_ATTEND field events). */
export interface ReliabilityCantAttendRow extends ReliabilityBaseRow {
  clientOccurredAt: Date | null;
  createdAt: Date;
}

/** Q7 (OP-marked SCHEDULED → REJECTED INSPECTOR_NO_SHOW). */
export type ReliabilityNoShowRow = ReliabilityBaseRow;

/** Q4 (plan stops for weight + published times). */
export interface ReliabilityPlanStopRow {
  appointmentId: string;
  inspectorId: string;
  planDate: string;
  travelSeconds: number | null;
  durationMinutes: number;
  publishedEta: Date | null;
  publishedServiceStartAt: Date | null;
}

/** Q5 (satisfaction surveys). */
export interface ReliabilitySurveyRow {
  appointmentId: string;
  inspectorId: string;
  rating: number;
}

/** Q6 (late-notice field events). */
export interface ReliabilityLateNoticeRow {
  appointmentId: string;
  inspectorId: string;
  createdAt: Date;
  clientOccurredAt: Date | null;
}

export interface ReliabilityFactsRaw {
  done: ReliabilityDoneRow[];
  cantAttend: ReliabilityCantAttendRow[];
  noShow: ReliabilityNoShowRow[];
  planStops: ReliabilityPlanStopRow[];
  surveys: ReliabilitySurveyRow[];
  lateNotices: ReliabilityLateNoticeRow[];
}

/**
 * Loads the raw reliability facts in a fixed number of queries (independent of
 * the inspector count) and the completed-DONE counts for the median. The `*With`
 * variants run inside a caller's transaction (used by the F07-2 snapshot job).
 */
export interface IReliabilityFactsReader {
  load(range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw>;
  loadWith(tx: Prisma.TransactionClient, range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw>;
  loadCompletedCounts(range: { from: string; to: string }): Promise<Map<string, number>>;
  loadCompletedCountsWith(
    tx: Prisma.TransactionClient,
    range: { from: string; to: string },
  ): Promise<Map<string, number>>;
}
