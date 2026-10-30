/**
 * Address shape accepted by the geocoding query formatter. Property and branch
 * addresses both satisfy it (property has no `number`/`complement`/`city`; a
 * branch `address_json` may carry extra keys like `latitude`, which are
 * ignored). Kept here, beside `normalize-address.ts`, as a pure domain helper.
 *
 * This is an exported contract consumed by X02 (property/branch writes) and,
 * later, by F01 (inspector base address). Its name, path and field order are a
 * cross-feature contract — do not change them without notifying F01.
 */
export interface GeocodableAddress {
  street: string;
  number?: string | null;
  complement?: string | null;
  addressLine2?: string | null;
  suburb: string;
  city?: string | null;
  state: string;
  postcode: string;
  country: string;
}

/**
 * Build the single-line query string sent to Mapbox for geocoding.
 *
 * Order: street, number, complement, addressLine2, suburb, city, state,
 * postcode, country. Each part is trimmed; empty/null/undefined parts are
 * omitted; the separator is `', '`. `city` is omitted when it equals `suburb`
 * case-insensitively (the branch form sends `city = suburb`, and the
 * duplication would worsen the match).
 *
 * Pure function, no I/O. While `PropertyEntity.fullAddress` exists,
 * `formatGeocodingQuery(entity)` returns the same string (dec. 23 lock).
 */
export function formatGeocodingQuery(address: GeocodableAddress): string {
  const suburb = (address.suburb ?? '').trim();
  const city = (address.city ?? '').trim();
  const cityOmitted = city === '' || city.toLowerCase() === suburb.toLowerCase();

  const parts = [
    address.street,
    address.number,
    address.complement,
    address.addressLine2,
    address.suburb,
    cityOmitted ? null : address.city,
    address.state,
    address.postcode,
    address.country,
  ];

  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(', ');
}

/**
 * True when two addresses are the same for geocoding purposes:
 * `formatGeocodingQuery(a)` and `formatGeocodingQuery(b)` compared after
 * `trim().toLowerCase()`. Extra `address_json` keys (latitude, longitude,
 * formattedAddress, provider) are ignored because both sides go through
 * `formatGeocodingQuery`, which reads only the known fields.
 *
 * Used by the branch update ("same address → don't call Mapbox") now and by
 * F01 later.
 */
export function isSameGeocodingAddress(a: GeocodableAddress, b: GeocodableAddress): boolean {
  const normalize = (value: string): string => value.trim().toLowerCase();
  return normalize(formatGeocodingQuery(a)) === normalize(formatGeocodingQuery(b));
}
