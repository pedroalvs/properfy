import { useMemo, useState } from 'react';
import type { AvailableGroup } from '@properfy/shared';
import { formatDate } from '@/lib/format-date';

interface AvailableGroupsListProps {
  groups: AvailableGroup[];
  isLoading?: boolean;
  isError?: boolean;
  selectedSlotKey?: string;
  onSelect: (group: AvailableGroup) => void;
  onRetry?: () => void;
}

export function getAvailableGroupSlotKey(group: Pick<AvailableGroup, 'groupId' | 'scheduledDate' | 'timeSlotStart' | 'timeSlotEnd'>): string {
  return `${group.groupId}|${group.scheduledDate}|${group.timeSlotStart}|${group.timeSlotEnd}`;
}

function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-xl border border-black/10 bg-white p-4">
      <div className="mb-2 h-4 w-1/3 rounded bg-gray-200" />
      <div className="h-3 w-1/2 rounded bg-gray-100" />
    </div>
  );
}

function dayTabLabel(date: string): { day: string; weekday: string } {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { day: date, weekday: '' };
  return {
    day: String(parsed.getDate()).padStart(2, '0'),
    weekday: parsed.toLocaleDateString('en-AU', { weekday: 'short' }),
  };
}

export function AvailableGroupsList({
  groups,
  isLoading,
  isError,
  selectedSlotKey,
  onSelect,
  onRetry,
}: AvailableGroupsListProps) {
  const dates = useMemo(
    () => [...new Set(groups.map((g) => g.scheduledDate))].sort(),
    [groups],
  );
  const [activeDate, setActiveDate] = useState<string | null>(null);
  // Default to the first available day; reset if the groups list no longer has it.
  const currentDate = activeDate && dates.includes(activeDate) ? activeDate : dates[0];

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading available times">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <p className="mb-3 text-sm text-red-700">Failed to load available times. Please try again.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">No available times nearby.</p>
    );
  }

  const dayGroups = groups.filter((g) => g.scheduledDate === currentDate);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Available days">
        {dates.map((date) => {
          const isActive = date === currentDate;
          const { day, weekday } = dayTabLabel(date);
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveDate(date)}
              className={[
                'min-w-[62px] rounded-xl border-[1.5px] px-2 pb-1.5 pt-2 text-center text-xs transition-colors',
                isActive
                  ? 'border-real-estate bg-real-estate text-white'
                  : 'border-black/10 text-text-secondary hover:border-black/20',
              ].join(' ')}
            >
              <span className="block text-lg font-extrabold leading-tight">{day}</span>
              {weekday}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {dayGroups.map((group) => {
          const slotKey = getAvailableGroupSlotKey(group);
          const isSelected = slotKey === selectedSlotKey;
          return (
            <button
              key={slotKey}
              type="button"
              data-testid="group-row"
              onClick={() => onSelect(group)}
              className={[
                'w-full rounded-xl border-[1.5px] bg-white p-3.5 text-left transition-colors',
                isSelected
                  ? 'border-real-estate bg-[color-mix(in_srgb,var(--color-real-estate)_12%,white)] shadow-[0_0_0_1px_var(--color-real-estate)]'
                  : 'border-black/10 hover:border-[color-mix(in_srgb,var(--color-real-estate)_50%,white)]',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">
                  {group.timeSlotStart} – {group.timeSlotEnd}
                </span>
                {isSelected && (
                  <i className="mdi mdi-check font-bold text-real-estate" aria-hidden="true" />
                )}
              </div>
              <div className="mt-0.5 text-xs font-medium text-text-muted">
                {group.suburb} · with {group.inspectorName} · {formatDate(group.scheduledDate)} ·{' '}
                {group.confirmedCount}/{group.capacityMax} confirmed
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
