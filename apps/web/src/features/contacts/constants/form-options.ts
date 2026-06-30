import type { SelectOption } from '@/components/forms/SelectInput';

export const CONTACT_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Tenant', value: 'RENTAL_TENANT' },
  { label: 'Property Manager', value: 'PROPERTY_MANAGER' },
  { label: 'Housekeeper', value: 'HOUSEKEEPER' },
  { label: 'Broker', value: 'BROKER' },
  { label: 'Other', value: 'OTHER' },
];

export const CONTACT_CHANNEL_OPTIONS: SelectOption[] = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'Phone', value: 'PHONE' },
];
