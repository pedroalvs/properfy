import type { DayPlanGeometry } from '@properfy/shared';
import type { LiveDayStopRow } from './live-day.read-repository';
import { buildRouteFallback, type RoutePoint } from './build-route-fallback';

/**
 * Per-inspector route geometry (§6). Always the in-memory straight line from the
 * configured origin (when there is a pin — override → base; `LAST_STOP`/none has
 * none, L-F04-07) through the coordinate-bearing stops in display order. The
 * caller passes the already display-ordered visible stops; `routeApproximate` is
 * always true (F04 Plan B persists no road route).
 */
export function buildRouteGeometry(
  originPoint: RoutePoint | null,
  orderedStops: LiveDayStopRow[],
): DayPlanGeometry | null {
  const points: RoutePoint[] = [];
  if (originPoint) points.push(originPoint);
  for (const stop of orderedStops) {
    points.push({ lat: stop.propertyLat, lng: stop.propertyLng });
  }
  return buildRouteFallback(points);
}
