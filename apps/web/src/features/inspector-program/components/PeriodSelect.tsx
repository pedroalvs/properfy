import type { BillingPeriodType } from '@properfy/shared';
import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import type { ProgramPeriodOption } from '../hooks/useProgramPeriods';
import { formatPeriodOptionLabel } from '../lib/goal-labels';

export interface PeriodSelectProps {
  periodType: BillingPeriodType;
  periods: ProgramPeriodOption[];
  value: string;
  onChange: (value: string) => void;
  /** Suffix " · In progress" on the current period (Rewards tab). */
  showStatus?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * A select over backend-provided program periods. The web never computes a
 * period — labels are built from each period's civil start/end
 * (`PLATFORM_TIMEZONE`) via `formatPeriodOptionLabel`. Used by the Rewards tab
 * period selector.
 */
export function PeriodSelect({
  periodType,
  periods,
  value,
  onChange,
  showStatus = false,
  disabled,
  id,
  'aria-label': ariaLabel,
}: PeriodSelectProps) {
  const options: SelectOption[] = periods.map((p) => ({
    value: p.start,
    label:
      formatPeriodOptionLabel(periodType, p.start, p.end) +
      (showStatus && p.status === 'IN_PROGRESS' ? ' · In progress' : ''),
  }));

  return (
    <SelectInput
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
    />
  );
}
