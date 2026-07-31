/**
 * Pulls overlapping map markers apart so no pin is ever drawn on top of another.
 *
 * Overlap is a fact about *pixels*, not about coordinates: two groups 300m apart
 * collide at zoom 12 and separate at zoom 16, and two groups at the same address
 * collide at every zoom. So this works in projected screen space, and callers
 * must recompute it whenever the camera moves.
 *
 * Deliberately free of mapbox types — it takes plain screen points and returns
 * plain pixel offsets — so it is unit-testable without a map, and so the same
 * logic can be lifted into the web app, which has the identical problem in its
 * own marker loops. Same reasoning as the sibling `map-bounds` module.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Pixel offset to apply to a marker: `[dx, dy]`. */
export type MarkerOffset = [number, number];

/** Tolerance so "exactly touching" never reads as "overlapping" after rounding. */
const EPSILON = 1e-6;

/**
 * Largest coordinate that can be a real on-screen position.
 *
 * `Map.project()` reports `Number.MAX_VALUE` for a point behind the camera on a
 * pitched map — and `Number.isFinite(Number.MAX_VALUE)` is `true`, so a plain
 * finiteness check lets those sentinels through. One of them alone is harmless
 * (every distance to it overflows to Infinity), but *two* occluded points sit a
 * few pixels apart from each other and would happily cluster and get offsets.
 * No viewport is millions of pixels wide, so past this a value is a sentinel
 * rather than a position.
 */
const MAX_SCREEN_COORDINATE = 1e7;

function isUsablePoint(point: ScreenPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) <= MAX_SCREEN_COORDINATE &&
    Math.abs(point.y) <= MAX_SCREEN_COORDINATE
  );
}

/**
 * Where each member of a cluster should be drawn.
 *
 * A lone marker stays exactly where it is — the common case, and the one where
 * accuracy matters most. A cluster of N becomes a horizontal row centred on the
 * mean of its members' true positions, with one diameter between neighbours, so
 * the pins end up touching rather than overlapping.
 *
 * Members are ordered by their true x (index breaks ties) so the row preserves
 * whatever left-to-right sense the real positions had, and so identical inputs
 * always produce identical output.
 */
function layoutCluster(
  members: number[],
  points: ScreenPoint[],
  diameter: number,
  into: ScreenPoint[],
): void {
  if (members.length === 1) {
    const only = members[0]!;
    into[only] = points[only]!;
    return;
  }

  const ordered = [...members].sort((a, b) => points[a]!.x - points[b]!.x || a - b);
  const centreX = ordered.reduce((sum, i) => sum + points[i]!.x, 0) / ordered.length;
  const centreY = ordered.reduce((sum, i) => sum + points[i]!.y, 0) / ordered.length;
  const first = centreX - ((ordered.length - 1) * diameter) / 2;

  ordered.forEach((index, position) => {
    into[index] = { x: first + position * diameter, y: centreY };
  });
}

/**
 * Pixel offsets that keep every marker at least `diameter` from every other,
 * index-aligned with `points`.
 *
 * Points that are not finite get a zero offset and take no part in the layout:
 * `Map.project()` reports `Number.MAX_VALUE` for coordinates behind the camera
 * on a pitched map, and letting that into the arithmetic would drag real pins
 * off screen.
 */
export function resolveMarkerCollisions(
  points: ScreenPoint[],
  diameter: number,
): MarkerOffset[] {
  // A fresh tuple per marker rather than one shared constant: the caller owns
  // these, and a single aliased instance would let one marker's offset being
  // adjusted silently move every other unmoved marker too.
  const offsets: MarkerOffset[] = points.map((): MarkerOffset => [0, 0]);
  const live = points.map((_, i) => i).filter((i) => isUsablePoint(points[i]!));
  if (live.length < 2) return offsets;

  // Cluster id per point; starts as "everyone alone".
  const clusterOf = new Map<number, number>(live.map((i) => [i, i]));
  const placed: ScreenPoint[] = [...points];

  // Lay the current clusters out, then look for pairs that *still* collide and
  // merge them. Clusters only ever merge, so this cannot cycle; merging every
  // colliding pair per pass (rather than one at a time) is what keeps a pile of
  // N coincident pins converging in a couple of passes instead of N.
  for (let pass = 0; pass <= live.length; pass += 1) {
    const members = new Map<number, number[]>();
    for (const i of live) {
      const id = clusterOf.get(i)!;
      members.set(id, [...(members.get(id) ?? []), i]);
    }
    for (const group of members.values()) {
      layoutCluster(group, points, diameter, placed);
    }

    const merges: Array<[number, number]> = [];
    for (let a = 0; a < live.length; a += 1) {
      for (let b = a + 1; b < live.length; b += 1) {
        const i = live[a]!;
        const j = live[b]!;
        if (clusterOf.get(i) === clusterOf.get(j)) continue;
        const gap = Math.hypot(placed[i]!.x - placed[j]!.x, placed[i]!.y - placed[j]!.y);
        if (gap < diameter - EPSILON) merges.push([i, j]);
      }
    }
    if (merges.length === 0) break;

    for (const [i, j] of merges) {
      const from = clusterOf.get(j)!;
      const to = clusterOf.get(i)!;
      if (from === to) continue;
      for (const k of live) {
        if (clusterOf.get(k) === from) clusterOf.set(k, to);
      }
    }
  }

  for (const i of live) {
    const dx = placed[i]!.x - points[i]!.x;
    const dy = placed[i]!.y - points[i]!.y;
    if (dx !== 0 || dy !== 0) offsets[i] = [dx, dy];
  }
  return offsets;
}
