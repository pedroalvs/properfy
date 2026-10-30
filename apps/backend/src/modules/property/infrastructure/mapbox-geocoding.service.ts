import {
  type IGeocodingService,
  type GeocodingResult,
  type GeocodeOptions,
  MapboxPermanentGeocodingUnavailableError,
} from '../domain/geocoding.service';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

/**
 * Outcome returned from inside the circuit breaker. `accountError` is a sentinel
 * (not an exception) so the breaker treats it as a success and never opens on an
 * account error — the error is raised by the caller, outside the breaker.
 */
type GeocodeOutcome =
  | { kind: 'result'; result: GeocodingResult | null }
  | { kind: 'account-error' };

export class MapboxGeocodingService implements IGeocodingService {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly accessToken: string) {
    this.circuitBreaker = new CircuitBreaker({ name: 'mapbox-geocoding', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  async geocode(address: string, options?: GeocodeOptions): Promise<GeocodingResult | null> {
    const mode = options?.mode ?? 'permanent';

    const outcome = await this.circuitBreaker.execute<GeocodeOutcome>(async () => {
      const params = new URLSearchParams({ access_token: this.accessToken, limit: '1' });
      // Only permanent-mode results may be stored (Mapbox terms); temporary mode
      // omits the flag and is for display-only callers.
      if (mode === 'permanent') params.set('permanent', 'true');

      const encoded = encodeURIComponent(address);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        const message = await this.readErrorMessage(response);
        if (this.isAccountError(response.status, message)) {
          // Sentinel, not a throw: an account error must not count toward the
          // breaker's failure threshold nor be masked as "Circuit breaker OPEN".
          return { kind: 'account-error' };
        }
        throw new Error(`Mapbox geocoding failed with status ${response.status}`);
      }

      const data = (await response.json()) as { features?: Array<{ center?: [number, number] }> };
      const feature = data.features?.[0];
      if (!feature?.center) return { kind: 'result', result: null };
      // Mapbox returns [longitude, latitude]
      return { kind: 'result', result: { lng: feature.center[0], lat: feature.center[1] } };
    });

    if (outcome.kind === 'account-error') {
      throw new MapboxPermanentGeocodingUnavailableError();
    }
    return outcome.result;
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { message?: unknown };
      return typeof body?.message === 'string' ? body.message : '';
    } catch {
      return '';
    }
  }

  /**
   * Account-error detection (dec. 14, confirmed against the spike envelope
   * `{"message": string}`): status 401/403/422 AND the message mentions
   * "permanent"; plus the 403 fallback (a valid token never 403s today, and the
   * account refusal is not reliably text-distinguishable).
   */
  private isAccountError(status: number, message: string): boolean {
    if (status === 403) return true;
    if (status === 401 || status === 422) return /permanent/i.test(message);
    return false;
  }
}
