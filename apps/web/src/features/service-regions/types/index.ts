import type { GeojsonGeometry } from '@properfy/shared';

export interface ServiceRegion {
  id: string;
  name: string;
  // Canonical Polygon | MultiPolygon from the shared schema, not `object` (#739).
  geojson: GeojsonGeometry;
  color: string;
  status: string;
  createdByUserId?: string | null;
  createdByUserName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRegionFormData {
  name: string;
  geojson: GeojsonGeometry | null;
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
