import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import { FormField } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import type { StructuredRecurrence } from '../types';

const RECURRENCE_TYPE_OPTIONS: SelectOption[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DAY_OF_WEEK_OPTIONS: SelectOption[] = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

interface RecurrenceSelectorProps {
  value: StructuredRecurrence;
  onChange: (v: StructuredRecurrence) => void;
  disabled?: boolean;
}

/**
 * Feature 019: controlled recurrence selector for daily / weekly / monthly.
 * Renders secondary fields based on the selected type.
 */
export function RecurrenceSelector({ value, onChange, disabled }: RecurrenceSelectorProps) {
  const handleTypeChange = (type: string) => {
    if (type === 'daily') {
      onChange({ type: 'daily', hour: value.hour });
    } else if (type === 'weekly') {
      onChange({ type: 'weekly', dayOfWeek: 1, hour: value.hour });
    } else {
      onChange({ type: 'monthly', dayOfMonth: 1, hour: value.hour });
    }
  };

  const handleHourChange = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const hour = Number.isNaN(parsed) ? 0 : Math.min(23, Math.max(0, parsed));
    if (value.type === 'daily') {
      onChange({ ...value, hour });
    } else if (value.type === 'weekly') {
      onChange({ ...value, hour });
    } else {
      onChange({ ...value, hour });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FormField label="Frequency" required>
        <SelectInput
          value={value.type}
          onChange={handleTypeChange}
          options={RECURRENCE_TYPE_OPTIONS}
          placeholder="Select frequency"
          disabled={disabled}
          aria-label="Frequency"
        />
      </FormField>

      {value.type === 'weekly' && (
        <FormField label="Day of week" required>
          <SelectInput
            value={String(value.dayOfWeek)}
            onChange={(v) => onChange({ ...value, dayOfWeek: parseInt(v, 10) })}
            options={DAY_OF_WEEK_OPTIONS}
            placeholder="Select day"
            disabled={disabled}
            aria-label="Day of week"
          />
        </FormField>
      )}

      {value.type === 'monthly' && (
        <FormField label="Day of month" required>
          <NumberInput
            value={String(value.dayOfMonth)}
            onChange={(raw) => {
              const parsed = parseInt(raw, 10);
              const dayOfMonth = Number.isNaN(parsed) ? 1 : Math.min(28, Math.max(1, parsed));
              onChange({ ...value, dayOfMonth });
            }}
            min={1}
            max={28}
            disabled={disabled}
            aria-label="Day of month"
          />
        </FormField>
      )}

      <FormField label="Hour (0–23)" required>
        <NumberInput
          value={String(value.hour)}
          onChange={handleHourChange}
          min={0}
          max={23}
          disabled={disabled}
          aria-label="Hour"
        />
      </FormField>
    </div>
  );
}
