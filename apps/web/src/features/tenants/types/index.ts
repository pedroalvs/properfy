import { MAP_WINDOW_DAYS_DEFAULT } from '@properfy/shared';
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
  /** GET /v1/tenants/:id returns the settings blob under `settingsJson`. */
  settingsJson?: Record<string, unknown>;
  /** Dedicated column; null for legacy rows pending backfill. */
  appointmentCodePrefix?: string | null;
  notes: string | null;
}

export interface TenantAdminFormData {
  name: string;
  legalName: string;
  /** IANA timezone every user of this agency inherits (CL_* roles). */
  timezone: string;
  currency: string;
  /** 3–4 letters/numbers, uppercased, unique per agency (e.g. "INS" -> "INS-0042"). */
  appointmentCodePrefix: string;
  notes: string;
  /**
   * When false, Properfy never contacts this agency's rental tenants on either
   * channel; withheld messages are emailed to the branch contact instead.
   */
  rentalTenantNotificationsEnabled: boolean;
  /**
   * Days ahead of today the appointment map shows by default (F00). Held as the
   * raw input string so the drawer can validate "1–90 integer" before saving;
   * converted to a number in the PATCH payload. Edit mode only.
   */
  mapWindowDays: string;
}

export type TenantAdminFormErrors = Partial<Record<keyof TenantAdminFormData, string>>;

export const EMPTY_TENANT_ADMIN_FORM: TenantAdminFormData = {
  name: '',
  legalName: '',
  timezone: 'Australia/Sydney',
  currency: '',
  appointmentCodePrefix: '',
  notes: '',
  rentalTenantNotificationsEnabled: true,
  mapWindowDays: String(MAP_WINDOW_DAYS_DEFAULT),
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
