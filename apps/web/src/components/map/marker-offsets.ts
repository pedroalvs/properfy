import type { MarkerOffset } from '@properfy/shared';
import { resolveCoincidentMarkerOffsets } from '@properfy/shared';

/**
 * Pixel offsets that stop two pins at the *same address* being drawn on top of
 * each other, keyed by pin id.
 *
 * Only exactly-coincident pins are moved: those are the ones no zoom level can
 * separate, so one would stay invisible under the other forever. Pins that are
 * merely close keep their true position — a pin's job on a map is to say where
 * the thing is, and the operator separates crowded ones by zooming in. Since
 * coincidence does not depend on the camera, this is computed once per pin set
 * rather than on every camera move.
 *
 * Lives in `components/map` (not a page) so every map screen — the appointments
 * map and the Live Day map — can share it without pulling in a page chunk.
 */
export function computeMarkerOffsets(
  pins: Array<{ id: string; latitude: number; longitude: number }>,
  diameter: number,
): Map<string, MarkerOffset> {
  // Sorted by id so the layout does not depend on list order. Coincident pins
  // are laid out in input order, and the queries feeding these pages sort with
  // no unique tie-breaker — an unsorted input would let a refetch swap two
  // markers' offsets and make the pins jump for no reason.
  const ordered = [...pins].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offsets = resolveCoincidentMarkerOffsets(ordered, diameter);
  return new Map(ordered.map((p, index) => [p.id, offsets[index]!]));
}
