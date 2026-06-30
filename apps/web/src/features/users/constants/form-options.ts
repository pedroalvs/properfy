import type { SelectOption } from '@/components/forms/SelectInput';

export const TENANT_USER_ROLE_OPTIONS: SelectOption[] = [
  { label: 'Real Estate', value: 'CL_ADMIN' },
  { label: 'Real Estate Operator', value: 'CL_USER' },
  { label: 'Inspector', value: 'INSP' },
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
