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
    dropDuplicateLine2(address.street, address.addressLine2),
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

/** Normalization for the Line-2 duplicate check: lowercase, commas→spaces,
 * collapse whitespace, trim. Looser than the geocoding query on purpose
 * (commas/casing don't matter when deciding "does L2 just repeat street?"). */
function normalizeForLine2Dedup(value: string): string {
  return value
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The Address Line 2 to USE in the geocoding query — `line2` itself, or `null`
 * when it merely repeats the street (a common bad-import shape where the full
 * address was crammed into both `street` and `addressLine2`, which worsens the
 * Mapbox match). "Repeats" = normalized `line2` STARTS WITH normalized `street`
 * (not `contains`, so a legit "Unit 5, <street>" that embeds the street
 * mid-string is kept). Guard: an EMPTY normalized street never drops L2.
 *
 * SINGLE source for the dedup — every geocoding query builder
 * (`formatGeocodingQuery`, `PropertyEntity.fullAddress`, the import
 * `apply-geocode-verification` fullAddress) must route L2 through it so the
 * A≡B identity lock holds. Query-only: the stored `address_line_2` is untouched.
 */
export function dropDuplicateLine2(
  street: string | null | undefined,
  line2: string | null | undefined,
): string | null {
  if (line2 == null || line2.trim() === '') return null;
  const s = normalizeForLine2Dedup(street ?? '');
  if (s === '') return line2; // empty street → nothing to dedup against, keep L2
  return normalizeForLine2Dedup(line2).startsWith(s) ? null : line2;
}

/**
 * Normalize a suburb for the EXACT (non-fuzzy) returned-vs-informed comparison
 * in rule A: NFKD, strip accents, lowercase, remove apostrophes and hyphens,
 * collapse whitespace, trim. So "Brighton-le-sands" == "Brighton Le Sands" ==
 * "Brighton-Le-Sands". Returns '' for null/empty.
 */
export function normalizeSuburb(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True iff both suburbs are present and normalize equal (rule A suburb check).
 * A missing/empty value on either side is never a match — so a result with no
 * suburb, or an unknown expected suburb, is rejected by the caller.
 */
export function normEqualSuburb(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeSuburb(a);
  return na !== '' && na === normalizeSuburb(b);
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
 *
 * O-9 + country canonicalization: `country` is canonicalized so a missing/empty
 * value AND the import `'Australia'` vs screen `'AU'` split both collapse to 'AU'
 * (case-insensitive) on BOTH sides before comparing. A legacy row stored without a country (e.g. a branch
 * `address_json` of `{street, suburb, state, postcode}`) must compare EQUAL to the
 * same address re-sent with `country: 'AU'` (the `branchAddressSchema` default),
 * so an identical re-send is not mistaken for a change — no needless re-geocode
 * and no 422, while the server's recovery attempt for a no-coordinate row is
 * preserved (the caller still geocodes when there is no stored marker). The
 * platform is AU-only, so this is safe for branch, property (#1404) and inspector
 * (V-3), which all compare through this helper. It does NOT change the actual
 * geocoding query string — `formatGeocodingQuery` is called directly where the
 * Mapbox query is built, and is left untouched here.
 */
export function isSameGeocodingAddress(a: GeocodableAddress, b: GeocodableAddress): boolean {
  // Canonicalize country so a missing value (O-9, #1405) AND the import "Australia"
  // vs screen "AU" split both collapse to 'AU' — an identical re-send never reads as
  // a change (no false 422 / needless re-geocode). AU-only platform.
  const canonicalCountry = (raw: string | null | undefined): string => {
    const c = (raw ?? '').trim();
    const lc = c.toLowerCase();
    return c === '' || lc === 'australia' || lc === 'au' ? 'AU' : c;
  };
  const withCanonicalCountry = (addr: GeocodableAddress): GeocodableAddress => ({
    ...addr,
    country: canonicalCountry(addr.country),
  });
  const normalize = (value: string): string => value.trim().toLowerCase();
  return (
    normalize(formatGeocodingQuery(withCanonicalCountry(a))) ===
    normalize(formatGeocodingQuery(withCanonicalCountry(b)))
  );
}
