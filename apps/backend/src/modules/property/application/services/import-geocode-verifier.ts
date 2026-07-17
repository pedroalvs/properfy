import type { GeocodeVerification } from '@properfy/shared';
import type { IGeocodingService } from '../../domain/geocoding.service';

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
    const runWorker = async (): Promise<void> => {
      while (next < queue.length) {
        const [key, address] = queue[next]!;
        next += 1;
        if (Date.now() >= deadline) {
          result.set(key, UNVERIFIED);
          continue;
        }
        result.set(key, await this.verifyOne(address));
      }
    };

    const workers = Array.from(
      { length: Math.min(this.opts.concurrency, queue.length) },
      () => runWorker(),
    );
    await Promise.all(workers);
    return result;
  }

  private async verifyOne(address: string): Promise<GeocodeVerification> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('geocode verification timed out')),
        this.opts.perAddressTimeoutMs,
      );
    });
    const lookup = this.geocoding.geocode(address);
    // If the timeout wins, the lookup may still settle later — swallow its
    // rejection so it never surfaces as an unhandled rejection.
    lookup.catch(() => {});
    try {
      const coords = await Promise.race([lookup, timeout]);
      if (coords === null) return { status: 'not_found', lat: null, lng: null };
      return { status: 'found', lat: coords.lat, lng: coords.lng };
    } catch {
      return UNVERIFIED;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
