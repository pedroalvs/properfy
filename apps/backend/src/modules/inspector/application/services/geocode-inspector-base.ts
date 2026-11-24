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
import type { InspectorBaseAddress } from '@properfy/shared';

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
