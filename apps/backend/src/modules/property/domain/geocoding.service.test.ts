import { describe, it, expect } from 'vitest';
import { classifyGeocodingResult, type GeocodingResult } from './geocoding.service';

const base: GeocodingResult = { lat: -33.86, lng: 151.2 };

describe('classifyGeocodingResult (PR-18 rule A — only a confident address succeeds)', () => {
  // Real Mapbox probe data (Pedro-authorized). Each case keeps its actual
  // relevance/place_type so the 0.7 threshold margin is documented concretely.

  it("accepts the only confident address — '1 Martin Place, Sydney NSW 2000' (address, 0.894)", () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.894 })).toEqual({
      accepted: true,
    });
  });

  it("rejects the D-05 defect case — '999 Qwertyzzz…' (address, 0.379) as LOW_RELEVANCE", () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.379 })).toEqual({
      accepted: false,
      reason: 'LOW_RELEVANCE',
    });
  });

  it("rejects '50 Louth Road, Tilpa NSW 2840' (address, 0.667) as LOW_RELEVANCE (< 0.7)", () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.667 })).toEqual({
      accepted: false,
      reason: 'LOW_RELEVANCE',
    });
  });

  it("rejects rural 'Tilpa NSW 2840' (place, 0.667) as COARSE_RESULT (non-address)", () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'place', relevance: 0.667 })).toEqual({
      accepted: false,
      reason: 'COARSE_RESULT',
    });
  });

  it("rejects urban nonexistent '99999 Nonexistent St, Parramatta NSW 2150' (postcode, 0.522) as COARSE_RESULT", () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'postcode', relevance: 0.522 })).toEqual({
      accepted: false,
      reason: 'COARSE_RESULT',
    });
  });

  // Threshold boundary (lowered 0.8 → 0.7, Pedro's decision 2026-11-25).
  it('accepts an address with relevance exactly 0.70 (boundary is inclusive)', () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.7 })).toEqual({
      accepted: true,
    });
  });

  it('rejects an address at 0.6999 (just below the 0.70 boundary) as LOW_RELEVANCE', () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.6999 })).toEqual({
      accepted: false,
      reason: 'LOW_RELEVANCE',
    });
  });

  it('rejects a non-address (coarse) result at ANY relevance — place at 0.95 → COARSE_RESULT', () => {
    expect(classifyGeocodingResult({ ...base, placeType: 'place', relevance: 0.95 })).toEqual({
      accepted: false,
      reason: 'COARSE_RESULT',
    });
  });

  it.each(['locality', 'place', 'postcode', 'district', 'region', 'country', 'neighborhood', 'poi'])(
    'rejects non-address place type "%s" as COARSE_RESULT regardless of relevance',
    (placeType) => {
      expect(classifyGeocodingResult({ ...base, placeType, relevance: 0.99 })).toEqual({
        accepted: false,
        reason: 'COARSE_RESULT',
      });
    },
  );

  it('accepts a result without a place type (stub/legacy/test double — no evidence to reject)', () => {
    expect(classifyGeocodingResult(base)).toEqual({ accepted: true });
  });
});
