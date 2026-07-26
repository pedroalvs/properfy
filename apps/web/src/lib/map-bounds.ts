import type { LngLatBoundsLike } from 'mapbox-gl';

export interface PointLike {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/**
 * Whether a point can actually be drawn and framed.
 *
 * This is THE definition of "plottable" — callers filtering their own pin
 * collections must use it rather than a looser `!= null` check, or a malformed
 * coordinate will be counted as on-screen and handed to a marker while
 * `computeBounds` silently drops it from the camera fit.
 */
export function isPlottablePoint(point: PointLike): boolean {
  const { latitude, longitude } = point;
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

/**
 * Compute a Mapbox GL bounding box from an array of points.
 *
 * - Skips points with null/undefined coordinates
 * - Skips points with invalid coordinates (out of [-90, 90] / [-180, 180])
 * - Returns null if no valid points
 * - Returns a degenerate bounds (sw === ne) for a single valid point; callers should
 *   treat this as a flyTo hint rather than fitBounds
 */
export function computeBounds(points: PointLike[]): LngLatBoundsLike | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let count = 0;

  for (const point of points) {
    if (!isPlottablePoint(point)) continue;
    const latitude = point.latitude as number;
    const longitude = point.longitude as number;

    if (longitude < minLng) minLng = longitude;
    if (longitude > maxLng) maxLng = longitude;
    if (latitude < minLat) minLat = latitude;
    if (latitude > maxLat) maxLat = latitude;
    count += 1;
  }

  if (count === 0) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Check whether the computed bounds represent a single point (degenerate).
 * Useful for deciding between fitBounds and flyTo.
 */
export function isSinglePointBounds(bounds: LngLatBoundsLike): boolean {
  if (!Array.isArray(bounds) || bounds.length !== 2) return false;
  const [sw, ne] = bounds as [[number, number], [number, number]];
  return sw[0] === ne[0] && sw[1] === ne[1];
}
