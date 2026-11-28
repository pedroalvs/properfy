import { describe, it, expect } from 'vitest';
import {
  formatGeocodingQuery,
  isSameGeocodingAddress,
  type GeocodableAddress,
} from '../../../src/shared/domain/geocoding-address';

const BASE: GeocodableAddress = {
  street: '45 Pacific Hwy',
  suburb: 'North Sydney',
  state: 'NSW',
  postcode: '2060',
  country: 'AU',
};

describe('isSameGeocodingAddress', () => {
  it('treats a missing/empty country as the platform default AU (O-9)', () => {
    // Legacy branch address_json has no country; the form re-sends country 'AU'
    // (branchAddressSchema default). These must compare EQUAL so an identical
    // re-send is not seen as a change.
    const storedNoCountry = { street: '45 Pacific Hwy', suburb: 'North Sydney', state: 'NSW', postcode: '2060' } as unknown as GeocodableAddress;
    const resentWithAu: GeocodableAddress = { ...BASE };

    expect(isSameGeocodingAddress(storedNoCountry, resentWithAu)).toBe(true);
    // Symmetric, and empty-string country is handled like missing.
    expect(isSameGeocodingAddress(resentWithAu, storedNoCountry)).toBe(true);
    expect(isSameGeocodingAddress({ ...BASE, country: '' }, resentWithAu)).toBe(true);
  });

  it('still reports a genuinely different address as different', () => {
    expect(isSameGeocodingAddress(BASE, { ...BASE, street: '1 Other St' })).toBe(false);
    expect(isSameGeocodingAddress(BASE, { ...BASE, postcode: '2000' })).toBe(false);
  });

  it('does not change the geocoding query string (country stays as given)', () => {
    // The country default is applied only to the comparison, not to the Mapbox query.
    const noCountry = { street: '45 Pacific Hwy', suburb: 'North Sydney', state: 'NSW', postcode: '2060' } as unknown as GeocodableAddress;
    expect(formatGeocodingQuery(noCountry)).toBe('45 Pacific Hwy, North Sydney, NSW, 2060');
  });
});
