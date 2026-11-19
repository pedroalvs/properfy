import type { GeocodeVerification } from '@properfy/shared';
import {
  type IGeocodingService,
  MapboxPermanentGeocodingUnavailableError,
} from '../../domain/geocoding.service';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { geocodeWithTimeout } from './geocode-with-timeout';

export interface GeocodeVerifierOptions {
  /** Per-address race against the provider — same bound as the synchronous
   * geocode in CreatePropertyUseCase. Losers become `unverified`. */
  perAddressTimeoutMs?: number;
  /** How many lookups run at once. */
  concurrency?: number;
  /** Wall-clock budget for the whole batch; addresses not dispatched before
   * the deadline become `unverified`. Keeps the preview request bounded. */
  overallBudgetMs?: number;
  /** Hard cap of unique addresses actually sent to the provider per batch —
   * protects the Mapbox rate limit on pathological files. */
  maxAddresses?: number;
}

const DEFAULTS: Required<GeocodeVerifierOptions> = {
  perAddressTimeoutMs: 4000,
  concurrency: 5,
  overallBudgetMs: 15_000,
  maxAddresses: 300,
};

const UNVERIFIED: GeocodeVerification = { status: 'unverified', lat: null, lng: null };

/**
 * Synchronously verifies a batch of unique new-property addresses during an
 * import preview. Every input key gets an answer: `found` (with coordinates,
 * reused at commit so the address is never geocoded twice), `not_found`
 * (provider returned no match — surfaced as a preview warning), or
 * `unverified` (timeout / provider error / over budget — the commit falls
 * back to the existing async geocode job).
 */
export class ImportGeocodeVerifier {
  private readonly opts: Required<GeocodeVerifierOptions>;

  constructor(
    private readonly geocoding: IGeocodingService,
    opts?: GeocodeVerifierOptions,
    private readonly logger?: Logger,
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  async verifyMany(addresses: Map<string, string>): Promise<Map<string, GeocodeVerification>> {
    const result = new Map<string, GeocodeVerification>();
    const entries = [...addresses.entries()];
    const deadline = Date.now() + this.opts.overallBudgetMs;

    const queue = entries.slice(0, this.opts.maxAddresses);
    for (const [key] of entries.slice(this.opts.maxAddresses)) {
      result.set(key, UNVERIFIED);
    }

    let next = 0;
    // When the account lacks permanent geocoding, short-circuit the whole batch:
    // one Mapbox call fails, the rest are marked unverified WITHOUT calling Mapbox.
    let permanentUnavailable = false;
    let permanentCode = '';
    let permanentRemaining = 0;
    // Generic errors/timeouts are aggregated into a single warn per batch.
    let failedCount = 0;

    const runWorker = async (): Promise<void> => {
      while (next < queue.length) {
        const [key, address] = queue[next]!;
        next += 1;
        if (permanentUnavailable) {
          result.set(key, UNVERIFIED);
          continue;
        }
        // Each lookup's race window is also capped by the remaining overall
        // budget, so a lookup dispatched near the deadline can't overrun the
        // batch by a full per-address timeout.
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          result.set(key, UNVERIFIED);
          continue;
        }
        try {
          const coords = await geocodeWithTimeout(this.geocoding, address, {
            timeoutMs: Math.min(this.opts.perAddressTimeoutMs, remainingMs),
          });
          result.set(
            key,
            coords === null
              ? { status: 'not_found', lat: null, lng: null }
              : { status: 'found', lat: coords.lat, lng: coords.lng, mode: 'permanent' },
          );
        } catch (err) {
          result.set(key, UNVERIFIED);
          if (err instanceof MapboxPermanentGeocodingUnavailableError) {
            if (!permanentUnavailable) {
              permanentUnavailable = true;
              permanentCode = err.code;
              // Keys not yet dispatched to Mapbox — they will all be short-circuited.
              permanentRemaining = queue.length - next;
            }
          } else {
            failedCount += 1;
          }
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(this.opts.concurrency, queue.length) },
      () => runWorker(),
    );
    await Promise.all(workers);

    if (permanentUnavailable) {
      this.logger?.error(
        { code: permanentCode, remaining: permanentRemaining },
        'import.geocode_verify_permanent_unavailable',
      );
    } else if (failedCount > 0) {
      this.logger?.warn({ failedCount }, 'import.geocode_verify_failed');
    }

    return result;
  }
}
