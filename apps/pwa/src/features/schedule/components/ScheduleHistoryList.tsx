import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTimeWindow } from '../lib/time-slot';

interface HistoryItem {
  id: string;
  appointmentCode: string;
  status: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  serviceTypeId: string;
  propertyId: string;
  rentalTenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  agencyName?: string | null;
}

interface ScheduleHistoryListProps {
  items: HistoryItem[];
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ScheduleHistoryList({ items }: ScheduleHistoryListProps) {
  const navigate = useNavigate();
  const grouped = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const item of items) {
      const existing = map.get(item.scheduledDate) ?? [];
      existing.push(item);
      map.set(item.scheduledDate, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [items]);

  if (items.length === 0) {
    return (
      <div data-testid="history-empty" className="px-page-x py-8 text-center text-sm text-text-muted">
        No completed inspections found.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-subtle">
      {grouped.map(([date, dateItems]) => (
        <div key={date}>
          <div
            data-testid="history-date-header"
            className="sticky top-0 z-10 bg-gray-50 px-page-x py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
          >
            {formatDateHeader(date)}
          </div>
          <ul className="divide-y divide-border-subtle">
            {dateItems.map((item) => (
              <li
                key={item.id}
                data-testid={`history-item-${item.id}`}
                onClick={() => navigate(`/schedule/${item.id}`)}
                className="flex cursor-pointer items-center justify-between gap-3 px-page-x py-3 active:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-secondary/10 px-1.5 py-0.5 text-[11px] font-bold text-secondary">
                      {item.appointmentCode}
                    </span>
                    <span data-testid="status-chip-done" className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                      Done
                    </span>
                  </div>
                  {item.agencyName && (
                    <p className="mt-0.5 truncate text-xs text-text-muted">{item.agencyName}</p>
                  )}
                  <p className="mt-0.5 text-xs text-text-secondary">{formatTimeWindow(item.timeSlotStart, item.timeSlotEnd)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
