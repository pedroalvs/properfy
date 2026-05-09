import type { AddressLookupSuggestion } from '@/lib/address';

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
  addressJson: Record<string, unknown> | null;
  contactEmail: string | null;
  status: TenantAdminStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BranchFormData {
  name: string;
  address: AddressLookupSuggestion | null;
  contactEmail: string;
}

export type BranchFormErrors = Partial<Record<keyof BranchFormData, string>>;

export const EMPTY_BRANCH_FORM: BranchFormData = {
  name: '',
  address: null,
  contactEmail: '',
};
