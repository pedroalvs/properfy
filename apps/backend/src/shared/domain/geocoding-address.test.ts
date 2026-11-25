import { describe, it, expect } from 'vitest';
import {
  formatGeocodingQuery,
  isSameGeocodingAddress,
  dropDuplicateLine2,
  normalizeSuburb,
  normEqualSuburb,
  type GeocodableAddress,
} from './geocoding-address';
import { PropertyEntity, type PropertyProps, propertyFullAddress } from '../../modules/property/domain/property.entity';
import { buildNormalizedAddressKey } from './normalize-address';

describe('formatGeocodingQuery', () => {
  it('1. joins a full branch address in field order', () => {
    expect(
      formatGeocodingQuery({
        street: '1 Main St',
        number: '10',
        complement: 'Unit 2',
        suburb: 'Parramatta',
        city: 'Sydney',
        state: 'NSW',
        postcode: '2150',
        country: 'AU',
      }),
    ).toBe('1 Main St, 10, Unit 2, Parramatta, Sydney, NSW, 2150, AU');
  });

  it('2. omits city when it equals suburb case-insensitively', () => {
    expect(
      formatGeocodingQuery({
        street: '1 Main St',
        suburb: 'Parramatta',
        city: 'parramatta',
        state: 'NSW',
        postcode: '2150',
        country: 'AU',
      }),
    ).toBe('1 Main St, Parramatta, NSW, 2150, AU');
  });

  it('3. omits null / empty / whitespace-only parts without double commas', () => {
    expect(
      formatGeocodingQuery({
        street: '1 Main St',
        number: null,
        complement: '',
        addressLine2: '   ',
        suburb: 'Parramatta',
        state: 'NSW',
        postcode: '2150',
        country: 'AU',
      }),
    ).toBe('1 Main St, Parramatta, NSW, 2150, AU');
  });

  it('4. trims surrounding whitespace on each part', () => {
    expect(
      formatGeocodingQuery({
        street: '  1 Main St ',
        suburb: ' Parramatta ',
        state: ' NSW ',
        postcode: ' 2150 ',
        country: ' AU ',
      }),
    ).toBe('1 Main St, Parramatta, NSW, 2150, AU');
  });

  it('5. places addressLine2 right after street (property shape)', () => {
    expect(
      formatGeocodingQuery({
        street: '1 Main St',
        addressLine2: 'Level 3',
        suburb: 'Parramatta',
        state: 'NSW',
        postcode: '2150',
        country: 'AU',
      }),
    ).toBe('1 Main St, Level 3, Parramatta, NSW, 2150, AU');
  });

  it('6. equals PropertyEntity.fullAddress (dec. 23 lock), with and without addressLine2', () => {
    const base: PropertyProps = {
      id: 'p1',
      tenantId: 't1',
      branchId: null,
      propertyCode: 'P-1',
      type: 'HOUSE',
      street: '1 Main St',
      addressLine2: 'Level 3',
      suburb: 'Parramatta',
      postcode: '2150',
      state: 'NSW',
      country: 'AU',
      lat: null,
      lng: null,
      geocodingStatus: 'PENDING',
      notes: null,
      rulesJson: {} as PropertyProps['rulesJson'],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const withLine2 = new PropertyEntity(base);
    expect(formatGeocodingQuery(withLine2)).toBe(withLine2.fullAddress);
    expect(formatGeocodingQuery(withLine2)).toBe('1 Main St, Level 3, Parramatta, NSW, 2150, AU');

    const noLine2 = new PropertyEntity({ ...base, addressLine2: null });
    expect(formatGeocodingQuery(noLine2)).toBe(noLine2.fullAddress);
    expect(formatGeocodingQuery(noLine2)).toBe('1 Main St, Parramatta, NSW, 2150, AU');
  });
});

describe('isSameGeocodingAddress', () => {
  it('7. true for the same address in different case / with spaces / missing city', () => {
    expect(
      isSameGeocodingAddress(
        { street: '1 Main St', suburb: 'Parramatta', city: 'Parramatta', state: 'NSW', postcode: '2150', country: 'AU' },
        { street: ' 1 MAIN ST ', suburb: 'parramatta', state: 'nsw', postcode: '2150', country: 'au' },
      ),
    ).toBe(true);
  });

  it('8. false when the postcode differs', () => {
    expect(
      isSameGeocodingAddress(
        { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', postcode: '2150', country: 'AU' },
        { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', postcode: '2151', country: 'AU' },
      ),
    ).toBe(false);
  });

  it('9. ignores extra address_json keys (latitude/longitude/formattedAddress)', () => {
    expect(
      isSameGeocodingAddress(
        {
          street: '1 Main St',
          suburb: 'Parramatta',
          state: 'NSW',
          postcode: '2150',
          country: 'AU',
          // extra keys that an address_json carries — must be ignored
          latitude: -33.8,
          longitude: 151.2,
          formattedAddress: 'x',
        } as GeocodableAddress,
        { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', postcode: '2150', country: 'AU' },
      ),
    ).toBe(true);
  });

  it('10. canonicalizes country — stored "Australia" (import) vs "AU" (screen) is unchanged', () => {
    const base = { street: '1 Main St', suburb: 'Parramatta', state: 'NSW', postcode: '2150' };
    expect(isSameGeocodingAddress({ ...base, country: 'Australia' }, { ...base, country: 'AU' })).toBe(true);
    expect(isSameGeocodingAddress({ ...base, country: 'australia' }, { ...base, country: 'AU' })).toBe(true);
    // missing country (O-9) also collapses to AU.
    expect(isSameGeocodingAddress({ ...base, country: '' }, { ...base, country: 'Australia' })).toBe(true);
    // a genuinely different country is still a change.
    expect(isSameGeocodingAddress({ ...base, country: 'NZ' }, { ...base, country: 'AU' })).toBe(false);
  });
});

describe('dropDuplicateLine2', () => {
  it('drops L2 when it starts with the street (bad-import shape — street duplicated)', () => {
    // Real DEV shape: street "3/72 Park Rd," + L2 "3/72 Park Rd, Hurstville".
    expect(dropDuplicateLine2('3/72 Park Rd,', '3/72 Park Rd, Hurstville')).toBeNull();
    // Case/comma/whitespace-insensitive.
    expect(dropDuplicateLine2('3/72 PARK RD', '3/72 park rd,  Hurstville')).toBeNull();
  });

  it('keeps a legitimate L2 (Unit/Block/building) that does not start with the street', () => {
    expect(dropDuplicateLine2('14 Miller St', 'Unit 5')).toBe('Unit 5');
    expect(dropDuplicateLine2('14 Miller St', 'Block B')).toBe('Block B');
    expect(dropDuplicateLine2('14 Miller St', 'The Horizon building')).toBe('The Horizon building');
    expect(dropDuplicateLine2('14 Miller St', '5/14')).toBe('5/14');
  });

  it('is startsWith, not contains — an L2 that embeds the street mid-string is kept', () => {
    expect(dropDuplicateLine2('Miller St', 'Unit 5, Miller St')).toBe('Unit 5, Miller St');
  });

  it('empty-street guard: never drops L2 when the street is empty/whitespace', () => {
    expect(dropDuplicateLine2('', 'anything')).toBe('anything');
    expect(dropDuplicateLine2('   ', 'anything')).toBe('anything');
    expect(dropDuplicateLine2(null, 'anything')).toBe('anything');
  });

  it('returns null for an absent/empty L2', () => {
    expect(dropDuplicateLine2('14 Miller St', null)).toBeNull();
    expect(dropDuplicateLine2('14 Miller St', '   ')).toBeNull();
  });
});

describe('builder dedup — every query builder routes L2 through dropDuplicateLine2', () => {
  const dupAddress = {
    street: '3/72 Park Rd,',
    addressLine2: '3/72 Park Rd, Hurstville',
    suburb: 'Hurstville',
    state: 'NSW',
    postcode: '2220',
    country: 'AU',
  };

  it('formatGeocodingQuery omits a duplicated L2 (fails if it bypasses the helper)', () => {
    const q = formatGeocodingQuery(dupAddress as GeocodableAddress);
    expect(q).toBe('3/72 Park Rd,, Hurstville, NSW, 2220, AU');
    expect(q).not.toContain('Park Rd, Hurstville, 3/72'); // the duplicate is gone
  });

  it('propertyFullAddress omits a duplicated L2 AND equals formatGeocodingQuery (A≡B lock)', () => {
    const q = propertyFullAddress(dupAddress);
    expect(q).toBe('3/72 Park Rd,, Hurstville, NSW, 2220, AU');
    expect(q).toBe(formatGeocodingQuery(dupAddress as GeocodableAddress));
  });

  it('both builders KEEP a legitimate L2 identically', () => {
    const legit = { ...dupAddress, addressLine2: 'Unit 5' };
    expect(propertyFullAddress(legit)).toBe('3/72 Park Rd,, Unit 5, Hurstville, NSW, 2220, AU');
    expect(propertyFullAddress(legit)).toBe(formatGeocodingQuery(legit as GeocodableAddress));
  });
});

describe('normalizeSuburb / normEqualSuburb', () => {
  it('normalizes hyphens, apostrophes, accents, case and whitespace', () => {
    expect(normalizeSuburb('Brighton-Le-Sands')).toBe('brighton le sands');
    expect(normalizeSuburb('Brighton-le-sands')).toBe('brighton le sands');
    expect(normalizeSuburb("O'Connor")).toBe('oconnor');
    expect(normalizeSuburb('  Súrry   Hills ')).toBe('surry hills');
  });

  it('normEqualSuburb: hyphen vs spaces vs case all match', () => {
    expect(normEqualSuburb('Brighton-le-sands', 'Brighton Le Sands')).toBe(true);
    expect(normEqualSuburb('Chatswood', 'chatswood')).toBe(true);
  });

  it('normEqualSuburb: different suburbs do not match; missing/empty never matches', () => {
    expect(normEqualSuburb('Chatswood', 'North Sydney')).toBe(false);
    expect(normEqualSuburb(undefined, 'Chatswood')).toBe(false);
    expect(normEqualSuburb('Chatswood', undefined)).toBe(false);
    expect(normEqualSuburb('', '')).toBe(false);
  });
});

describe('uniqueness key is unaffected by the query-only Line-2 dedup', () => {
  it('two distinct units on the same street keep distinct normalized keys', () => {
    // dropDuplicateLine2 only changes the geocoding QUERY; buildNormalizedAddressKey
    // (the per-tenant dedup key) still reads addressLine2, so Unit 5 and Unit 6
    // of the same building are different properties.
    const base = { street: '14 Miller St', suburb: 'Chatswood', state: 'NSW', postcode: '2067' };
    const k5 = buildNormalizedAddressKey({ ...base, addressLine2: 'Unit 5' });
    const k6 = buildNormalizedAddressKey({ ...base, addressLine2: 'Unit 6' });
    expect(k5).not.toBe(k6);
  });

  it('a duplicated Line 2 does not collapse the key with the no-Line-2 variant', () => {
    const base = { street: '3/72 Park Rd,', suburb: 'Hurstville', state: 'NSW', postcode: '2220' };
    const withDup = buildNormalizedAddressKey({ ...base, addressLine2: '3/72 Park Rd, Hurstville' });
    const without = buildNormalizedAddressKey({ ...base, addressLine2: null });
    // The key still reflects the stored L2 (it is NOT deduped), so these differ.
    expect(withDup).not.toBe(without);
  });
});
