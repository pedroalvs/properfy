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

export interface IAddressLookupService {
  search(query: string, options?: { limit?: number; country?: string }): Promise<AddressLookupSuggestion[]>;
}
