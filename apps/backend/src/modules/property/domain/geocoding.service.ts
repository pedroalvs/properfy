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
   * The suburb Mapbox returned for the matched feature (from its `context` —
   * `locality`, falling back to `place`). {@link classifyGeocodingResult} uses
   * it to confirm the result lands in the informed suburb. Optional: stub/legacy
   * sources do not report it.
   */
  suburb?: string;
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
 * (DECISION 12 — rule A, final form). An `address`-level result is accepted
 * only when it is confident AND lands in the informed suburb:
 *
 * - `address` with relevance `>= 0.8` AND `normEqualSuburb(result.suburb,
 *   expectedSuburb)` → accepted (the only success case);
 * - `address` with relevance `< 0.8` → rejected (`LOW_RELEVANCE`);
 * - `address` whose returned suburb is missing or differs from the informed
 *   suburb → rejected, REUSING `LOW_RELEVANCE` (no new reason code);
 * - any other place type (`locality`, `place`, `postcode`, `district`,
 *   `region`, `country`, …) → rejected (`COARSE_RESULT`) — rural/coarse results
 *   require a manual pin.
 *
 * `expectedSuburb` is the informed suburb (from the address being geocoded) and
 * is **mandatory** so no caller forgets to thread it. The suburb gate fails
 * CLOSED: a missing/empty informed suburb, a missing returned suburb, or a
 * mismatch all reject an `address` result (Pedro's rule: "no suburb → reject").
 * A result **without a place type** (stub/legacy source or test double — never a
 * real Mapbox geocode) never enters the address branch and stays accepted.
 */
export function classifyGeocodingResult(
  result: GeocodingResult,
  expectedSuburb: string | null | undefined,
): GeocodingDecision {
  if (result.placeType !== undefined && result.placeType !== 'address') {
    return { accepted: false, reason: 'COARSE_RESULT' };
  }
  if (result.placeType === 'address') {
    if (typeof result.relevance === 'number' && result.relevance < MIN_ADDRESS_GEOCODING_RELEVANCE) {
      return { accepted: false, reason: 'LOW_RELEVANCE' };
    }
    // `normEqualSuburb` is false when EITHER side is missing/empty, so this fails
    // CLOSED (reuses LOW_RELEVANCE). Only reached for a genuine `address` result.
    if (!normEqualSuburb(result.suburb, expectedSuburb)) {
      return { accepted: false, reason: 'LOW_RELEVANCE' };
    }
  }
  return { accepted: true };
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
