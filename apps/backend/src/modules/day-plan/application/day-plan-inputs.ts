import type { DayPlanOriginSource, InspectorBaseAddress } from '@properfy/shared';
import { computeDayPlanFingerprint, type FingerprintStop } from '../domain/day-plan-fingerprint';
import type { DayPlanCandidate, InspectorDayPlanContext } from '../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../domain/day-plan.entity';

export interface ConfiguredOrigin {
  source: DayPlanOriginSource;
  lat: number | null;
  lng: number | null;
  override: InspectorBaseAddress | null;
}

/**
 * The CONFIGURED origin (override → base → none) used by BOTH the fingerprint and
 * the compute step, so the GET's freshness check agrees with the compute. Never
 * `LAST_STOP` (that is an effective-origin concern, L-F04-07).
 */
export function configuredOriginFor(
  existing: DayPlanRecord | null,
  inspector: Pick<InspectorDayPlanContext, 'baseLat' | 'baseLng' | 'baseAddress'>,
): ConfiguredOrigin {
  if (existing?.originOverride && existing.originOverrideLat !== null) {
    return {
      source: 'OVERRIDE',
      lat: existing.originOverrideLat,
      lng: existing.originOverrideLng,
      override: existing.originOverride,
    };
  }
  if (inspector.baseLat !== null) {
    return { source: 'BASE', lat: inspector.baseLat, lng: inspector.baseLng, override: null };
  }
  return { source: 'NONE', lat: null, lng: null, override: null };
}

/** The input fingerprint for a set of candidates + configured origin (shared by compute and read). */
export function fingerprintForCandidates(candidates: DayPlanCandidate[], origin: ConfiguredOrigin): string {
  const stops: FingerprintStop[] = candidates.map((c) => ({
    appointmentId: c.appointmentId,
    scheduledDate: c.scheduledDate,
    timeSlotStart: c.timeSlotStart,
    timeSlotEnd: c.timeSlotEnd,
    tenantTimezone: c.tenantTimezone,
    durationMinutes: c.durationMinutes,
    lat: c.lat,
    lng: c.lng,
    startedAt: c.startedAt,
    abandonedAt: c.abandonedAt,
  }));
  return computeDayPlanFingerprint({
    origin: { source: origin.source, lat: origin.lat, lng: origin.lng },
    stops,
  });
}
