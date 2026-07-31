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

/**
 * The mean of every plottable point, or `null` when none of them is.
 *
 * Used to place a single marker standing in for a collection of locations — a
 * service group's pin on the inspector's marketplace map, for one. Unplottable
 * points are dropped rather than averaged in: a `null` or `NaN` reaching the
 * sum would produce a `NaN` centroid, and a marker at `NaN` is a *silently*
 * broken pin, which is harder to notice than an absent one.
 *
 * Returning `null` for "nothing to average" keeps that case explicit at the
 * call site instead of handing back a meaningless (0, 0) — a coordinate that
 * happens to be a real place in the Gulf of Guinea.
 *
 * Longitude is averaged arithmetically, so a set straddling the antimeridian
 * (e.g. 179 and -179) would land on 0 rather than 180. That is unreachable
 * here: Australia spans roughly 113°E to 154°E, all positive, and the points
 * fed to this function belong to a single service group whose properties are
 * neighbours by construction. Anyone reusing this for a global dataset needs a
 * circular mean (atan2 over the summed sine/cosine) instead.
 */
export function computeCentroid(
  points: PointLike[],
): { latitude: number; longitude: number } | null {
  const plottable = points.filter(isPlottablePoint);
  if (plottable.length === 0) return null;

  const sum = plottable.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: sum.latitude / plottable.length,
    longitude: sum.longitude / plottable.length,
  };
}
