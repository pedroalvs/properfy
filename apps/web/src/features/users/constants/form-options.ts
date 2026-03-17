import type { SelectOption } from '@/components/forms/SelectInput';

export const USER_ROLE_OPTIONS: SelectOption[] = [
  { label: 'Admin Master', value: 'AM' },
  { label: 'Operator', value: 'OP' },
  { label: 'Client Admin', value: 'CL_ADMIN' },
  { label: 'Client User', value: 'CL_USER' },
  { label: 'Inspector', value: 'INSP' },
  { label: 'Tenant', value: 'TNT' },
];

export const USER_STATUS_OPTIONS: SelectOption[] = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Blocked', value: 'LOCKED' },
];
