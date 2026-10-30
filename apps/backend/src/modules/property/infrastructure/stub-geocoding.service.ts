import type { IGeocodingService, GeocodingResult, GeocodeOptions } from '../domain/geocoding.service';

export class StubGeocodingService implements IGeocodingService {
  async geocode(_address: string, _options?: GeocodeOptions): Promise<GeocodingResult | null> {
    return null;
  }
}
