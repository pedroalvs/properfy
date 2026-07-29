import { TimeInput } from '@/components/forms/TimeInput';

interface TimeWindowPickerProps {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  /** When provided (HH:mm), the start-time input gets a min attribute — used to prevent past slots when date = today. */
  minStartTime?: string;
}

export function TimeWindowPicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  minStartTime,
}: TimeWindowPickerProps) {

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="sg-start-time" className="text-sm text-text-secondary">
          Start Time
        </label>
        <TimeInput
          id="sg-start-time"
          value={startTime}
          onChange={onStartTimeChange}
          aria-label="Start time"
          {...(minStartTime ? { min: minStartTime } : {})}
        />
      </div>
      <span className="mt-5 text-text-secondary">to</span>
      <div className="flex flex-col gap-1">
        <label htmlFor="sg-end-time" className="text-sm text-text-secondary">
          End Time
        </label>
        <TimeInput
          id="sg-end-time"
          value={endTime}
          onChange={onEndTimeChange}
          aria-label="End time"
        />
      </div>
    </div>
  );
}
