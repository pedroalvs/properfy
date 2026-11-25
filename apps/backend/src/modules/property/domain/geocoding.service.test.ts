import { describe, it, expect } from 'vitest';
import { classifyGeocodingResult, type GeocodingResult } from './geocoding.service';

const base: GeocodingResult = { lat: -33.86, lng: 151.2 };

describe('classifyGeocodingResult (rule A — confident address in the informed suburb)', () => {
  it('accepts a confident address whose returned suburb matches the informed suburb', () => {
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.894, suburb: 'Sydney' }, 'Sydney'),
    ).toEqual({ accepted: true });
  });

  it('accepts at the 0.80 boundary (inclusive) with a matching suburb', () => {
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.8, suburb: 'Chatswood' }, 'Chatswood'),
    ).toEqual({ accepted: true });
  });

  it('rejects just below the boundary (0.7999) as LOW_RELEVANCE', () => {
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.7999, suburb: 'Chatswood' }, 'Chatswood'),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('rejects a non-address place type at ANY relevance (COARSE_RESULT)', () => {
    for (const placeType of ['locality', 'place', 'postcode', 'district', 'region', 'country', 'neighborhood', 'poi']) {
      expect(
        classifyGeocodingResult({ ...base, placeType, relevance: 0.99, suburb: 'Sydney' }, 'Sydney'),
      ).toEqual({ accepted: false, reason: 'COARSE_RESULT' });
    }
  });

  it('rejects an address whose returned suburb differs from the informed suburb (reuses LOW_RELEVANCE)', () => {
    // DEV case: "14 Miller St, Chatswood" but Mapbox lands in North Sydney.
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.92, suburb: 'North Sydney' },
        'Chatswood',
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('rejects a wrong-postcode import that lands in the wrong suburb (Penshurst → Coogee)', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.85, suburb: 'Coogee' },
        'Penshurst',
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('accepts the 7 bad-import rows once the query is clean and the suburb matches', () => {
    // After dropDuplicateLine2 the query is clean; Mapbox returns the right suburb.
    for (const suburb of ['Hurstville', 'Penshurst', 'Bexley', 'Carlton', 'Brighton-le-sands']) {
      expect(
        classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.9, suburb }, suburb),
      ).toEqual({ accepted: true });
    }
  });

  it('accepts when informed and returned suburb differ only by hyphen/case (Brighton-le-sands)', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.9, suburb: 'Brighton Le Sands' },
        'Brighton-le-sands',
      ),
    ).toEqual({ accepted: true });
  });

  it('rejects an address with a MISSING returned suburb when a suburb is expected', () => {
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.95 }, 'Chatswood'),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('low relevance is rejected before the suburb check (still LOW_RELEVANCE)', () => {
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.4, suburb: 'Chatswood' }, 'Chatswood'),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('accepts a result without a place type (stub/legacy/test double — no evidence to reject)', () => {
    expect(classifyGeocodingResult(base, undefined)).toEqual({ accepted: true });
    expect(classifyGeocodingResult(base, 'Chatswood')).toEqual({ accepted: true });
  });

  it('suburb gate fails CLOSED — an address with an empty/missing informed suburb is rejected', () => {
    // Pedro's rule: "no suburb → reject". A real address result must never be
    // accepted unverified just because the caller lacked an expected suburb.
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.9, suburb: 'Somewhere' }, undefined),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.9, suburb: 'Somewhere' }, ''),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });
});
