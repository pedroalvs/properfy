import { describe, it, expect } from 'vitest';
import { resolveCoincidentMarkerOffsets } from './marker-collision';
import type { PointLike } from './plottable-point';

const D = 36;

/** A Sydney-ish coordinate, so the fixtures stay inside plottable range. */
function at(latitude: number, longitude: number): PointLike {
  return { latitude, longitude };
}

describe('resolveCoincidentMarkerOffsets', () => {
  it('leaves distinct coordinates alone, however close they are', () => {
    // ~10m apart: these project on top of each other when zoomed out, and the
    // previous proximity-based rule pulled them into a row at those zooms. They
    // must now stay on their true positions — zooming in separates them.
    const points = [at(-33.8688, 151.2093), at(-33.86889, 151.20939), at(-33.9, 151.3)];
    expect(resolveCoincidentMarkerOffsets(points, D)).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it('splits two markers on the same coordinate into a touching horizontal pair', () => {
    const points = [at(-33.8688, 151.2093), at(-33.8688, 151.2093)];
    expect(resolveCoincidentMarkerOffsets(points, D)).toEqual([
      [-D / 2, 0],
      [D / 2, 0],
    ]);
  });

  it('lays three markers on the same coordinate out as a centred row', () => {
    const points = [at(-33.8, 151.2), at(-33.8, 151.2), at(-33.8, 151.2)];
    expect(resolveCoincidentMarkerOffsets(points, D)).toEqual([
      [-D, 0],
      [0, 0],
      [D, 0],
    ]);
  });

  it('offsets each coincident group independently and index-aligned', () => {
    const points = [
      at(-33.8, 151.2), // group A
      at(-34.0, 151.0), // lone
      at(-33.8, 151.2), // group A
      at(-34.5, 150.5), // group B
      at(-34.5, 150.5), // group B
    ];
    expect(resolveCoincidentMarkerOffsets(points, D)).toEqual([
      [-D / 2, 0],
      [0, 0],
      [D / 2, 0],
      [-D / 2, 0],
      [D / 2, 0],
    ]);
  });

  it('treats coordinates equal to six decimals as the same spot', () => {
    // Geocoding the same address twice, plus float noise from the JSON
    // round-trip: ~1cm apart is the same pin position at every zoom.
    const points = [at(-33.868800000001, 151.2093), at(-33.8688, 151.209300000002)];
    expect(resolveCoincidentMarkerOffsets(points, D)).toEqual([
      [-D / 2, 0],
      [D / 2, 0],
    ]);
  });

  it('gives unplottable coordinates a zero offset and keeps them out of the layout', () => {
    const points: PointLike[] = [
      at(-33.8688, 151.2093),
      { latitude: null, longitude: 151.2093 },
      at(Number.NaN, 151.2093),
      at(91, 200),
      at(-33.8688, 151.2093),
    ];
    const offsets = resolveCoincidentMarkerOffsets(points, D);
    expect(offsets[1]).toEqual([0, 0]);
    expect(offsets[2]).toEqual([0, 0]);
    expect(offsets[3]).toEqual([0, 0]);
    // The two real pins still pair up despite the junk between them.
    expect(offsets[0]).toEqual([-D / 2, 0]);
    expect(offsets[4]).toEqual([D / 2, 0]);
  });

  it('returns a fresh tuple per marker so callers cannot alias one offset', () => {
    const offsets = resolveCoincidentMarkerOffsets([at(-33.8, 151.2), at(-34, 151)], D);
    expect(offsets[0]).not.toBe(offsets[1]);
  });

  it('is deterministic and index-aligned', () => {
    const points = [at(-33.8, 151.2), at(-33.8, 151.2), at(-33.9, 151.2)];
    expect(resolveCoincidentMarkerOffsets(points, D)).toEqual(
      resolveCoincidentMarkerOffsets(points, D),
    );
    expect(resolveCoincidentMarkerOffsets(points, D)).toHaveLength(points.length);
  });

  it('returns an empty result for no points', () => {
    expect(resolveCoincidentMarkerOffsets([], D)).toEqual([]);
  });
});
