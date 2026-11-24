import { describe, it, expect } from 'vitest';
import { PropertyEntity, type PropertyProps } from './property.entity';
import type { GeocodingResult } from './geocoding.service';

function makeProperty(overrides: Partial<PropertyProps> = {}): PropertyEntity {
  const now = new Date('2026-11-24T00:00:00.000Z');
  return new PropertyEntity({
    id: 'p1',
    tenantId: 't1',
    branchId: null,
    propertyCode: 'PROP-1',
    type: 'HOUSE',
    street: '1 George St',
    addressLine2: null,
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'AU',
    lat: null,
    lng: null,
    geocodingStatus: 'PENDING',
    notes: null,
    rulesJson: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  });
}

describe('PropertyEntity.applyGeocodingResult (PR-18 rule A)', () => {
  it('sets SUCCESS for a high-relevance address result', () => {
    const p = makeProperty();
    const result: GeocodingResult = { lat: -33.86, lng: 151.2, placeType: 'address', relevance: 0.95 };
    p.applyGeocodingResult(result, { permanent: true });
    expect(p.geocodingStatus).toBe('SUCCESS');
    expect(p.lat).toBe(-33.86);
    expect(p.lng).toBe(151.2);
    expect(p.geocodedPermanentlyAt).toBeInstanceOf(Date);
    expect(p.geocodingFailureCode).toBeNull();
  });

  it('sets FAILED + LOW_RELEVANCE for an address result with relevance < 0.8', () => {
    const p = makeProperty();
    const result: GeocodingResult = { lat: -33.86, lng: 151.2, placeType: 'address', relevance: 0.4 };
    p.applyGeocodingResult(result, { permanent: true });
    expect(p.geocodingStatus).toBe('FAILED');
    expect(p.lat).toBeNull();
    expect(p.lng).toBeNull();
    expect(p.geocodedPermanentlyAt).toBeNull();
    expect(p.geocodingFailureCode).toBe('LOW_RELEVANCE');
  });

  it('sets FAILED + COARSE_RESULT for a non-address result (e.g. region)', () => {
    const p = makeProperty();
    const result: GeocodingResult = { lat: -33.86, lng: 151.2, placeType: 'region', relevance: 0.99 };
    p.applyGeocodingResult(result, { permanent: true });
    expect(p.geocodingStatus).toBe('FAILED');
    expect(p.lat).toBeNull();
    expect(p.geocodingFailureCode).toBe('COARSE_RESULT');
  });

  it('sets FAILED + COARSE_RESULT for a rural place result (Tilpa — place, 0.667)', () => {
    const p = makeProperty();
    const result: GeocodingResult = { lat: -30.9, lng: 144.4, placeType: 'place', relevance: 0.667 };
    p.applyGeocodingResult(result, { permanent: true });
    expect(p.geocodingStatus).toBe('FAILED');
    expect(p.lat).toBeNull();
    expect(p.geocodingFailureCode).toBe('COARSE_RESULT');
  });

  it('sets FAILED + COARSE_RESULT for a locality result (no longer a success — part 3 decided)', () => {
    const p = makeProperty();
    const result: GeocodingResult = { lat: -33.86, lng: 151.2, placeType: 'locality', relevance: 0.9 };
    p.applyGeocodingResult(result, { permanent: true });
    expect(p.geocodingStatus).toBe('FAILED');
    expect(p.geocodingFailureCode).toBe('COARSE_RESULT');
  });

  it('sets FAILED without a failure code when the address is not found (null result)', () => {
    const p = makeProperty({ geocodingFailureCode: null });
    p.applyGeocodingResult(null, { permanent: true });
    expect(p.geocodingStatus).toBe('FAILED');
    expect(p.lat).toBeNull();
    expect(p.geocodingFailureCode).toBeNull();
  });
});
