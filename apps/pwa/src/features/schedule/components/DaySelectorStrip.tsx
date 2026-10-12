import { useRef, useEffect } from 'react';
import { cn } from '@properfy/frontend-standards';
import { todayInTzDateString } from '@properfy/shared';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { parseScheduleDate } from '../lib/time-slot';

interface DaySelectorStripProps {
  days: string[];
  selectedDate: string;
  onDaySelect: (date: string) => void;
  appointmentCounts?: Record<string, number>;
  urgentDays?: Set<string>;
}

function formatDayLabel(dateStr: string, timeZone: string): { weekday: string; day: string; isToday: boolean } {
  const date = parseScheduleDate(dateStr);
  // Compared in the inspector's effective timezone, like every other
  // today-check in the app; a device-local comparison highlights the wrong day.
  const isToday = dateStr === todayInTzDateString(timeZone);

  return {
    weekday: isToday ? 'Today' : date.toLocaleDateString('en-AU', { weekday: 'short' }),
    day: date.getDate().toString(),
    isToday,
  };
}

export function DaySelectorStrip({ days, selectedDate, onDaySelect, appointmentCounts, urgentDays }: DaySelectorStripProps) {
  const timeZone = useEffectiveTimezone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const target = selectedRef.current ?? todayRef.current;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto px-page-x py-3 scrollbar-hide"
      data-testid="day-selector-strip"
    >
      {days.map((dateStr) => {
        const { weekday, day, isToday } = formatDayLabel(dateStr, timeZone);
        const isSelected = dateStr === selectedDate;
        const hasUrgent = urgentDays?.has(dateStr) ?? false;

        // v3 day cell: a small weekday+date label on top ("Today" / "Mon 21"), with
        // the job COUNT as the prominent number below ("—" for a zero-job day). When
        // no counts are supplied at all, the cell falls back to the date number.
        const countsProvided = appointmentCounts !== undefined;
        const count = appointmentCounts?.[dateStr] ?? 0;
        // With counts (the real app): weekday+date label + count number ("—" if zero).
        // Without counts (defensive): weekday label + date number (the pre-v3 fallback).
        const label = countsProvided ? (isToday ? 'Today' : `${weekday} ${day}`) : weekday;
        const primary = countsProvided ? (count > 0 ? String(count) : '—') : day;
        const showCount = countsProvided && count > 0;
        // Screen readers would otherwise hear the bare number ("Wed 18, 3"); give the
        // job count an unambiguous spoken form while the visual stays the prominent number.
        const countLabel = count > 0 ? `${count} ${count === 1 ? 'job' : 'jobs'}` : 'No jobs';

        return (
          <button
            key={dateStr}
            ref={isSelected ? selectedRef : isToday ? todayRef : undefined}
            onClick={() => onDaySelect(dateStr)}
            className={cn(
              'relative flex min-h-touch min-w-[60px] flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-card border px-2 py-1.5 transition-colors',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : isToday
                  ? 'border-primary/40 bg-card text-primary'
                  : 'border-border bg-card text-foreground',
            )}
            data-testid={`day-chip-${dateStr}`}
            aria-pressed={isSelected}
          >
            <span
              className={cn(
                'text-[11px] font-semibold',
                !isSelected && !isToday && 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            <span
              className="text-lg font-bold leading-none"
              data-testid={showCount ? `day-count-${dateStr}` : undefined}
              aria-hidden={countsProvided || undefined}
            >
              {primary}
            </span>
            {countsProvided && <span className="sr-only">{countLabel}</span>}
            {hasUrgent && (
              <span
                className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning ring-2 ring-background"
                data-testid={`day-urgent-${dateStr}`}
                aria-label="Has urgent appointments"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
