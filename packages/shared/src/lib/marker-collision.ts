/**
 * Spreads markers that sit on the *same coordinate* so none of them is drawn
 * invisibly underneath another.
 *
 * Deliberately narrow: pins are meant to show where things actually are, so a
 * marker is only ever moved when no amount of zooming could separate it from a
 * neighbour — i.e. when the coordinates are identical. Two pins that merely
 * *look* close at the current zoom are left exactly where they belong; the user
 * separates those by zooming in, and nudging them apart would misreport their
 * position at every zoom level in between.
 *
 * Because coincidence is a fact about coordinates rather than pixels, the
 * result does not depend on the camera: callers compute it once per pin set,
 * with no reprojection on `moveend`.
 *
 * Deliberately free of mapbox types — it takes plain coordinates and returns
 * plain pixel offsets — so it is unit-testable without a map and usable by both
 * frontends. Same reasoning as the sibling `plottable-point` module, whose
 * validity rule it reuses.
 */

import { isPlottablePoint, type PointLike } from './plottable-point';

/** Pixel offset to apply to a marker: `[dx, dy]`. */
export type MarkerOffset = [number, number];

/**
 * Decimal places at which two coordinates count as the same spot: ~0.11m, well
 * below the width of a pin at maximum zoom. Rounding rather than comparing
 * exactly absorbs the float noise a coordinate picks up crossing the API, which
 * would otherwise leave two pins for one address stacked on top of each other.
 */
const COINCIDENT_PRECISION = 6;

function coordinateKey(point: { latitude: number; longitude: number }): string {
  return `${point.latitude.toFixed(COINCIDENT_PRECISION)},${point.longitude.toFixed(COINCIDENT_PRECISION)}`;
}

/**
 * Pixel offsets that pull markers sharing a coordinate into a touching
 * horizontal row centred on that coordinate, index-aligned with `points`.
 *
 * Everything else — a marker alone at its coordinate, or one whose coordinate
 * cannot be drawn at all — gets a zero offset and stays on its true position.
 * Members of a group are laid out in input order, so a caller wanting a stable
 * left-to-right arrangement across refetches must hand in a stable order.
 */
export function resolveCoincidentMarkerOffsets(
  points: PointLike[],
  diameter: number,
): MarkerOffset[] {
  // A fresh tuple per marker rather than one shared constant: the caller owns
  // these, and a single aliased instance would let one marker's offset being
  // adjusted silently move every other unmoved marker too.
  const offsets: MarkerOffset[] = points.map((): MarkerOffset => [0, 0]);

  // Group indices by coordinate. Unplottable points take no part: a NaN or
  // out-of-range coordinate is not a position, and letting several of them
  // share the key "NaN,NaN" would invent a group out of junk.
  const groups = new Map<string, number[]>();
  points.forEach((point, index) => {
    if (!isPlottablePoint(point)) return;
    const key = coordinateKey(point);
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  });

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = -((group.length - 1) * diameter) / 2;
    group.forEach((index, position) => {
      offsets[index] = [first + position * diameter, 0];
    });
  }

  return offsets;
}
