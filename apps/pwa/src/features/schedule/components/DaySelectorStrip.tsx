import { useRef, useEffect } from 'react';

interface DaySelectorStripProps {
  days: string[];
  selectedDate: string;
  onDaySelect: (date: string) => void;
  appointmentCounts?: Record<string, number>;
  urgentDays?: Set<string>;
}

function formatDayLabel(dateStr: string): { weekday: string; day: string; isToday: boolean } {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  return {
    weekday: isToday ? 'Today' : date.toLocaleDateString('en-AU', { weekday: 'short' }),
    day: date.getDate().toString(),
    isToday,
  };
}

export function DaySelectorStrip({ days, selectedDate, onDaySelect, appointmentCounts, urgentDays }: DaySelectorStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (todayRef.current && typeof todayRef.current.scrollIntoView === 'function') {
      todayRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto px-page-x py-3 scrollbar-hide"
      data-testid="day-selector-strip"
    >
      {days.map((dateStr) => {
        const { weekday, day, isToday } = formatDayLabel(dateStr);
        const isSelected = dateStr === selectedDate;
        const count = appointmentCounts?.[dateStr] ?? 0;

        const hasUrgent = urgentDays?.has(dateStr) ?? false;

        return (
          <button
            key={dateStr}
            ref={isToday ? todayRef : undefined}
            onClick={() => onDaySelect(dateStr)}
            className={`relative flex min-h-touch min-w-[56px] flex-shrink-0 flex-col items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
              isSelected
                ? 'bg-primary text-white'
                : isToday
                  ? 'bg-primary/10 text-primary'
                  : 'bg-card-bg text-text-secondary'
            }`}
            data-testid={`day-chip-${dateStr}`}
            aria-pressed={isSelected}
          >
            <span className="text-[10px] uppercase">{weekday}</span>
            <span className="text-base">{day}</span>
            {hasUrgent && (
              <span
                className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-warning"
                data-testid={`day-urgent-${dateStr}`}
                aria-label="Has urgent appointments"
              />
            )}
            {count > 0 && (
              <span
                className={`absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isSelected ? 'bg-white text-primary' : 'bg-primary text-white'
                }`}
                data-testid={`day-count-${dateStr}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
