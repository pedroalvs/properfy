import { describe, it, expect } from 'vitest';
import { computeBounds, isSinglePointBounds } from '../map-bounds';

describe('computeBounds', () => {
  it('returns null for an empty list', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('returns null when all points lack coordinates', () => {
    expect(
      computeBounds([
        { latitude: null, longitude: null },
        { latitude: undefined, longitude: undefined },
      ]),
    ).toBeNull();
  });

  it('returns degenerate bounds for a single point', () => {
    const bounds = computeBounds([{ latitude: -33.87, longitude: 151.21 }]);
    expect(bounds).toEqual([
      [151.21, -33.87],
      [151.21, -33.87],
    ]);
    expect(isSinglePointBounds(bounds!)).toBe(true);
  });

  it('returns the min/max envelope for multiple points and skips invalid ones', () => {
    const bounds = computeBounds([
      { latitude: -33.87, longitude: 151.21 },
      { latitude: -33.89, longitude: 151.27 },
      { latitude: 999, longitude: 151.2 },
      { latitude: null, longitude: 151.2 },
    ]);
    expect(bounds).toEqual([
      [151.21, -33.89],
      [151.27, -33.87],
    ]);
    expect(isSinglePointBounds(bounds!)).toBe(false);
  });
});
