import { normEqualSuburb } from '../../../shared/domain/geocoding-address';

export interface GeocodingResult {
  lat: number;
  lng: number;
  /**
   * Mapbox feature relevance (0–1): how confident the provider is that the
   * result matches the query. Optional because stub/legacy sources do not
   * report it; absent is treated as "no evidence to reject" by
   * {@link classifyGeocodingResult}.
   */
  relevance?: number;
  /**
   * The feature's most specific place type (Mapbox `place_type[0]`), e.g.
   * `'address'`, `'postcode'`, `'locality'`. Optional for the same reason as
   * {@link GeocodingResult.relevance}.
   */
  placeType?: string;
  /**
   * The returned Mapbox **locality** (`context` `locality.*`) — a suburb within a
   * larger place. This field holds ONLY the returned locality; it is NOT a
   * collapsed suburb (O-14 stopped the old `locality ?? place` fallback) — the
   * place and postcode are now carried SEPARATELY in {@link GeocodingResult.place}
   * and {@link GeocodingResult.postcode}. Named `suburb` for continuity; the
   * `suburb` → `locality` rename is a tracked follow-up (estacionamento). The O-14
   * rule can accept a CBD address whose locality is a sub-area (e.g. "The Rocks")
   * when the informed suburb matches the place + postcode. Optional: stub/legacy
   * sources do not report it.
   */
  suburb?: string;
  /** The returned **place** (Mapbox `context` `place.*`) — the town/city. */
  place?: string;
  /** The returned **postcode** (Mapbox `context` `postcode.*`). */
  postcode?: string;
}

export type GeocodingMode = 'permanent' | 'temporary';

/** Minimum relevance for an `address`-level result to be accepted (rule A). */
export const MIN_ADDRESS_GEOCODING_RELEVANCE = 0.8;

/** Reason a geocoding result was rejected; stored as `geocoding_failure_code`. */
export type GeocodingRejectionReason = 'COARSE_RESULT' | 'LOW_RELEVANCE';

export type GeocodingDecision =
  | { accepted: true }
  | { accepted: false; reason: GeocodingRejectionReason };

/**
 * Decide whether a non-null geocoding result is precise enough to store
 * (DECISION 12 — rule A, O-14 form). An `address`-level result with
 * `relevance >= 0.8` is accepted when it lands in the informed suburb by EITHER:
 *
 * - the returned **locality** equals the informed suburb, OR
 * - the returned **place** equals the informed suburb AND the returned
 *   **postcode** equals the informed postcode (the CBD case: Mapbox returns a
 *   finer locality like "The Rocks" while the address is registered at the place
 *   level "Sydney" — place + postcode confirm it).
 *
 * Otherwise → rejected `LOW_RELEVANCE` (no new reason code). `address` with
 * `relevance < 0.8` → `LOW_RELEVANCE`; any non-`address` place type →
 * `COARSE_RESULT`.
 *
 * `expectedSuburb` and `expectedPostcode` are the informed values (from the
 * address being geocoded) and are **mandatory** so no caller forgets to thread
 * them. The gate fails CLOSED: suburb match uses `normEqualSuburb` (false when
 * either side is missing/empty); the place branch additionally needs a non-empty
 * postcode match, so an empty informed suburb AND postcode rejects. A result
 * **without a place type** (stub/legacy source or test double — never a real
 * Mapbox geocode) never enters the address branch and stays accepted.
 */
export function classifyGeocodingResult(
  result: GeocodingResult,
  expectedSuburb: string | null | undefined,
  expectedPostcode: string | null | undefined,
): GeocodingDecision {
  if (result.placeType !== undefined && result.placeType !== 'address') {
    return { accepted: false, reason: 'COARSE_RESULT' };
  }
  if (result.placeType === 'address') {
    if (typeof result.relevance === 'number' && result.relevance < MIN_ADDRESS_GEOCODING_RELEVANCE) {
      return { accepted: false, reason: 'LOW_RELEVANCE' };
    }
    const localityMatch = normEqualSuburb(result.suburb, expectedSuburb);
    const placeMatch =
      normEqualSuburb(result.place, expectedSuburb) &&
      samePostcode(result.postcode, expectedPostcode);
    // Fails CLOSED (reuses LOW_RELEVANCE). Only reached for a genuine `address`.
    if (!localityMatch && !placeMatch) {
      return { accepted: false, reason: 'LOW_RELEVANCE' };
    }
  }
  return { accepted: true };
}

/** Postcode equality: exact, normalized by TRIM only. Empty on either side never matches. */
function samePostcode(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a ?? '').trim();
  return na !== '' && na === (b ?? '').trim();
}

export interface GeocodeOptions {
  /**
   * Geocoding mode. Absent means `'permanent'` — the fail-safe default, because
   * only permanently geocoded coordinates may be stored under Mapbox terms.
   * `'temporary'` is for display-only callers (autocomplete, connection test)
   * whose result is never persisted.
   */
  mode?: GeocodingMode;
}

export interface IGeocodingService {
  geocode(address: string, options?: GeocodeOptions): Promise<GeocodingResult | null>;
}

/**
 * Raised by the Mapbox adapter when the account does not allow permanent
 * geocoding. No coordinate is ever stored in this case; the caller marks the
 * property `FAILED` with `geocoding_failure_code` and stops retrying.
 */
export class MapboxPermanentGeocodingUnavailableError extends Error {
  readonly code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE';

  constructor() {
    super('Mapbox account does not allow permanent geocoding; no coordinates were stored');
    this.name = 'MapboxPermanentGeocodingUnavailableError';
  }
}
