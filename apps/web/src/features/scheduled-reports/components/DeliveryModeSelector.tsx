import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import type { ScheduleDeliveryMode } from '../types';

const DELIVERY_MODE_OPTIONS: SelectOption[] = [
  { value: 'OWNER_ONLY', label: 'Owner only' },
  { value: 'RECIPIENT_LIST', label: 'Recipient list' },
  { value: 'TENANT_WIDE', label: 'All users in agency' },
];

interface DeliveryModeSelectorProps {
  value: ScheduleDeliveryMode;
  onChange: (v: ScheduleDeliveryMode) => void;
  disabled?: boolean;
}

/**
 * Feature 019: controlled delivery mode selector.
 * Maps to the three modes defined in FR-018: OWNER_ONLY, RECIPIENT_LIST, TENANT_WIDE.
 */
export function DeliveryModeSelector({ value, onChange, disabled }: DeliveryModeSelectorProps) {
  return (
    <SelectInput
      value={value}
      onChange={(v) => onChange(v as ScheduleDeliveryMode)}
      options={DELIVERY_MODE_OPTIONS}
      placeholder="Select delivery mode"
      disabled={disabled}
      aria-label="Delivery mode"
    />
  );
}
