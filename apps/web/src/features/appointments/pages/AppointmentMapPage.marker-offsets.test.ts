/**
 * Pure coverage for `computeMarkerOffsets` — the appointments map's answer to
 * two pins landing on the exact same spot. No Mapbox runtime needed: offsets
 * are derived from coordinates alone, and the grouping itself lives in and is
 * tested by `@properfy/shared`.
 */

import { describe, it, expect } from 'vitest';
import { computeMarkerOffsets } from './AppointmentMapPage';

const D = 36;

const pin = (id: string, longitude: number, latitude: number) => ({ id, longitude, latitude });

describe('computeMarkerOffsets', () => {
  it('leaves well-separated pins alone', () => {
    const offsets = computeMarkerOffsets([pin('a', 151.0, -33.8), pin('b', 152.0, -33.8)], D);
    expect(offsets.get('a')).toEqual([0, 0]);
    expect(offsets.get('b')).toEqual([0, 0]);
  });

  it('leaves pins that are merely close on their true coordinates', () => {
    // ~90m apart: they overlap on screen when zoomed out, and zooming in is
    // what separates them. Offsetting these is exactly the behaviour this
    // screen must NOT have — a pin has to report where the property is.
    const offsets = computeMarkerOffsets([pin('a', 151.0, -33.8), pin('b', 151.001, -33.8)], D);
    expect(offsets.get('a')).toEqual([0, 0]);
    expect(offsets.get('b')).toEqual([0, 0]);
  });

  it('pulls two pins at the same address apart', () => {
    const offsets = computeMarkerOffsets([pin('a', 151.0, -33.8), pin('b', 151.0, -33.8)], D);
    expect(offsets.get('a')).toEqual([-D / 2, 0]);
    expect(offsets.get('b')).toEqual([D / 2, 0]);
  });

  it('orders a coincident row by pin id, so a refetch cannot swap the pins', () => {
    const byOneOrder = computeMarkerOffsets([pin('b', 151.0, -33.8), pin('a', 151.0, -33.8)], D);
    const byOther = computeMarkerOffsets([pin('a', 151.0, -33.8), pin('b', 151.0, -33.8)], D);
    expect(byOneOrder.get('a')).toEqual(byOther.get('a'));
    expect(byOneOrder.get('b')).toEqual(byOther.get('b'));
  });

  it('keys the result by pin id and reports nothing for an unknown one', () => {
    const offsets = computeMarkerOffsets([pin('a', 151.0, -33.8)], D);
    expect(offsets.get('a')).toEqual([0, 0]);
    expect(offsets.get('nope')).toBeUndefined();
  });

  it('returns an empty map for no pins', () => {
    expect(computeMarkerOffsets([], D).size).toBe(0);
  });
});
