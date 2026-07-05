import type {
  InspectorStatus,
  ServiceTypeEntry,
} from '@properfy/shared';

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
  regionIds: string[];
  serviceTypes: ServiceTypeEntry[];
  fullName?: string | null;
  abn?: string | null;
  dateOfBirth?: string | null;
  insuranceFileKey?: string | null;
  insuranceExpiresAt?: string | null;
  policeCheckFileKey?: string | null;
  policeCheckExpiresAt?: string | null;
  blockedClients?: string[];
  insuranceMetaJson?: { fileName?: string | null; uploadedAt?: string | null } | null;
  policeCheckMetaJson?: { fileName?: string | null; uploadedAt?: string | null } | null;
}

export interface InspectorFormData {
  name: string;
  email: string;
  phone: string;
  status: string;
  regionIds: string[];
  serviceTypes: string;
  fullName: string;
  abn: string;
  dateOfBirth: string;
  insuranceFileKey: string;
  insuranceExpiresAt: string;
  policeCheckFileKey: string;
  policeCheckExpiresAt: string;
  blockedClients: string[];
}

export type InspectorFormErrors = Partial<Record<keyof InspectorFormData, string>>;

export const EMPTY_INSPECTOR_FORM: InspectorFormData = {
  name: '',
  email: '',
  phone: '',
  status: '',
  regionIds: [],
  serviceTypes: '',
  fullName: '',
  abn: '',
  dateOfBirth: '',
  insuranceFileKey: '',
  insuranceExpiresAt: '',
  policeCheckFileKey: '',
  policeCheckExpiresAt: '',
  blockedClients: [],
};

export interface InspectorFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: InspectorFiltersState = {
  search: '',
  status: '',
};
