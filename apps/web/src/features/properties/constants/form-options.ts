import type { SelectOption } from '@/components/forms/SelectInput';

export const PROPERTY_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Apartment', value: 'APARTMENT' },
  { label: 'House', value: 'HOUSE' },
];

export const YES_NO_OPTIONS: SelectOption[] = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
];

export const STATE_OPTIONS: SelectOption[] = [
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NSW', label: 'New South Wales' },
  { value: 'NT', label: 'Northern Territory' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'WA', label: 'Western Australia' },
];
