export interface AddressLookupSuggestion {
  formattedAddress: string;
  street: string;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  provider: 'MAPBOX';
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildAddressLabel(parts: {
  street?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
}): string | null {
  const lineOne = parts.street?.trim() || null;
  const lineTwo = [parts.suburb, parts.state, parts.postcode]
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .join(' ')
    .trim() || null;
  const lineThree = parts.country?.trim() || null;

  return [lineOne, lineTwo, lineThree].filter(Boolean).join(', ') || null;
}

export function formatAddressLabel(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;

  const record = address as Record<string, unknown>;
  const formattedAddress = readString(record, 'formattedAddress');
  if (formattedAddress) return formattedAddress;

  const street = readString(record, 'street');
  const suburb = readString(record, 'suburb') ?? readString(record, 'city');
  const state = readString(record, 'state');
  const postcode = readString(record, 'postcode');
  const country = readString(record, 'country');

  return buildAddressLabel({ street, suburb, state, postcode, country });
}

export function toAddressSuggestion(address: unknown): AddressLookupSuggestion | null {
  if (!address || typeof address !== 'object') return null;

  const record = address as Record<string, unknown>;
  const formattedAddress = formatAddressLabel(record);
  const street = readString(record, 'street');
  const suburb = readString(record, 'suburb') ?? readString(record, 'city');
  const postcode = readString(record, 'postcode');
  const state = readString(record, 'state');
  const country = readString(record, 'country');
  const latitude = typeof record['latitude'] === 'number' ? record['latitude'] : null;
  const longitude = typeof record['longitude'] === 'number' ? record['longitude'] : null;

  if (!formattedAddress || !street || !state || !country) {
    return null;
  }

  return {
    formattedAddress,
    street,
    suburb: suburb ?? '',
    postcode: postcode ?? '',
    state,
    country,
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    provider: record['provider'] === 'MAPBOX' ? 'MAPBOX' : 'MAPBOX',
  };
}
