export interface ServiceType {
  id: string;
  code: string;
  name: string;
  flowType: 'ROUTINE' | 'INGOING' | 'OUTGOING';
  requiresRentalTenantConfirmation: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTypeFormData {
  code: string;
  name: string;
  flowType: string;
  requiresRentalTenantConfirmation: boolean;
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
};
