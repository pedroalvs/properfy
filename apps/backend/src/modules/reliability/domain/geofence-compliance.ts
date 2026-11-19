import type { ServiceFact } from './service-fact';

export type GeofenceResult = 'PASS' | 'MISS' | 'EXCLUDED';
type LegResult = 'PASS' | 'MISS' | 'INCONCLUSIVE' | 'NOT_EVALUATED';

/**
 * One leg (check-in or check-out): a leg with no distance is not evaluated; a leg
 * within radius passes; a leg flagged out of radius misses, unless its reported
 * accuracy is worse (larger) than the radius, in which case it is inconclusive
 * and does not penalise (P6).
 */
function evaluateLeg(
  distanceMeters: number | null,
  outOfRadius: boolean,
  accuracyMeters: number | null,
  radiusMeters: number,
): LegResult {
  if (distanceMeters === null) return 'NOT_EVALUATED';
  if (!outOfRadius) return 'PASS';
  if (accuracyMeters === null || accuracyMeters <= radiusMeters) return 'MISS';
  return 'INCONCLUSIVE';
}

/**
 * Metric 2 — geofence compliance. The execution misses if either leg misses,
 * passes if neither misses and at least one leg passes, and is excluded
 * otherwise (no evaluable leg). Non-EXECUTED facts and pre-F03 executions
 * (`geofenceRadiusM` null) are excluded. The accuracy comparison uses the
 * check-in radius snapshot, the only radius stored.
 */
export function evaluateGeofenceCompliance(fact: ServiceFact): GeofenceResult {
  if (fact.kind !== 'EXECUTED') return 'EXCLUDED';
  if (fact.geofenceRadiusM === null) return 'EXCLUDED';
  const radius = fact.geofenceRadiusM;
  const checkIn = evaluateLeg(fact.geolocationDistanceMeters, fact.outOfRadius, fact.startAccuracyM, radius);
  const checkOut = evaluateLeg(
    fact.finishGeolocationDistanceMeters,
    fact.finishOutOfRadius,
    fact.finishAccuracyM,
    radius,
  );
  if (checkIn === 'MISS' || checkOut === 'MISS') return 'MISS';
  if (checkIn === 'PASS' || checkOut === 'PASS') return 'PASS';
  return 'EXCLUDED';
}
