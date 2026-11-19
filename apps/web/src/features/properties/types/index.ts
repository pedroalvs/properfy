import type { PropertyType, GeocodingStatus, FileCounts } from '@properfy/shared';

export interface Property {
  id: string;
  tenantId: string;
  branchId: string | null;
  branchName: string | null;
  tenantName: string | null;
  propertyCode: string;
  type: PropertyType;
  apartmentNumber: string | null;
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
  /**
   * F10: true when the property has an unseen, non-deleted issue (D26; any issue,
   * with or without an appointment). Populated only for AM/OP/CL_ADMIN —
   * `false`/absent for CL_USER/INSP. Drives the yellow row border.
   */
  hasUnseenIssues?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDetail extends Property {
  latitude: number | null;
  longitude: number | null;
  /** F10: per-type file counts on the property detail payload (C.9). */
  fileCounts?: FileCounts;
}

export interface PropertyFiltersState {
  search: string;
  type: string;
  branchId: string;
  /** F10 "With issues": only properties that have a non-deleted issue. */
  withIssues: boolean;
}

export const DEFAULT_FILTERS: PropertyFiltersState = {
  search: '',
  type: '',
  branchId: '',
  withIssues: false,
};

export interface PropertyFormData {
  type: string;
  apartmentNumber: string;
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
  type: '',
  apartmentNumber: '',
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
