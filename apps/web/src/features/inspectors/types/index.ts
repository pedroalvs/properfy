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

export interface InspectorFormData {
  name: string;
  email: string;
  phone: string;
  document: string;
  status: string;
  regions: string;
  serviceTypes: string;
}

export type InspectorFormErrors = Partial<Record<keyof InspectorFormData, string>>;

export const EMPTY_INSPECTOR_FORM: InspectorFormData = {
  name: '',
  email: '',
  phone: '',
  document: '',
  status: '',
  regions: '',
  serviceTypes: '',
};

export interface InspectorFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: InspectorFiltersState = {
  search: '',
  status: '',
};
