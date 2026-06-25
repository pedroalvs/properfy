import type { AppCredentialResponse, AppCredentialListItem } from '@properfy/shared';

export type AppCredential = AppCredentialResponse;
export type AppCredentialRow = AppCredentialListItem;

export interface AppFormData {
  tenantId: string;
  name: string;
  username: string;
  password: string;
}

export type AppFormErrors = Partial<Record<keyof AppFormData, string>>;

export const EMPTY_APP_FORM: AppFormData = {
  tenantId: '',
  name: '',
  username: '',
  password: '',
};

export interface AppFiltersState {
  search: string;
  isActive: string;
}

export const DEFAULT_APP_FILTERS: AppFiltersState = {
  search: '',
  isActive: 'true',
};
