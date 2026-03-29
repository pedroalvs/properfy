import { distanceMeters } from '../geo';

describe('distanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(distanceMeters(-37.8136, 144.9631, -37.8136, 144.9631)).toBe(0);
  });

  it('calculates a known short distance accurately', () => {
    // ~111 meters for ~0.001 degrees latitude at equator
    const d = distanceMeters(0, 0, 0.001, 0);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('returns a value close to expected for Melbourne to Sydney (~714 km)', () => {
    const d = distanceMeters(-37.8136, 144.9631, -33.8688, 151.2093);
    expect(d).toBeGreaterThan(700_000);
    expect(d).toBeLessThan(730_000);
  });

  it('handles negative and positive longitude crossing', () => {
    const d = distanceMeters(0, -1, 0, 1);
    expect(d).toBeGreaterThan(220_000);
    expect(d).toBeLessThan(225_000);
  });
});
