import centroids from './au-suburb-centroids.json';

type CentroidMap = Record<string, { lat: number; lng: number }>;

const CENTROID_TABLE = centroids as CentroidMap;

/**
 * Resolves a group of (suburb, state) pairs to their geographic centroid.
 * Looks up each suburb in the bundled centroid table; returns the mean of
 * all resolved centroids, or null when none resolve.
 */
export function resolveCentroid(
  suburbs: Array<{ name: string; state: string }>,
): { lat: number; lng: number } | null {
  const resolved: Array<{ lat: number; lng: number }> = [];

  for (const { name, state } of suburbs) {
    const key = `${name.trim().toUpperCase()}|${state.trim().toUpperCase()}`;
    const entry = CENTROID_TABLE[key];
    if (entry) resolved.push(entry);
  }

  if (resolved.length === 0) return null;

  const lat = resolved.reduce((sum, c) => sum + c.lat, 0) / resolved.length;
  const lng = resolved.reduce((sum, c) => sum + c.lng, 0) / resolved.length;
  return { lat, lng };
}
