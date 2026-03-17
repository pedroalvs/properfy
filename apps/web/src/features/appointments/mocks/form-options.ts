import type { SelectOption } from '@/components/forms/SelectInput';
import { MOCK_PROPERTIES } from '@/features/properties/mocks/properties';

export const BRANCH_OPTIONS: SelectOption[] = [
  { label: 'Filial Centro', value: 'branch-1' },
  { label: 'Filial Norte', value: 'branch-2' },
];

export const SERVICE_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Vistoria de Entrada', value: 'svc-1' },
  { label: 'Vistoria de Saída', value: 'svc-2' },
];

export const PROPERTY_OPTIONS: SelectOption[] = MOCK_PROPERTIES.map((p) => ({
  label: `${p.propertyCode} — ${p.street}`,
  value: p.id,
}));

export const TIME_SLOT_OPTIONS: SelectOption[] = [
  { label: '09:00 - 12:00', value: '09:00-12:00' },
  { label: '14:00 - 17:00', value: '14:00-17:00' },
];
