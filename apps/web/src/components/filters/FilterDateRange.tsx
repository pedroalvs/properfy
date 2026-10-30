import { useId, type MutableRefObject } from 'react';
import { cn } from '@properfy/frontend-standards';
import { filterContainer, filterLabel, filterIcon } from './filter-styles';
import { DateInput } from '@/components/forms/DateInput';

interface FilterDateRangeProps {
  label: string;
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  /** Lower bound (`YYYY-MM-DD`) applied to BOTH inputs; marks out-of-range values invalid. */
  min?: string;
  /** Upper bound (`YYYY-MM-DD`) applied to BOTH inputs. */
  max?: string;
  /** Optional caption below the inputs, wired to both via `aria-describedby`. */
  helperText?: string;
  /** Optional external handle to the start input (e.g. return-focus after a chip ✕). */
  startInputRef?: MutableRefObject<HTMLInputElement | null>;
}

export function FilterDateRange({
  label,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  min,
  max,
  helperText,
  startInputRef,
}: FilterDateRangeProps) {
  const hasValue = startDate !== '' || endDate !== '';
  const helperId = useId();
  const describedBy = helperText ? helperId : undefined;

  return (
    <div className={filterContainer}>
      {hasValue && <span className={filterLabel}>{label}</span>}
      <div className="px-3 py-[7px]">
        <div className="mb-2 flex items-center gap-2 sm:mb-0 sm:hidden">
          <i className={cn('mdi mdi-calendar', filterIcon)} />
          <span className="text-sm text-text-muted">{label}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="hidden items-center gap-2 sm:flex">
            <i className={cn('mdi mdi-calendar', filterIcon)} />
          </div>
          <div className="min-w-0 flex-1">
            <DateInput
              variant="bare"
              value={startDate}
              onChange={onStartChange}
              min={min}
              max={max}
              inputRef={startInputRef}
              aria-label={`${label} - start`}
              aria-describedby={describedBy}
            />
          </div>
          <span className="px-1 text-xs text-text-muted sm:px-0">to</span>
          <div className="min-w-0 flex-1">
            <DateInput
              variant="bare"
              value={endDate}
              onChange={onEndChange}
              min={min}
              max={max}
              aria-label={`${label} - end`}
              aria-describedby={describedBy}
            />
          </div>
        </div>
        {helperText && (
          <p id={helperId} className="mt-1.5 text-xs text-text-muted">
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}
