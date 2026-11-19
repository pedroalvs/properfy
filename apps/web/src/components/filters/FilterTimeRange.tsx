import { useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { filterContainer, filterLabel, filterLabelFocused, filterIcon } from './filter-styles';
import { TimeInput } from '@/components/forms/TimeInput';

interface FilterTimeRangeProps {
  label: string;
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

export function FilterTimeRange({
  label,
  startTime,
  endTime,
  onStartChange,
  onEndChange,
}: FilterTimeRangeProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={filterContainer}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <span className={focused ? filterLabelFocused : filterLabel}>{label}</span>
      <div className="px-3 py-[7px]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="hidden items-center gap-2 sm:flex">
            <i className={cn('mdi mdi-clock-outline', filterIcon)} />
          </div>
          <div className="min-w-0 flex-1">
            <TimeInput
              variant="bare"
              value={startTime}
              onChange={onStartChange}
              aria-label={`${label} - start`}
            />
          </div>
          <span className="px-1 text-xs text-text-muted sm:px-0">to</span>
          <div className="min-w-0 flex-1">
            <TimeInput
              variant="bare"
              value={endTime}
              onChange={onEndChange}
              min={startTime || undefined}
              aria-label={`${label} - end`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
