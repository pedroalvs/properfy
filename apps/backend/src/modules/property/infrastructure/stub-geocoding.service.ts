import type { IGeocodingService, GeocodingResult } from '../domain/geocoding.service';

export class StubGeocodingService implements IGeocodingService {
  async geocode(_address: string): Promise<GeocodingResult | null> {
    return null;
  }
}
