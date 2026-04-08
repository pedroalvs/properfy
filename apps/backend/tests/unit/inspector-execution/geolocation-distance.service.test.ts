import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMeters,
  GEOLOCATION_MISMATCH_THRESHOLD_METERS,
} from '../../../src/modules/inspector-execution/domain/geolocation-distance.service';

describe('haversineDistanceMeters', () => {
  it('should return 0 for identical coordinates', () => {
    const d = haversineDistanceMeters(-33.8568, 151.2153, -33.8568, 151.2153);
    expect(d).toBe(0);
  });

  it('should compute correct distance for known Sydney points (~200m)', () => {
    // Sydney Opera House to nearby point
    const d = haversineDistanceMeters(-33.8568, 151.2153, -33.8550, 151.2153);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(250);
  });

  it('should compute correct distance for ~5km apart', () => {
    // ~5.2km apart (north-south along same longitude)
    const d = haversineDistanceMeters(-33.8568, 151.2153, -33.8100, 151.2153);
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(6000);
  });

  it('should compute correct distance for well-known reference (~16200km, Sydney to London)', () => {
    // Approximate distance Sydney to London
    const d = haversineDistanceMeters(-33.8688, 151.2093, 51.5074, -0.1278);
    expect(d).toBeGreaterThan(16_000_000);
    expect(d).toBeLessThan(17_500_000);
  });

  it('should be symmetric', () => {
    const d1 = haversineDistanceMeters(-33.8568, 151.2153, -33.8100, 151.2153);
    const d2 = haversineDistanceMeters(-33.8100, 151.2153, -33.8568, 151.2153);
    expect(d1).toBeCloseTo(d2, 5);
  });
});

describe('GEOLOCATION_MISMATCH_THRESHOLD_METERS', () => {
  it('should be 500', () => {
    expect(GEOLOCATION_MISMATCH_THRESHOLD_METERS).toBe(500);
  });
});
