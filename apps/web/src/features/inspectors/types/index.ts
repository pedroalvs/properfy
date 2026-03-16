import type { InspectorStatus } from '@properfy/shared';

export interface Inspector {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: InspectorStatus;
  regionsCount: number;
  serviceTypesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InspectorDetail extends Inspector {
  regions: string[];
  serviceTypes: string[];
  document: string | null;
  rating: number | null;
}

export interface InspectorDetail extends Inspector {
  regions: string[];
  serviceTypes: string[];
  document: string | null;
  rating: number | null;
}

export interface InspectorFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: InspectorFiltersState = {
  search: '',
  status: '',
};
