import type { DayPlanGeometry } from '@properfy/shared';

/** A map point in natural lat/lng (converted to GeoJSON `[lng, lat]` here). */
export interface RoutePoint {
  lat: number | null;
  lng: number | null;
}

/**
 * Straight-line route (§6). Since F04 Plan B persists no road geometry and this
 * read never calls Mapbox, the Live Day route is ALWAYS this in-memory straight
 * line between coordinate-bearing points, flagged `approximate: true`. Points
 * without a coordinate are skipped; fewer than two points yields `null` (nothing
 * to draw). Validates against the reused `dayPlanGeometrySchema`.
 */
export function buildRouteFallback(points: RoutePoint[]): DayPlanGeometry | null {
  const coordinates = points
    .filter((p): p is { lat: number; lng: number } => p.lat !== null && p.lng !== null)
    .map((p) => [p.lng, p.lat] as [number, number]);

  if (coordinates.length < 2) return null;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { fromSequence: 0, toSequence: coordinates.length - 1, approximate: true },
      },
    ],
  };
}
