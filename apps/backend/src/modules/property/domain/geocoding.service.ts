export interface GeocodingResult {
  lat: number;
  lng: number;
}

export type GeocodingMode = 'permanent' | 'temporary';

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
