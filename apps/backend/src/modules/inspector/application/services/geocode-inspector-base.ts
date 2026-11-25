import type {
  IGeocodingService,
} from '../../../property/domain/geocoding.service';
import {
  MapboxPermanentGeocodingUnavailableError,
  classifyGeocodingResult,
} from '../../../property/domain/geocoding.service';
import {
  geocodeWithTimeout,
  GeocodeTimeoutError,
  GEOCODE_SYNC_TIMEOUT_MS,
} from '../../../property/application/services/geocode-with-timeout';
import {
  formatGeocodingQuery,
  type GeocodableAddress,
} from '../../../../shared/domain/geocoding-address';
import type { Clock } from '../../../../shared/domain/clock';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { AddressNotVerifiedReason, InspectorBaseAddress } from '@properfy/shared';

/** Why the inspector base could not be geocoded. Never thrown — always returned. */
export type GeocodeInspectorBaseFailure =
  | 'no_results'
  | 'error'
  | 'timeout'
  | 'permanent_unavailable'
  // Rule A (PR-18): the result was too coarse (non-address) or too
  // low-confidence (address relevance < 0.8) to store.
  | 'coarse_result'
  | 'low_relevance';

export type GeocodeInspectorBaseResult =
  | { lat: number; lng: number; geocodedAt: Date }
  | { failed: GeocodeInspectorBaseFailure };

/**
 * V-3: map a geocode failure to the on-save rejection reason, or `null` when the
 * failure is a "not verified" case rather than an "invalid address" one.
 *
 * A rejection (`no_results` / `coarse_result` / `low_relevance`, i.e. rule A says
 * the address does not resolve to a confident address-level point) must block the
 * save with a 422 `ADDRESS_NOT_VERIFIED`. A `timeout` / `error` /
 * `permanent_unavailable` is the provider being unreachable, not a bad address, so
 * the caller keeps the pre-V-3 behaviour: save the address without coordinates and
 * flag `baseGeocodeFailed` (V4).
 *
 * This is the single source for that split so the three inspector use cases agree;
 * `geocodeInspectorBase` itself still only ever RETURNS `{ failed }` (it never
 * throws), so the one-off backfill script keeps working unchanged.
 */
export function inspectorBaseRejectionReason(
  failure: GeocodeInspectorBaseFailure,
): AddressNotVerifiedReason | null {
  switch (failure) {
    case 'no_results':
      return 'NOT_FOUND';
    case 'coarse_result':
      return 'COARSE_RESULT';
    case 'low_relevance':
      return 'LOW_RELEVANCE';
    case 'timeout':
    case 'error':
    case 'permanent_unavailable':
      return null;
  }
}

/**
 * Geocode an inspector's base address in permanent mode (F01-1).
 *
 * Reuses the X02 contract end to end: the single-line query from
 * `formatGeocodingQuery` and the 4000 ms bound from `geocodeWithTimeout`. There
 * is deliberately no second query formatter and no own `Promise.race`.
 *
 * This NEVER throws. A missing result, an error, a timeout or an account
 * without permanent mode all come back as `{ failed }` plus a log, so the caller
 * saves the address without coordinates and tells the client.
 */
export async function geocodeInspectorBase(
  geocoder: IGeocodingService,
  address: InspectorBaseAddress,
  logger: Logger | undefined,
  clock: Clock,
): Promise<GeocodeInspectorBaseResult> {
  const query = formatGeocodingQuery(address as unknown as GeocodableAddress);
  try {
    const coords = await geocodeWithTimeout(geocoder, query, {
      mode: 'permanent',
      timeoutMs: GEOCODE_SYNC_TIMEOUT_MS,
    });
    if (coords) {
      // Rule A (PR-18): only a confident address-level result is stored. A
      // non-address (coarse) result or a low-relevance address is a failure.
      const decision = classifyGeocodingResult(coords);
      if (!decision.accepted) {
        const reason: GeocodeInspectorBaseFailure =
          decision.reason === 'COARSE_RESULT' ? 'coarse_result' : 'low_relevance';
        logger?.warn(
          { reason, placeType: coords.placeType, relevance: coords.relevance },
          'inspector.base_geocode_failed',
        );
        return { failed: reason };
      }
      return { lat: coords.lat, lng: coords.lng, geocodedAt: clock.now() };
    }
    logger?.warn({ reason: 'no_results' }, 'inspector.base_geocode_failed');
    return { failed: 'no_results' };
  } catch (err) {
    if (err instanceof MapboxPermanentGeocodingUnavailableError) {
      logger?.error({ code: err.code }, 'inspector.base_geocode_permanent_unavailable');
      return { failed: 'permanent_unavailable' };
    }
    const reason = err instanceof GeocodeTimeoutError ? 'timeout' : 'error';
    logger?.warn({ reason }, 'inspector.base_geocode_failed');
    return { failed: reason };
  }
}
