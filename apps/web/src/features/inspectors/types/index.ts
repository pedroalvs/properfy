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
  regionIds: string[];
  serviceTypes: string[];
  clientEligibility: string[];
}

export interface InspectorFormData {
  name: string;
  email: string;
  phone: string;
  status: string;
  regions: string;
  regionIds: string[];
  serviceTypes: string;
  clientEligibility: string[];
}

export type InspectorFormErrors = Partial<Record<keyof InspectorFormData, string>>;

export const EMPTY_INSPECTOR_FORM: InspectorFormData = {
  name: '',
  email: '',
  phone: '',
  status: '',
  regions: '',
  regionIds: [],
  serviceTypes: '',
  clientEligibility: [],
};

export interface InspectorFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: InspectorFiltersState = {
  search: '',
  status: '',
};
