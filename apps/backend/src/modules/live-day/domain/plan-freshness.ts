import {
  computeDayPlanFingerprint,
  type FingerprintOrigin,
  type FingerprintStop,
} from '../../day-plan/domain/day-plan-fingerprint';
import type { LiveDayInspectorRow, LiveDayStopRow } from './live-day.read-repository';

/**
 * STALE via the F04 content fingerprint (D17, FR-019), computed in memory from the
 * single query's rows — no recompute, no Mapbox. The plan is STALE when the
 * recomputed fingerprint diverges from the stored `input_fingerprint` (an edit that
 * emitted no event — `update-appointment`, bulk, a property coordinate) or the
 * stored status is already STALE.
 *
 * The fingerprint input MUST match F04's `loadCandidates` + `configuredOriginFor`
 * exactly (`prisma-day-plan-input.reader.ts`, `day-plan-inputs.ts`), or every plan
 * would read as falsely STALE: the same T-1-visible `SCHEDULED` + all `DONE` rows,
 * the service-type `default_duration_minutes`, the current property coordinates, and
 * the CONFIGURED origin (override → base → none, NEVER `LAST_STOP`, L-F04-07/16).
 */

export type LiveDayPlanStatus = 'DRAFT' | 'PUBLISHED' | 'STALE' | 'NONE';

export interface PlanFreshness {
  planStatus: LiveDayPlanStatus;
  routeOutOfDate: boolean;
}

/** The configured origin, resolved exactly as F04's `configuredOriginFor`. */
export function configuredFingerprintOrigin(
  row: Pick<
    LiveDayInspectorRow,
    'originOverrideLat' | 'originOverrideLng' | 'baseLat' | 'baseLng'
  >,
): FingerprintOrigin {
  if (row.originOverrideLat !== null) {
    return { source: 'OVERRIDE', lat: row.originOverrideLat, lng: row.originOverrideLng };
  }
  if (row.baseLat !== null) {
    return { source: 'BASE', lat: row.baseLat, lng: row.baseLng };
  }
  return { source: 'NONE', lat: null, lng: null };
}

function toFingerprintStop(row: LiveDayStopRow): FingerprintStop {
  return {
    appointmentId: row.appointmentId,
    scheduledDate: row.scheduledDate,
    timeSlotStart: row.timeSlotStart,
    timeSlotEnd: row.timeSlotEnd,
    tenantTimezone: row.tenantTimezone,
    durationMinutes: row.defaultDurationMinutes,
    lat: row.propertyLat,
    lng: row.propertyLng,
    startedAt: row.startedAt === null ? null : new Date(row.startedAt),
    abandonedAt: row.abandonedAt === null ? null : new Date(row.abandonedAt),
  };
}

export interface PlanFreshnessInput {
  planId: string | null;
  storedStatus: LiveDayInspectorRow['planStatus'];
  storedFingerprint: string | null;
  origin: FingerprintOrigin;
  /** ALL T-1-visible rows (incl. `sequence null`), so a newly-assigned stop flips STALE. */
  visibleStops: LiveDayStopRow[];
}

export function resolvePlanFreshness(input: PlanFreshnessInput): PlanFreshness {
  if (input.planId === null) {
    return { planStatus: 'NONE', routeOutOfDate: false };
  }
  const fingerprint = computeDayPlanFingerprint({
    origin: input.origin,
    stops: input.visibleStops.map(toFingerprintStop),
  });
  if (input.storedStatus === 'STALE' || fingerprint !== input.storedFingerprint) {
    return { planStatus: 'STALE', routeOutOfDate: true };
  }
  return { planStatus: input.storedStatus ?? 'NONE', routeOutOfDate: false };
}
