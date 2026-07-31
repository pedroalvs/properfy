import type { SelectOption } from '@/components/forms/SelectInput';

// INSP is deliberately absent: create-user rejects the role outright because
// inspector accounts are created through the Inspector module, which now has its
// own password field. Offering it here only produced a confusing 403.
export const TENANT_USER_ROLE_OPTIONS: SelectOption[] = [
  { label: 'Real Estate', value: 'CL_ADMIN' },
  { label: 'Real Estate Operator', value: 'CL_USER' },
];

export const INTERNAL_USER_ROLE_OPTIONS: SelectOption[] = [
  { label: 'Admin Manager', value: 'AM' },
  { label: 'Operator', value: 'OP' },
];

export const USER_STATUS_OPTIONS: SelectOption[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Blocked', value: 'LOCKED' },
];
