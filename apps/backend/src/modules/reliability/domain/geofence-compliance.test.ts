import { describe, it, expect } from 'vitest';
import { evaluateGeofenceCompliance } from './geofence-compliance';
import { buildFact } from './__fixtures__/service-facts';

describe('evaluateGeofenceCompliance', () => {
  it('passes when both legs are within radius', () => {
    expect(evaluateGeofenceCompliance(buildFact({ outOfRadius: false, finishOutOfRadius: false }))).toBe('PASS');
  });

  it('misses when check-in is out of radius with accuracy within radius', () => {
    const fact = buildFact({
      outOfRadius: true,
      geolocationDistanceMeters: 420,
      startAccuracyM: 40,
      geofenceRadiusM: 300,
    });
    expect(evaluateGeofenceCompliance(fact)).toBe('MISS');
  });

  it('misses when check-out is out of radius with null accuracy (legacy client)', () => {
    const fact = buildFact({
      finishOutOfRadius: true,
      finishGeolocationDistanceMeters: 500,
      finishAccuracyM: null,
      geofenceRadiusM: 300,
    });
    expect(evaluateGeofenceCompliance(fact)).toBe('MISS');
  });

  it('passes when the out-of-radius check-in is inconclusive (accuracy > radius) and check-out is in', () => {
    const fact = buildFact({
      outOfRadius: true,
      geolocationDistanceMeters: 420,
      startAccuracyM: 450,
      finishOutOfRadius: false,
      finishGeolocationDistanceMeters: 50,
      geofenceRadiusM: 300,
    });
    expect(evaluateGeofenceCompliance(fact)).toBe('PASS');
  });

  it('excludes when the only evaluable leg is inconclusive and the other is not measured', () => {
    const fact = buildFact({
      outOfRadius: true,
      geolocationDistanceMeters: 420,
      startAccuracyM: 450,
      finishGeolocationDistanceMeters: null,
      geofenceRadiusM: 300,
    });
    expect(evaluateGeofenceCompliance(fact)).toBe('EXCLUDED');
  });

  it('excludes when the property has no coordinates (both distances null)', () => {
    const fact = buildFact({ geolocationDistanceMeters: null, finishGeolocationDistanceMeters: null });
    expect(evaluateGeofenceCompliance(fact)).toBe('EXCLUDED');
  });

  it('excludes a pre-F03 execution (geofenceRadiusM null)', () => {
    expect(evaluateGeofenceCompliance(buildFact({ geofenceRadiusM: null }))).toBe('EXCLUDED');
  });

  it('excludes non-EXECUTED kinds', () => {
    expect(evaluateGeofenceCompliance(buildFact({ kind: 'DONE_WITHOUT_EXECUTION' }))).toBe('EXCLUDED');
    expect(evaluateGeofenceCompliance(buildFact({ kind: 'CANT_ATTEND' }))).toBe('EXCLUDED');
    expect(evaluateGeofenceCompliance(buildFact({ kind: 'NO_SHOW_REJECTED' }))).toBe('EXCLUDED');
  });
});
