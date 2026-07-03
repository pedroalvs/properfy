import { TimeInput } from './TimeInput';

interface TimeRangeInputProps {
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  /** HH:mm lower bound applied to the start input (e.g. now, when date = today). */
  minStartTime?: string;
  disabled?: boolean;
  error?: boolean;
  /** Distinct DOM id prefix so multiple instances on one form stay unique/accessible. */
  idPrefix?: string;
  'aria-describedby'?: string;
}

export function TimeRangeInput({
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  minStartTime,
  disabled,
  error,
  idPrefix = 'time-range',
  'aria-describedby': ariaDescribedBy,
}: TimeRangeInputProps) {
  return (
    <div className="flex items-center gap-2">
      <TimeInput
        id={`${idPrefix}-start`}
        value={startTime}
        onChange={onStartChange}
        min={minStartTime}
        disabled={disabled}
        error={error}
        aria-label="Start time"
        aria-describedby={ariaDescribedBy}
      />
      <span className="text-sm text-text-muted">to</span>
      <TimeInput
        id={`${idPrefix}-end`}
        value={endTime}
        onChange={onEndChange}
        disabled={disabled}
        error={error}
        aria-label="End time"
        aria-describedby={ariaDescribedBy}
      />
    </div>
  );
}
