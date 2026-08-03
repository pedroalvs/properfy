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
 * Pairs from different clusters that are still drawn closer than `diameter`.
 *
 * Bucketed into a grid of `diameter`-wide cells rather than compared
 * pairwise: two markers can only collide if they are within one diameter, so a
 * colliding partner is always in the same cell or one of the eight around it.
 * The appointments map aggregates every page of results, so a city-wide view
 * really can carry thousands of pins, and an all-pairs scan there costs
 * seconds *per camera move* — with the grid the same work is near-linear.
 */
function findCollidingPairs(
  live: number[],
  placed: ScreenPoint[],
  diameter: number,
  clusterOf: (index: number) => number,
): Array<[number, number]> {
  const cellOf = (value: number) => Math.floor(value / diameter);
  const grid = new Map<string, number[]>();
  for (const i of live) {
    const key = `${cellOf(placed[i]!.x)},${cellOf(placed[i]!.y)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }

  const pairs: Array<[number, number]> = [];
  for (const i of live) {
    const cx = cellOf(placed[i]!.x);
    const cy = cellOf(placed[i]!.y);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          // Each unordered pair once.
          if (j <= i) continue;
          if (clusterOf(i) === clusterOf(j)) continue;
          const gap = Math.hypot(placed[i]!.x - placed[j]!.x, placed[i]!.y - placed[j]!.y);
          if (gap < diameter - EPSILON) pairs.push([i, j]);
        }
      }
    }
  }
  return pairs;
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

  // Clusters as a union-find forest: every point starts alone, and merging is
  // a single parent write rather than a sweep relabelling every member. With a
  // few thousand pins the sweep was the dominant cost once the grid above had
  // taken care of the pair scan.
  const parent = new Map<number, number>(live.map((i) => [i, i]));
  const findRoot = (index: number): number => {
    let root = index;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression: everything walked now points straight at the root.
    let step = index;
    while (parent.get(step) !== root) {
      const next = parent.get(step)!;
      parent.set(step, root);
      step = next;
    }
    return root;
  };
  const placed: ScreenPoint[] = [...points];

  // Lay the current clusters out, then look for pairs that *still* collide and
  // merge them. Clusters only ever merge, so this cannot cycle; merging every
  // colliding pair per pass (rather than one at a time) is what keeps a pile of
  // N coincident pins converging in a couple of passes instead of N.
  for (let pass = 0; pass <= live.length; pass += 1) {
    const members = new Map<number, number[]>();
    for (const i of live) {
      const id = findRoot(i);
      const group = members.get(id);
      if (group) group.push(i);
      else members.set(id, [i]);
    }
    for (const group of members.values()) {
      layoutCluster(group, points, diameter, placed);
    }

    const merges = findCollidingPairs(live, placed, diameter, findRoot);
    if (merges.length === 0) break;

    for (const [i, j] of merges) {
      const a = findRoot(i);
      const b = findRoot(j);
      if (a !== b) parent.set(b, a);
    }
  }

  for (const i of live) {
    const dx = placed[i]!.x - points[i]!.x;
    const dy = placed[i]!.y - points[i]!.y;
    if (dx !== 0 || dy !== 0) offsets[i] = [dx, dy];
  }
  return offsets;
}
