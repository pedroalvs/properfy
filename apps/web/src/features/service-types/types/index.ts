import type { ServiceTypeFlowType, ServiceTypeStatus } from '@properfy/shared';

export interface ServiceType {
  id: string;
  code: string;
  name: string;
  // Canonical unions from the shared package — no local re-declaration (#616).
  flowType: ServiceTypeFlowType;
  requiresRentalTenantConfirmation: boolean;
  status: ServiceTypeStatus;
  // F04-5: per-stop service duration used by the day-route planner.
  defaultDurationMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTypeFormData {
  code: string;
  name: string;
  flowType: string;
  requiresRentalTenantConfirmation: boolean;
  // Raw input string; converted to a number on save (F04-5).
  defaultDurationMinutes: string;
}

export type ServiceTypeFormErrors = Partial<Record<keyof ServiceTypeFormData, string>>;

export interface ServiceTypeFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_FILTERS: ServiceTypeFiltersState = {
  search: '',
  status: '',
};

export const EMPTY_SERVICE_TYPE_FORM: ServiceTypeFormData = {
  code: '',
  name: '',
  flowType: '',
  requiresRentalTenantConfirmation: true,
  defaultDurationMinutes: '',
};
