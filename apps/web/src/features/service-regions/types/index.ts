export interface ServiceRegion {
  id: string;
  name: string;
  geojson: object;
  color: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRegionFormData {
  name: string;
  geojson: object | null;
  color: string;
  status: string;
}

export type ServiceRegionFormErrors = Partial<Record<keyof ServiceRegionFormData, string>>;

export const EMPTY_SERVICE_REGION_FORM: ServiceRegionFormData = {
  name: '',
  geojson: null,
  color: '#3b82f6',
  status: 'ACTIVE',
};

export interface ServiceRegionFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: ServiceRegionFiltersState = {
  search: '',
  status: '',
};
