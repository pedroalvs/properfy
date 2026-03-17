import type { SelectOption } from '@/components/forms/SelectInput';

export const PROPERTY_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Residencial', value: 'RESIDENTIAL' },
  { label: 'Comercial', value: 'COMMERCIAL' },
  { label: 'Industrial', value: 'INDUSTRIAL' },
  { label: 'Rural', value: 'RURAL' },
];

export const PROPERTY_BRANCH_OPTIONS: SelectOption[] = [
  { label: 'Filial Centro', value: 'branch-1' },
  { label: 'Filial Norte', value: 'branch-2' },
];
