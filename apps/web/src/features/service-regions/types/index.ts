export interface ServiceRegion {
  id: string;
  name: string;
  state: string;
  country: string;
  status: string;
  suburbCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRegionDetail extends ServiceRegion {
  suburbs: Suburb[];
}

export interface Suburb {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  postcode: string | null;
  status: string;
}

export interface ServiceRegionFormData {
  name: string;
  country: string;
  state: string;
  city: string;
  suburbIds: string[];
  status: string;
}

export type ServiceRegionFormErrors = Partial<Record<keyof ServiceRegionFormData, string>>;

export interface ServiceRegionFiltersState {
  search: string;
  country: string;
  state: string;
  status: string;
}

export const DEFAULT_FILTERS: ServiceRegionFiltersState = {
  search: '',
  country: '',
  state: '',
  status: '',
};

export const EMPTY_SERVICE_REGION_FORM: ServiceRegionFormData = {
  name: '',
  country: '',
  state: '',
  city: '',
  suburbIds: [],
  status: 'ACTIVE',
};
