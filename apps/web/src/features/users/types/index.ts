import type { UserRole, UserStatus } from '@properfy/shared';

export interface User {
  id: string;
  tenantId: string | null;
  branchId: string | null;
  branchName: string | null;
  role: UserRole;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail extends User {
  permissions: string[];
  twoFactorEnabled: boolean;
}

export interface UserFiltersState {
  search: string;
  role: string;
  status: string;
}

export const DEFAULT_FILTERS: UserFiltersState = {
  search: '',
  role: '',
  status: '',
};

export interface UserFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  branchId: string;
  password: string;
  confirmPassword: string;
}

export type UserFormErrors = Partial<Record<keyof UserFormData, string>>;

export const EMPTY_USER_FORM: UserFormData = {
  name: '',
  email: '',
  phone: '',
  role: '',
  status: '',
  branchId: '',
  password: '',
  confirmPassword: '',
};
