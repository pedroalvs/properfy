import type { IGeocodingService, GeocodingResult } from '../domain/geocoding.service';
import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';

export class MapboxGeocodingService implements IGeocodingService {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly accessToken: string) {
    this.circuitBreaker = new CircuitBreaker({ name: 'mapbox-geocoding', failureThreshold: 5, resetTimeoutMs: 60000 });
  }

  async geocode(address: string): Promise<GeocodingResult | null> {
    return this.circuitBreaker.execute(async () => {
      const encoded = encodeURIComponent(address);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${this.accessToken}&limit=1`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Mapbox geocoding failed with status ${response.status}`);
      const data = (await response.json()) as {
        features?: Array<{ center?: [number, number] }>;
      };
      const feature = data.features?.[0];
      if (!feature?.center) return null;
      // Mapbox returns [longitude, latitude]
      return { lng: feature.center[0], lat: feature.center[1] };
    });
  }
}
