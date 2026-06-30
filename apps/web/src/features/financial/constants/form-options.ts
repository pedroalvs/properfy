import type { SelectOption } from '@/components/forms/SelectInput';

export const ENTRY_TYPE_OPTIONS: SelectOption[] = [
  { label: 'Agency Debit', value: 'TENANT_DEBIT' },
  { label: 'Inspector Payout', value: 'INSPECTOR_PAYOUT' },
  { label: 'Refund', value: 'REFUND' },
  { label: 'Manual Adjustment', value: 'MANUAL_ADJUSTMENT' },
];
