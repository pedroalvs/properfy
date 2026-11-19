import { describe, it, expect } from 'vitest';
import { formatGeocodingQuery, isSameGeocodingAddress, type GeocodableAddress } from './geocoding-address';
import { PropertyEntity, type PropertyProps } from '../../modules/property/domain/property.entity';

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
});
