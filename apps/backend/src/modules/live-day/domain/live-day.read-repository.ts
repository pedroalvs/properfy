/**
 * Live Day read-model port (F05-1).
 *
 * Two aggregated reads, each ONE SQL statement and ZERO external calls (D13):
 * `getDay` (Algorithm §1) and `getLockedTime` (Algorithm §7). The repository maps
 * the `json_agg` snake_case payloads and `Decimal` columns into the flat,
 * Prisma-free rows below so every domain function (`derive-*`, `plan-freshness`,
 * `filter-t1-visible`, `to-eta-inputs`) stays pure and unit-testable.
 *
 * Instants cross as ISO strings, civil dates as `YYYY-MM-DD`, wall times as
 * `HH:mm`, coordinates as numbers (already `Decimal→number` in the repository).
 */

/** A live appointment of the inspector on the date, re-joined to its plan stop (L-F04-04). */
export interface LiveDayStopRow {
  appointmentId: string;
  appointmentNumber: number;
  inspectorId: string;
  status: 'SCHEDULED' | 'DONE';
  tenantId: string;
  scheduledDate: string; // YYYY-MM-DD
  timeSlotStart: string; // HH:mm, agency wall clock
  timeSlotEnd: string;
  keyRequired: boolean;
  confirmationStatus: string; // PENDING | CONFIRMED | UNAVAILABLE | NO_RESPONSE
  agencyName: string;
  tenantTimezone: string;
  appointmentCodePrefix: string | null;
  defaultDurationMinutes: number; // service_types.default_duration_minutes
  flowType: string; // ROUTINE | INGOING | OUTGOING
  requiresRentalTenantConfirmation: boolean;
  street: string;
  suburb: string;
  propertyState: string;
  postcode: string;
  propertyLat: number | null;
  propertyLng: number | null;
  // Execution (null when no execution row)
  startedAt: string | null;
  finishedAt: string | null;
  abandonedAt: string | null;
  startLat: number | null;
  startLng: number | null;
  finishLat: number | null;
  finishLng: number | null;
  outOfRadius: boolean | null;
  finishOutOfRadius: boolean | null;
  outOfWindow: boolean | null;
  geofenceRadiusM: number | null;
  geolocationDistanceMeters: number | null;
  finishGeolocationDistanceMeters: number | null;
  // Plan stop (null when the appointment is not in the plan)
  planId: string | null;
  sequence: number | null;
  travelS: number | null;
  stopDurationMinutes: number | null; // day_plan_stops.duration_minutes
  serviceStartAt: string | null;
  serviceEndAt: string | null;
  publishedServiceStartAt: string | null;
  windowStartAt: string | null; // instant
  windowEndAt: string | null;
  windowTimezone: string | null;
  missingCoordinates: boolean | null;
  lateS: number | null; // day_plan_stops.late_s (feasibility indicator)
}

/** An inspector field event (CANT_DO / LATE_NOTICE) for an appointment on the date. */
export interface LiveDayEventRow {
  id: string;
  inspectorId: string;
  type: 'CANT_DO' | 'LATE_NOTICE';
  appointmentId: string;
  reasonCode: string | null;
  note: string | null;
  minutes: number | null;
  createdAt: string;
  clientOccurredAt: string | null;
  apptTimeSlotStart: string; // HH:mm
  apptScheduledDate: string; // YYYY-MM-DD
  apptTenantTimezone: string;
  appointmentNumber: number;
  tenantId: string;
  appointmentCodePrefix: string | null;
  apptStatus: string; // current appointment status
  apptInspectorId: string | null; // current inspector (null = unassigned)
  cantDoActive: boolean; // REJECTED && inspector_id IS NULL && not deleted
}

/** A completion-reminder notice matched to one of the inspector's appointments (L-F03-03). */
export interface LiveDayReminderRow {
  dedupeKey: string;
  createdAt: string;
}

/** One roster row: an inspector with live work (or an active CANT_DO) on the date. */
export interface LiveDayInspectorRow {
  inspectorId: string;
  inspectorName: string;
  baseLat: number | null;
  baseLng: number | null;
  alertOverridesJson: unknown; // { delayMinutes?, notStartedMinutes? } | null — validated in the domain
  // Plan header (null when the inspector has no plan for the date)
  planId: string | null;
  planStatus: 'DRAFT' | 'PUBLISHED' | 'STALE' | null;
  planVersion: number | null;
  planTimezone: string | null;
  inputFingerprint: string | null; // read only for the STALE comparison; never returned in the body
  departureAt: string | null;
  originSource: string | null; // DayPlanOriginSource
  originLat: number | null;
  originLng: number | null;
  originOverrideLat: number | null;
  originOverrideLng: number | null;
  approximate: boolean | null; // plan.approximate — kept only as an input signal; routeApproximate is always true (F04 Plan B, no stored geometry)
  feasible: boolean | null;
  plannedCount: number; // raw count of plan stops (detects a stop that LEFT the plan; §6.1 — corroborates STALE, not geometry)
  stops: LiveDayStopRow[];
  events: LiveDayEventRow[];
  reminders: LiveDayReminderRow[];
}

/** One aggregated locked-time row (Algorithm §7), per agency or per region. */
export interface LockedTimeRawRow {
  dim: 'AGENCY' | 'REGION';
  key: string | null; // tenant_id (AGENCY) or region_id (REGION); null = "No region"
  label: string; // agency name or region name
  regionAgencyName: string | null; // region owner; null = global or "No region"
  confirmed: number;
  required: number;
}

export interface LiveDayGetDayInput {
  date: string; // YYYY-MM-DD
  completionReminderPrefix: string; // COMPLETION_REMINDER_DEDUPE_PREFIX (L-F03-03)
  // Note: `includeGeometry`/`inspectorId` are NOT repository inputs. Since F04 Plan B
  // persists no geometry, the SQL is identical in every includeGeometry mode (one query,
  // SC-003); geometry is built in-memory in the use case, which owns those params.
}

export interface ILiveDayReadRepository {
  getDay(input: LiveDayGetDayInput): Promise<LiveDayInspectorRow[]>;
  getLockedTime(from: string, to: string): Promise<LockedTimeRawRow[]>;
}
