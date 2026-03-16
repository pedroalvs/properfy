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

export interface InspectorFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: InspectorFiltersState = {
  search: '',
  status: '',
};
