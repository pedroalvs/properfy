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
  const [datePart = '', timePart = ''] = value.split('T');

  const emit = (nextDate: string, nextTime: string) => {
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : '');
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
