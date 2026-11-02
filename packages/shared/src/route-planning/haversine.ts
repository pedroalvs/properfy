import type { LatLng } from './types';

/** Mean Earth radius in meters (IUGG), matching the routing contract. */
const EARTH_RADIUS_M = 6371008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in meters between two points.
 *
 * Returns 0 for identical points and ~111195 m for (0,0) → (0,1). Used both for
 * the stub provider and for the "identical points" short-circuit (< 10 m).
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
