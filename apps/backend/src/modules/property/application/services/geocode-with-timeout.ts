import type {
  GeocodingMode,
  GeocodingResult,
  IGeocodingService,
} from '../../domain/geocoding.service';

/** Default bound for synchronous geocoding (property create, branch save). */
export const GEOCODE_SYNC_TIMEOUT_MS = 4000;

/** Raised when the geocoding service does not answer within the deadline. */
export class GeocodeTimeoutError extends Error {
  readonly code = 'GEOCODE_TIMEOUT';

  constructor(timeoutMs: number) {
    super(`Geocoding did not answer within ${timeoutMs} ms`);
    this.name = 'GeocodeTimeoutError';
  }
}

export interface GeocodeWithTimeoutOptions {
  mode?: GeocodingMode;
  timeoutMs?: number;
}

/**
 * Call `service.geocode` with a hard timeout.
 *
 * - Resolves with the result (or `null`) if the service answers in time.
 * - Rejects with `GeocodeTimeoutError` when the deadline elapses.
 * - Passes the service's own exceptions through unchanged (including
 *   `MapboxPermanentGeocodingUnavailableError`).
 * - Swallows a late settlement of the lost call (no unhandled rejection) and
 *   always clears its timer.
 *
 * Exported contract consumed by X02 (property create, branch save) and later by
 * F01. Defaults: `mode: 'permanent'`, `timeoutMs: GEOCODE_SYNC_TIMEOUT_MS`.
 */
export function geocodeWithTimeout(
  service: IGeocodingService,
  address: string,
  opts: GeocodeWithTimeoutOptions = {},
): Promise<GeocodingResult | null> {
  const mode: GeocodingMode = opts.mode ?? 'permanent';
  const timeoutMs = opts.timeoutMs ?? GEOCODE_SYNC_TIMEOUT_MS;

  return new Promise<GeocodingResult | null>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GeocodeTimeoutError(timeoutMs));
    }, timeoutMs);

    service.geocode(address, { mode }).then(
      (result) => {
        if (settled) return; // lost race against the timeout — discard the late result
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return; // lost race against the timeout — swallow the late rejection
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
