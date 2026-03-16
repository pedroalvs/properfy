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
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
