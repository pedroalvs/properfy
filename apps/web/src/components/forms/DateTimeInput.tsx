import { useRef, useState } from 'react';
import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';

interface DateTimeInputProps {
  /** Canonical `YYYY-MM-DDTHH:mm`, or `''`. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/**
 * A locale-proof replacement for `<input type="datetime-local">`, composed from
 * the masked date and time fields.
 *
 * Emits `''` whenever either half is incomplete, matching what a native
 * `datetime-local` reports for a partial value — the caller's existing
 * validation and its `zonedWallTimeToUtc` round-trip therefore behave
 * identically.
 */
export function DateTimeInput({
  value,
  onChange,
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: DateTimeInputProps) {
  /**
   * Each half keeps its own draft.
   *
   * Deriving both from `value` looks simpler but erases work: completing one
   * half while the other is empty emits `''`, and re-splitting that empty
   * canonical value on the next render wipes the half just entered. The halves
   * only re-sync when the value changes from OUTSIDE — the same render-phase
   * reconciliation `useMaskedField` uses, for the same reason.
   */
  const split = (composite: string): [string, string] => {
    const [date = '', time = ''] = composite.split('T');
    return [date, time];
  };

  const [parts, setParts] = useState<[string, string]>(() => split(value));
  const syncedFrom = useRef(value);

  if (value !== syncedFrom.current) {
    syncedFrom.current = value;
    setParts(split(value));
  }

  const [datePart, timePart] = parts;

  const emit = (nextDate: string, nextTime: string) => {
    setParts([nextDate, nextTime]);
    const composite = nextDate && nextTime ? `${nextDate}T${nextTime}` : '';
    if (composite === syncedFrom.current) return;
    syncedFrom.current = composite;
    onChange(composite);
  };

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    >
      <div className="flex-1">
        <DateInput
          id={id}
          value={datePart}
          onChange={(next) => emit(next, timePart)}
          disabled={disabled}
          error={error}
          aria-label={ariaLabel ? `${ariaLabel} - date` : 'Date'}
        />
      </div>
      <div className="flex-1">
        <TimeInput
          value={timePart}
          onChange={(next) => emit(datePart, next)}
          disabled={disabled}
          error={error}
          aria-label={ariaLabel ? `${ariaLabel} - time` : 'Time'}
        />
      </div>
    </div>
  );
}
