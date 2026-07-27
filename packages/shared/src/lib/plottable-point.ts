/**
 * "Can this coordinate actually be drawn on a map?" — single source of truth
 * shared between the backend (which decides what to put in a map payload) and
 * the frontends (which decide what to render and how to frame the camera).
 *
 * It lives here because the rule has to hold across the API boundary. A
 * producer that filters with a looser `!= null` check advertises a "plottable
 * subset" its consumer then rejects, so the counts disagree and the map
 * silently disagrees with the list beside it — the same two-definitions bug
 * that had to be fixed on the frontend once already.
 *
 * Deliberately free of map-library types so it can be imported by the backend:
 * `LngLatBoundsLike` and friends stay in each app's own `map-bounds` module.
 */

export interface PointLike {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/**
 * Whether a point can actually be drawn and framed.
 *
 * Callers filtering their own pin collections must use this rather than a
 * looser `!= null` check, or a malformed coordinate will be counted as
 * on-screen and handed to a marker while the camera fit silently drops it.
 *
 * Typed as a guard so `points.filter(isPlottablePoint)` yields non-null
 * coordinates — callers get the narrowing for free instead of re-asserting it
 * with a cast that could drift from the check above.
 */
export function isPlottablePoint<T extends PointLike>(
  point: T,
): point is T & { latitude: number; longitude: number } {
  const { latitude, longitude } = point;
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}
