import type { DayPlanGeometry, PlanRouteService, StoredRoutingMatrix } from './services/plan-route.service';
import type { DayPlanRecord } from '../domain/day-plan.entity';

/** Routing artefacts recomputed on demand for a stored plan (never persisted — Plan B). */
export interface OnDemandRouting {
  geometry: DayPlanGeometry | null;
  matrix: StoredRoutingMatrix | null;
  legs: Array<{ fromKey: string; toKey: string; travelS: number }>;
  /** True when the recompute degraded to the straight-line stub (rate limit / provider error). */
  approximate: boolean;
  approximateReason: string | null;
}

/**
 * Recomputes the geometry, travel matrix and per-leg durations of a stored plan's
 * reorderable stops in their stored order (PRESERVE_ORDER), without re-optimizing
 * and without persisting anything. Interactive + non-strict: a drained rate limiter
 * or provider failure degrades to the straight-line stub, never throws. Stop ETAs
 * are not re-derived — the stored record stays authoritative for them.
 */
export async function recomputeRoutingForRecord(
  planRoute: PlanRouteService,
  record: DayPlanRecord,
  now: Date,
  isToday: boolean,
): Promise<OnDemandRouting> {
  const reorderable = record.stops.filter((s) => !s.executed).sort((a, b) => a.sequence - b.sequence);
  const origin =
    record.originSource !== 'NONE' && record.originLat !== null && record.originLng !== null
      ? { lat: record.originLat, lng: record.originLng }
      : null;

  const result = await planRoute.compute({
    origin,
    stops: reorderable.map((s) => ({
      appointmentId: s.appointmentId,
      location: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null,
      windowStartAt: s.windowStartAt,
      windowEndAt: s.windowEndAt,
      serviceMinutes: s.durationMinutes,
    })),
    earliestDepartureAt: isToday ? new Date(Math.max(now.getTime(), (record.departureAt ?? now).getTime())) : null,
    weights: record.weights,
    mode: { kind: 'PRESERVE_ORDER', order: reorderable.map((s) => s.appointmentId) },
    interactive: true,
    strict: false,
    now,
  });

  return {
    geometry: result.geometry,
    matrix: result.matrix,
    legs: result.legs.map((l) => ({ fromKey: l.fromKey, toKey: l.toKey, travelS: l.travelS })),
    approximate: result.approximate,
    approximateReason: result.approximateReason,
  };
}
