import { describe, it, expect } from 'vitest';
import { resolveCentroid } from '../suburb-centroid-resolver';

describe('resolveCentroid', () => {
  it('resolves a single known suburb to its table centroid', () => {
    const result = resolveCentroid([{ name: 'Surry Hills', state: 'NSW' }]);
    expect(result).not.toBeNull();
    expect(typeof result!.lat).toBe('number');
    expect(typeof result!.lng).toBe('number');
  });

  it('returns the mean centroid for multiple known suburbs', () => {
    const a = resolveCentroid([{ name: 'Surry Hills', state: 'NSW' }]);
    const b = resolveCentroid([{ name: 'Newtown', state: 'NSW' }]);
    const both = resolveCentroid([{ name: 'Surry Hills', state: 'NSW' }, { name: 'Newtown', state: 'NSW' }]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(both).not.toBeNull();
    // mean of two points
    expect(both!.lat).toBeCloseTo((a!.lat + b!.lat) / 2, 5);
    expect(both!.lng).toBeCloseTo((a!.lng + b!.lng) / 2, 5);
  });

  it('returns null for a single unknown suburb', () => {
    const result = resolveCentroid([{ name: 'ZZZ_NONEXISTENT_SUBURB_XYZ', state: 'NSW' }]);
    expect(result).toBeNull();
  });

  it('skips unknown suburbs and uses the known ones', () => {
    const knownOnly = resolveCentroid([{ name: 'Surry Hills', state: 'NSW' }]);
    const mixed = resolveCentroid([
      { name: 'Surry Hills', state: 'NSW' },
      { name: 'ZZZ_NONEXISTENT_SUBURB_XYZ', state: 'NSW' },
    ]);

    expect(knownOnly).not.toBeNull();
    expect(mixed).not.toBeNull();
    expect(mixed!.lat).toBeCloseTo(knownOnly!.lat, 5);
    expect(mixed!.lng).toBeCloseTo(knownOnly!.lng, 5);
  });

  it('returns null when all suburbs are unknown', () => {
    const result = resolveCentroid([
      { name: 'ZZZ_NONEXISTENT_1', state: 'NSW' },
      { name: 'ZZZ_NONEXISTENT_2', state: 'VIC' },
    ]);
    expect(result).toBeNull();
  });

  it('normalises case and trims whitespace', () => {
    const normal = resolveCentroid([{ name: 'Surry Hills', state: 'NSW' }]);
    const upper = resolveCentroid([{ name: 'SURRY HILLS', state: 'NSW' }]);
    const padded = resolveCentroid([{ name: '  surry hills  ', state: 'NSW' }]);

    expect(normal).not.toBeNull();
    expect(upper!.lat).toBeCloseTo(normal!.lat, 5);
    expect(padded!.lat).toBeCloseTo(normal!.lat, 5);
  });
});
