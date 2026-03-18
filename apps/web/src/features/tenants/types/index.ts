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

export interface TenantContactDetail extends TenantContact {
  notes: string | null;
  alternativePhone: string | null;
}

export interface TenantContactFiltersState {
  search: string;
  confirmationStatus: string;
}

export const DEFAULT_FILTERS: TenantContactFiltersState = {
  search: '',
  confirmationStatus: '',
};

// ─── Tenant Admin Types ───────────────────────────────────────────────────

export type TenantAdminStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface TenantAdmin {
  id: string;
  name: string;
  legalName: string | null;
  status: TenantAdminStatus;
  branchCount: number;
  timezone: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantAdminDetail extends TenantAdmin {
  settings: Record<string, unknown>;
  notes: string | null;
}

export interface TenantAdminFormData {
  name: string;
  legalName: string;
  timezone: string;
  currency: string;
  notes: string;
}

export type TenantAdminFormErrors = Partial<Record<keyof TenantAdminFormData, string>>;

export const EMPTY_TENANT_ADMIN_FORM: TenantAdminFormData = {
  name: '',
  legalName: '',
  timezone: '',
  currency: '',
  notes: '',
};

export interface TenantAdminFiltersState {
  search: string;
  status: string;
}

export const DEFAULT_TENANT_ADMIN_FILTERS: TenantAdminFiltersState = {
  search: '',
  status: '',
};

// ─── Branch Types ─────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  contactEmail: string | null;
  status: TenantAdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BranchFormData {
  name: string;
  address: string;
  contactEmail: string;
}

export type BranchFormErrors = Partial<Record<keyof BranchFormData, string>>;

export const EMPTY_BRANCH_FORM: BranchFormData = {
  name: '',
  address: '',
  contactEmail: '',
};
