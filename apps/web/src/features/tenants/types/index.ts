import type { TenantConfirmationStatus } from '@properfy/shared';

export interface TenantContact {
  id: string;
  appointmentId: string;
  appointmentCode: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  confirmationStatus: TenantConfirmationStatus;
  propertyAddress: string;
  appointmentDate: string;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantContactFiltersState {
  search: string;
  confirmationStatus: string;
}

export const DEFAULT_FILTERS: TenantContactFiltersState = {
  search: '',
  confirmationStatus: '',
};
