import { useMemo, useState } from 'react';

interface CalendarPanelProps {
  /** Canonical `YYYY-MM-DD`, or `''`. */
  selected: string;
  onSelect: (value: string) => void;
  min?: string;
  max?: string;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** AU convention: day before month, matching every date the product renders. */
const CALENDAR_LOCALE = 'en-AU';

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value: string): Date | null {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

function getCalendarDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

/**
 * Single-date month grid, shown in `DateInput`'s popover.
 *
 * Deliberately separate from `MultiDatePicker` rather than a variant of it:
 * that component clamps its minimum to today, which is right for scheduling but
 * would make the inspector date-of-birth field unusable. Here `min` is honoured
 * exactly as given, and omitted means unbounded in both directions.
 */
export function CalendarPanel({ selected, onSelect, min, max }: CalendarPanelProps) {
  const selectedDate = useMemo(() => (selected ? parseDate(selected) : null), [selected]);

  const [view, setView] = useState(() => {
    const anchor = selectedDate ?? new Date();
    return { year: anchor.getFullYear(), month: anchor.getMonth() };
  });

  const days = useMemo(() => getCalendarDays(view.year, view.month), [view]);
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(CALENDAR_LOCALE, {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const isDisabled = (date: Date) => {
    const value = toDateString(date);
    return (min != null && value < min) || (max != null && value > max);
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded p-1 text-text-secondary hover:bg-primary/10 hover:text-primary"
        >
          <i className="mdi mdi-chevron-left text-lg" aria-hidden="true" />
        </button>
        <span className="text-sm font-bold text-secondary">{monthLabel}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded p-1 text-text-secondary hover:bg-primary/10 hover:text-primary"
        >
          <i className="mdi mdi-chevron-right text-lg" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1 text-[11px] font-semibold text-text-muted">
            {label}
          </span>
        ))}

        {days.map((date, index) => {
          if (!date) return <span key={`pad-${index}`} />;

          const value = toDateString(date);
          const disabled = isDisabled(date);
          const isSelected = value === selected;

          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(value)}
              aria-pressed={isSelected}
              aria-label={date.toLocaleDateString(CALENDAR_LOCALE, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              className={`flex h-9 w-full items-center justify-center rounded text-sm transition-colors ${
                isSelected
                  ? 'bg-primary font-bold text-white'
                  : disabled
                    ? 'cursor-not-allowed text-text-disabled'
                    : 'text-text-primary hover:bg-primary/10'
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
