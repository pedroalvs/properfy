export interface GeocodingResult {
  lat: number;
  lng: number;
}

export interface IGeocodingService {
  geocode(address: string): Promise<GeocodingResult | null>;
}
