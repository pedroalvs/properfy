import { describe, it, expect } from 'vitest';
import { computeBounds, isSinglePointBounds } from '../map-bounds';

describe('computeBounds', () => {
  it('returns null for empty array', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('returns null when all points have null coordinates', () => {
    const points = [
      { latitude: null, longitude: null },
      { latitude: null, longitude: 150 },
      { latitude: -33, longitude: null },
    ];
    expect(computeBounds(points)).toBeNull();
  });

  it('returns degenerate bounds for a single valid point', () => {
    const bounds = computeBounds([{ latitude: -33.8688, longitude: 151.2093 }]);
    expect(bounds).toEqual([
      [151.2093, -33.8688],
      [151.2093, -33.8688],
    ]);
  });

  it('returns correct sw/ne tuple for multiple points', () => {
    const points = [
      { latitude: -33.8688, longitude: 151.2093 }, // Sydney
      { latitude: -37.8136, longitude: 144.9631 }, // Melbourne
      { latitude: -27.4698, longitude: 153.0251 }, // Brisbane
    ];
    const bounds = computeBounds(points);
    expect(bounds).toEqual([
      [144.9631, -37.8136], // sw: min lng, min lat
      [153.0251, -27.4698], // ne: max lng, max lat
    ]);
  });

  it('skips points with null latitude or longitude', () => {
    const points = [
      { latitude: -33.8688, longitude: 151.2093 },
      { latitude: null, longitude: 150 },
      { latitude: -34, longitude: null },
      { latitude: -37.8136, longitude: 144.9631 },
    ];
    const bounds = computeBounds(points);
    expect(bounds).toEqual([
      [144.9631, -37.8136],
      [151.2093, -33.8688],
    ]);
  });

  it('skips points with out-of-range latitude', () => {
    const points = [
      { latitude: 91, longitude: 0 }, // invalid
      { latitude: -33.8688, longitude: 151.2093 },
    ];
    expect(computeBounds(points)).toEqual([
      [151.2093, -33.8688],
      [151.2093, -33.8688],
    ]);
  });

  it('skips points with out-of-range longitude', () => {
    const points = [
      { latitude: 0, longitude: -181 }, // invalid
      { latitude: 0, longitude: 181 }, // invalid
      { latitude: -33.8688, longitude: 151.2093 },
    ];
    expect(computeBounds(points)).toEqual([
      [151.2093, -33.8688],
      [151.2093, -33.8688],
    ]);
  });

  it('skips non-finite coordinates (NaN, Infinity)', () => {
    const points = [
      { latitude: Number.NaN, longitude: 0 },
      { latitude: 0, longitude: Number.POSITIVE_INFINITY },
      { latitude: -33.8688, longitude: 151.2093 },
    ];
    expect(computeBounds(points)).toEqual([
      [151.2093, -33.8688],
      [151.2093, -33.8688],
    ]);
  });

  it('handles undefined coordinates as null', () => {
    const points = [
      { latitude: undefined, longitude: undefined },
      { latitude: -33.8688, longitude: 151.2093 },
    ];
    expect(computeBounds(points)).toEqual([
      [151.2093, -33.8688],
      [151.2093, -33.8688],
    ]);
  });
});

describe('isSinglePointBounds', () => {
  it('returns true for degenerate bounds (same sw and ne)', () => {
    expect(isSinglePointBounds([[151.2093, -33.8688], [151.2093, -33.8688]])).toBe(true);
  });

  it('returns false for distinct sw and ne', () => {
    expect(isSinglePointBounds([[144.9631, -37.8136], [153.0251, -27.4698]])).toBe(false);
  });
});
