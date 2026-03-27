import { CircuitBreaker } from '../../../shared/infrastructure/circuit-breaker';
import type { AddressLookupSuggestion, IAddressLookupService } from '../domain/address-lookup.service';

interface MapboxFeature {
  place_name?: string;
  text?: string;
  address?: string;
  center?: [number, number];
  context?: Array<{
    id?: string;
    text?: string;
    short_code?: string;
  }>;
}

function readContext(
  context: MapboxFeature['context'],
  prefix: string,
): { text?: string; shortCode?: string } | null {
  const found = context?.find((item) => item.id?.startsWith(prefix));
  if (!found) return null;
  return { text: found.text, shortCode: found.short_code };
}

function toSuggestion(feature: MapboxFeature): AddressLookupSuggestion | null {
  if (!feature.place_name || !feature.text || !feature.center) return null;

  const postcode = readContext(feature.context, 'postcode.');
  const region = readContext(feature.context, 'region.');
  const locality =
    readContext(feature.context, 'locality.') ??
    readContext(feature.context, 'place.') ??
    readContext(feature.context, 'district.') ??
    readContext(feature.context, 'neighborhood.');
  const country = readContext(feature.context, 'country.');

  if (!region?.text || !country?.text) {
    return null;
  }

  const state = region.shortCode?.toUpperCase().startsWith('AU-')
    ? region.shortCode.slice(3).toUpperCase()
    : region.text;

  return {
    formattedAddress: feature.place_name,
    street: [feature.address, feature.text].filter(Boolean).join(' '),
    suburb: locality?.text ?? '',
    postcode: postcode?.text ?? '',
    state,
    country: country.shortCode?.toUpperCase() ?? country.text,
    latitude: feature.center[1],
    longitude: feature.center[0],
    provider: 'MAPBOX',
  };
}

export class MapboxAddressLookupService implements IAddressLookupService {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly accessToken: string) {
    this.circuitBreaker = new CircuitBreaker({
      name: 'mapbox-address-lookup',
      failureThreshold: 5,
      resetTimeoutMs: 60000,
    });
  }

  async search(
    query: string,
    options: { limit?: number; country?: string } = {},
  ): Promise<AddressLookupSuggestion[]> {
    return this.circuitBreaker.execute(async () => {
      const encoded = encodeURIComponent(query.trim());
      const limit = options.limit ?? 5;
      const country = options.country
        ?.split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .join(',');
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
        `?access_token=${this.accessToken}` +
        `&autocomplete=true&limit=${limit}` +
        `${country ? `&country=${encodeURIComponent(country)}` : ''}` +
        `&types=address`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Mapbox address lookup failed with status ${response.status}`);
      }

      const data = (await response.json()) as { features?: MapboxFeature[] };
      return (data.features ?? [])
        .map(toSuggestion)
        .filter((item): item is AddressLookupSuggestion => item !== null);
    });
  }
}
