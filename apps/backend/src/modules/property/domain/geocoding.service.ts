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
 * (PR-18, DECISION 12 — rule A). Only a confident, address-level result may be
 * stored:
 *
 * - `address` with relevance `>= 0.8` → accepted (the only success case);
 * - `address` with relevance `< 0.8` → rejected (`LOW_RELEVANCE`);
 * - any other place type (`locality`, `place`, `postcode`, `district`,
 *   `region`, `country`, …) → rejected (`COARSE_RESULT`) — rural and coarse
 *   results require a manual pin.
 *
 * Real Mapbox always reports `place_type` and `relevance`. A result without a
 * place type (a stub/legacy source or a test double) carries no evidence to
 * reject, so it is accepted — this branch is never reached by a real Mapbox
 * geocode.
 */
export function classifyGeocodingResult(result: GeocodingResult): GeocodingDecision {
  if (result.placeType !== undefined && result.placeType !== 'address') {
    return { accepted: false, reason: 'COARSE_RESULT' };
  }
  if (
    result.placeType === 'address' &&
    typeof result.relevance === 'number' &&
    result.relevance < MIN_ADDRESS_GEOCODING_RELEVANCE
  ) {
    return { accepted: false, reason: 'LOW_RELEVANCE' };
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
