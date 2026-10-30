import { describe, it, expect } from 'vitest';
import { evaluateGeofence } from '../../../src/modules/inspector-execution/domain/geofence.service';

describe('evaluateGeofence', () => {
  it('FLAG, inside radius → not out, not blocked, no fallback', () => {
    expect(evaluateGeofence({ distanceMeters: 120, accuracyMeters: 10, radiusMeters: 300, mode: 'FLAG' })).toEqual({
      outOfRadius: false,
      effectiveMode: 'FLAG',
      fallbackReason: null,
      blocked: false,
    });
  });

  it('FLAG, outside radius → out, not blocked', () => {
    expect(evaluateGeofence({ distanceMeters: 640, accuracyMeters: 10, radiusMeters: 300, mode: 'FLAG' })).toEqual({
      outOfRadius: true,
      effectiveMode: 'FLAG',
      fallbackReason: null,
      blocked: false,
    });
  });

  it('BLOCK, outside radius with good accuracy → blocked', () => {
    expect(evaluateGeofence({ distanceMeters: 640, accuracyMeters: 10, radiusMeters: 300, mode: 'BLOCK' })).toEqual({
      outOfRadius: true,
      effectiveMode: 'BLOCK',
      fallbackReason: null,
      blocked: true,
    });
  });

  it('BLOCK, inside radius → not blocked', () => {
    expect(evaluateGeofence({ distanceMeters: 290, accuracyMeters: 10, radiusMeters: 300, mode: 'BLOCK' })).toMatchObject({
      outOfRadius: false,
      effectiveMode: 'BLOCK',
      blocked: false,
    });
  });

  it('BLOCK, distance exactly at the radius → inside (strict >)', () => {
    const r = evaluateGeofence({ distanceMeters: 300, accuracyMeters: 10, radiusMeters: 300, mode: 'BLOCK' });
    expect(r.outOfRadius).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it('BLOCK, no property coordinates → falls back to FLAG (NO_PROPERTY_COORDINATES)', () => {
    expect(evaluateGeofence({ distanceMeters: null, accuracyMeters: 10, radiusMeters: 300, mode: 'BLOCK' })).toEqual({
      outOfRadius: false,
      effectiveMode: 'FLAG',
      fallbackReason: 'NO_PROPERTY_COORDINATES',
      blocked: false,
    });
  });

  it('BLOCK, no accuracy → falls back to FLAG (NO_ACCURACY)', () => {
    expect(evaluateGeofence({ distanceMeters: 640, accuracyMeters: null, radiusMeters: 300, mode: 'BLOCK' })).toEqual({
      outOfRadius: true,
      effectiveMode: 'FLAG',
      fallbackReason: 'NO_ACCURACY',
      blocked: false,
    });
  });

  it('BLOCK, accuracy coarser than radius → falls back to FLAG (POOR_ACCURACY)', () => {
    expect(evaluateGeofence({ distanceMeters: 640, accuracyMeters: 350, radiusMeters: 300, mode: 'BLOCK' })).toEqual({
      outOfRadius: true,
      effectiveMode: 'FLAG',
      fallbackReason: 'POOR_ACCURACY',
      blocked: false,
    });
  });

  it('BLOCK, accuracy exactly equal to radius → still BLOCK (only strictly coarser falls back)', () => {
    const r = evaluateGeofence({ distanceMeters: 640, accuracyMeters: 300, radiusMeters: 300, mode: 'BLOCK' });
    expect(r.effectiveMode).toBe('BLOCK');
    expect(r.blocked).toBe(true);
  });
});
