import { describe, it, expect } from 'vitest';
import { classifyGeocodingResult, type GeocodingResult } from './geocoding.service';

const base: GeocodingResult = { lat: -33.86, lng: 151.2 };

describe('classifyGeocodingResult (rule A, O-14 — confident address in the informed suburb)', () => {
  it('accepts a confident address whose returned locality matches the informed suburb', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.894, suburb: 'Sydney' },
        'Sydney',
        '2000',
      ),
    ).toEqual({ accepted: true });
  });

  it('accepts at the 0.80 boundary (inclusive) with a matching locality', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.8, suburb: 'Chatswood' },
        'Chatswood',
        '2067',
      ),
    ).toEqual({ accepted: true });
  });

  it('rejects just below the boundary (0.7999) as LOW_RELEVANCE', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.7999, suburb: 'Chatswood' },
        'Chatswood',
        '2067',
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('rejects a non-address place type at ANY relevance (COARSE_RESULT)', () => {
    for (const placeType of ['locality', 'place', 'postcode', 'district', 'region', 'country', 'neighborhood', 'poi']) {
      expect(
        classifyGeocodingResult({ ...base, placeType, relevance: 0.99, suburb: 'Sydney' }, 'Sydney', '2000'),
      ).toEqual({ accepted: false, reason: 'COARSE_RESULT' });
    }
  });

  it('rejects an address whose returned locality differs from the informed suburb (reuses LOW_RELEVANCE)', () => {
    // DEV case: "14 Miller St, Chatswood" but Mapbox lands in North Sydney.
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.92, suburb: 'North Sydney' },
        'Chatswood',
        '2067',
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('rejects a wrong-postcode import that lands in the wrong suburb (Penshurst → Coogee)', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.85, suburb: 'Coogee' },
        'Penshurst',
        '2222',
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('accepts the bad-import rows once the query is clean and the locality matches', () => {
    // After dropDuplicateLine2 the query is clean; Mapbox returns the right suburb.
    for (const suburb of ['Hurstville', 'Penshurst', 'Bexley', 'Carlton', 'Brighton-le-sands']) {
      expect(
        classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.9, suburb }, suburb, '2000'),
      ).toEqual({ accepted: true });
    }
  });

  it('accepts when informed and returned locality differ only by hyphen/case (Brighton-le-sands)', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.9, suburb: 'Brighton Le Sands' },
        'Brighton-le-sands',
        '2216',
      ),
    ).toEqual({ accepted: true });
  });

  it('rejects an address with a MISSING returned locality and no place when a suburb is expected', () => {
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.95 }, 'Chatswood', '2067'),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('low relevance is rejected before the suburb check (still LOW_RELEVANCE)', () => {
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.4, suburb: 'Chatswood' },
        'Chatswood',
        '2067',
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  it('accepts a result without a place type (stub/legacy/test double — no evidence to reject)', () => {
    expect(classifyGeocodingResult(base, undefined, undefined)).toEqual({ accepted: true });
    expect(classifyGeocodingResult(base, 'Chatswood', '2067')).toEqual({ accepted: true });
  });

  it('suburb gate fails CLOSED — an address with an empty/missing informed suburb AND postcode is rejected', () => {
    // Pedro's rule: "no suburb → reject". A real address result must never be
    // accepted unverified just because the caller lacked an expected suburb.
    expect(
      classifyGeocodingResult(
        { ...base, placeType: 'address', relevance: 0.9, suburb: 'Somewhere' },
        undefined,
        undefined,
      ),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
    expect(
      classifyGeocodingResult({ ...base, placeType: 'address', relevance: 0.9, suburb: 'Somewhere' }, '', ''),
    ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
  });

  describe('O-14 — CBD addresses accepted via the place + postcode branch', () => {
    // Pedro's 5 measured cases (permanent mode, no country filter).

    it("'100 George St, Sydney 2000' → locality The Rocks / place Sydney / pc 2000 → ACCEPT", () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.95, suburb: 'The Rocks', place: 'Sydney', postcode: '2000' },
          'Sydney',
          '2000',
        ),
      ).toEqual({ accepted: true });
    });

    it("'35 Hickson Road, Sydney 2000' → locality The Rocks / place Sydney / pc 2000 → ACCEPT", () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.95, suburb: 'The Rocks', place: 'Sydney', postcode: '2000' },
          'Sydney',
          '2000',
        ),
      ).toEqual({ accepted: true });
    });

    it("'14 Miller Street, Sydney 2000' → Kingsgrove 2208 → REJECT", () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.9, suburb: 'Kingsgrove', place: 'Sydney', postcode: '2208' },
          'Sydney',
          '2000',
        ),
      ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
    });

    it("'30 Bridge Street, Sydney 2000' → Rydalmere 2116 @0.99 → REJECT", () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.99, suburb: 'Rydalmere', place: 'Sydney', postcode: '2116' },
          'Sydney',
          '2000',
        ),
      ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
    });

    it("'Sydney' + postcode 3000 → REJECT (a non-address coarse result)", () => {
      // "Sydney" with no street number geocodes to a place/locality, not an address.
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'place', relevance: 0.99, suburb: undefined, place: 'Sydney', postcode: '2000' },
          'Sydney',
          '3000',
        ),
      ).toEqual({ accepted: false, reason: 'COARSE_RESULT' });
    });

    it('place matches the suburb but the postcode does NOT → REJECT (postcode guards the place branch)', () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.95, suburb: 'The Rocks', place: 'Sydney', postcode: '2001' },
          'Sydney',
          '2000',
        ),
      ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
    });

    it('place matches the suburb but the informed postcode is empty → REJECT (fail-closed)', () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.95, suburb: 'The Rocks', place: 'Sydney', postcode: '2000' },
          'Sydney',
          '',
        ),
      ).toEqual({ accepted: false, reason: 'LOW_RELEVANCE' });
    });

    it('postcode compare trims surrounding whitespace only (" 2000 " === "2000")', () => {
      expect(
        classifyGeocodingResult(
          { ...base, placeType: 'address', relevance: 0.95, suburb: 'The Rocks', place: 'Sydney', postcode: ' 2000 ' },
          'Sydney',
          '2000',
        ),
      ).toEqual({ accepted: true });
    });
  });
});
