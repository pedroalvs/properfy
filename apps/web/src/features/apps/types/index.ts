import type { AppCredentialResponse, AppCredentialListItem } from '@properfy/shared';

export type AppCredential = AppCredentialResponse;
export type AppCredentialRow = AppCredentialListItem;

export interface AppFormData {
  tenantId: string;
  /** Empty string = agency-wide (no branch scope). */
  branchId: string;
  name: string;
  username: string;
  password: string;
  needsAuthCode: boolean;
  authCode: string;
  appUrl: string;
  instructionsUrl: string;
  instructionsPassword: string;
}

export type AppFormErrors = Partial<Record<keyof AppFormData, string>>;

export const EMPTY_APP_FORM: AppFormData = {
  tenantId: '',
  branchId: '',
  name: '',
  username: '',
  password: '',
  needsAuthCode: false,
  authCode: '',
  appUrl: '',
  instructionsUrl: '',
  instructionsPassword: '',
};

export interface AppFiltersState {
  search: string;
  isActive: string;
}

export const DEFAULT_APP_FILTERS: AppFiltersState = {
  search: '',
  isActive: 'true',
};
