import {
  ROUTE_MATRIX_MAX_COORDINATES,
  ROUTE_MATRIX_TRAFFIC_MAX_COORDINATES,
} from './types';

/**
 * Pick the Mapbox Matrix profile for a coordinate count.
 *
 * - ≤ 10 → `driving-traffic` (traffic-aware, tightest Mapbox cap)
 * - 11–25 → `driving`
 * - ≥ 26 → `null` (exceeds the Matrix limit; the caller uses the stub)
 */
export function selectMatrixProfile(
  coordinates: number,
): 'driving-traffic' | 'driving' | null {
  if (coordinates <= ROUTE_MATRIX_TRAFFIC_MAX_COORDINATES) return 'driving-traffic';
  if (coordinates <= ROUTE_MATRIX_MAX_COORDINATES) return 'driving';
  return null;
}
