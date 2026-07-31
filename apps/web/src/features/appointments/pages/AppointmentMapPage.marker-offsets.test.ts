/**
 * Pure coverage for `computeMarkerOffsets` — the appointments map's answer to
 * two pins landing on the same spot. The projection is injected, so this needs
 * no Mapbox runtime; the collision maths itself lives in and is tested by
 * `@properfy/shared`.
 */

import { describe, it, expect } from 'vitest';
import { computeMarkerOffsets } from './AppointmentMapPage';

const D = 36;
/** 1 degree = 1000px, mirroring nothing in particular — just deterministic. */
const project = ([lng, lat]: [number, number]) => ({ x: lng * 1000, y: -lat * 1000 });

const pin = (id: string, longitude: number, latitude: number) => ({ id, longitude, latitude });

describe('computeMarkerOffsets', () => {
  it('leaves well-separated pins alone', () => {
    const offsets = computeMarkerOffsets(
      [pin('a', 151.0, -33.8), pin('b', 152.0, -33.8)],
      project,
      D,
    );
    expect(offsets.get('a')).toEqual([0, 0]);
    expect(offsets.get('b')).toEqual([0, 0]);
  });

  it('pulls two pins at the same address apart', () => {
    const offsets = computeMarkerOffsets(
      [pin('a', 151.0, -33.8), pin('b', 151.0, -33.8)],
      project,
      D,
    );
    expect(offsets.get('a')).not.toEqual(offsets.get('b'));
  });

  it('keeps every drawn pin at least one diameter from every other', () => {
    const pins = [
      pin('a', 151.0, -33.8),
      pin('b', 151.0, -33.8),
      pin('c', 151.001, -33.8),
      pin('d', 155.0, -30.0),
    ];
    const offsets = computeMarkerOffsets(pins, project, D);

    const drawn = pins.map((p) => {
      const { x, y } = project([p.longitude, p.latitude]);
      const [dx, dy] = offsets.get(p.id)!;
      return { x: x + dx, y: y + dy };
    });
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        expect(Math.hypot(drawn[i]!.x - drawn[j]!.x, drawn[i]!.y - drawn[j]!.y)).toBeGreaterThanOrEqual(
          D - 1e-6,
        );
      }
    }
  });

  it('keys the result by pin id and reports nothing for an unknown one', () => {
    const offsets = computeMarkerOffsets([pin('a', 151.0, -33.8)], project, D);
    expect(offsets.get('a')).toEqual([0, 0]);
    expect(offsets.get('nope')).toBeUndefined();
  });

  it('returns an empty map for no pins', () => {
    expect(computeMarkerOffsets([], project, D).size).toBe(0);
  });
});
