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
