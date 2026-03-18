import { useState, useMemo, useCallback } from 'react';

interface MultiDatePickerProps {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  minDate?: string;
  maxDate?: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

function getMonthLabel(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getCalendarDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();

  const days: Array<Date | null> = [];

  for (let i = 0; i < startOffset; i++) {
    days.push(null);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  return days;
}

export function MultiDatePicker({
  selectedDates,
  onChange,
  minDate,
  maxDate,
}: MultiDatePickerProps) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [viewYear, setViewYear] = useState(() => today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => today.getMonth());

  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const effectiveMinDate = useMemo(() => {
    if (!minDate) return today;
    const parsed = parseDate(minDate);
    return parsed > today ? parsed : today;
  }, [minDate, today]);

  const effectiveMaxDate = useMemo(
    () => (maxDate ? parseDate(maxDate) : null),
    [maxDate],
  );

  const calendarDays = useMemo(
    () => getCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const monthLabel = useMemo(
    () => getMonthLabel(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const goToPreviousMonth = useCallback(() => {
    setViewMonth((prev) => {
      if (prev === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((prev) => {
      if (prev === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const isDayDisabled = useCallback(
    (date: Date): boolean => {
      if (date < effectiveMinDate) return true;
      if (effectiveMaxDate && date > effectiveMaxDate) return true;
      return false;
    },
    [effectiveMinDate, effectiveMaxDate],
  );

  const toggleDate = useCallback(
    (dateStr: string) => {
      if (selectedSet.has(dateStr)) {
        onChange(selectedDates.filter((d) => d !== dateStr));
      } else {
        onChange([...selectedDates, dateStr].sort());
      }
    },
    [selectedDates, selectedSet, onChange],
  );

  const removeDate = useCallback(
    (dateStr: string) => {
      onChange(selectedDates.filter((d) => d !== dateStr));
    },
    [selectedDates, onChange],
  );

  return (
    <div className="w-full">
      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPreviousMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          aria-label="Previous month"
        >
          <i className="mdi mdi-chevron-left text-xl" />
        </button>
        <span className="text-sm font-bold text-secondary">{monthLabel}</span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          aria-label="Next month"
        >
          <i className="mdi mdi-chevron-right text-xl" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 gap-0">
        {WEEKDAY_LABELS.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-xs font-semibold text-text-muted"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0" role="grid" aria-label="Calendar">
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-9" />;
          }

          const dateStr = toDateString(date);
          const isSelected = selectedSet.has(dateStr);
          const disabled = isDayDisabled(date);

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => toggleDate(dateStr)}
              aria-label={date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              aria-pressed={isSelected}
              className={`flex h-9 w-full items-center justify-center rounded text-sm transition-colors ${
                disabled
                  ? 'cursor-not-allowed text-text-disabled'
                  : isSelected
                    ? 'bg-primary font-bold text-white'
                    : 'cursor-pointer text-text-primary hover:bg-primary/10'
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Selected dates chips */}
      {selectedDates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Selected dates">
          {selectedDates.map((dateStr) => {
            const date = parseDate(dateStr);
            const chipLabel = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });

            return (
              <span
                key={dateStr}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
              >
                {chipLabel}
                <button
                  type="button"
                  onClick={() => removeDate(dateStr)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20"
                  aria-label={`Remove ${chipLabel}`}
                >
                  <i className="mdi mdi-close text-xs" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
