import type { PropertyType, GeocodingStatus } from '@properfy/shared';

export interface Property {
  id: string;
  tenantId: string;
  branchId: string | null;
  branchName: string | null;
  propertyCode: string;
  type: PropertyType;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  geocodingStatus: GeocodingStatus;
  privateAreaM2: number | null;
  totalAreaM2: number | null;
  furnished: boolean | null;
  linenProvided: boolean | null;
  rentAmount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDetail extends Property {
  latitude: number | null;
  longitude: number | null;
}

export interface PropertyFiltersState {
  search: string;
  type: string;
  branchId: string;
}

export const DEFAULT_FILTERS: PropertyFiltersState = {
  search: '',
  type: '',
  branchId: '',
};

export interface PropertyFormData {
  propertyCode: string;
  type: string;
  branchId: string;
  street: string;
  addressLine2: string;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  privateAreaM2: string;
  totalAreaM2: string;
  furnished: '' | 'true' | 'false';
  linenProvided: '' | 'true' | 'false';
  rentAmount: string;
  notes: string;
  latitude: string;
  longitude: string;
}

export type PropertyFormErrors = Partial<Record<keyof PropertyFormData, string>>;

export const EMPTY_PROPERTY_FORM: PropertyFormData = {
  propertyCode: '',
  type: '',
  branchId: '',
  street: '',
  addressLine2: '',
  suburb: '',
  postcode: '',
  state: '',
  country: 'AU',
  privateAreaM2: '',
  totalAreaM2: '',
  furnished: '',
  linenProvided: '',
  rentAmount: '',
  notes: '',
  latitude: '',
  longitude: '',
};
