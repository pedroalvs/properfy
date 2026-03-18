interface TimeWindowPickerProps {
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}

export function TimeWindowPicker({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: TimeWindowPickerProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="sg-start-time" className="text-sm text-text-secondary">
          Start Time
        </label>
        <input
          id="sg-start-time"
          type="time"
          value={startTime}
          onChange={(e) => onStartTimeChange(e.target.value)}
          className="rounded border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          aria-label="Start time"
        />
      </div>
      <span className="mt-5 text-text-secondary">to</span>
      <div className="flex flex-col gap-1">
        <label htmlFor="sg-end-time" className="text-sm text-text-secondary">
          End Time
        </label>
        <input
          id="sg-end-time"
          type="time"
          value={endTime}
          onChange={(e) => onEndTimeChange(e.target.value)}
          className="rounded border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          aria-label="End time"
        />
      </div>
    </div>
  );
}
