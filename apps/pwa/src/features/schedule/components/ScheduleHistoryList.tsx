import { useMemo } from 'react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { AppointmentCard } from './AppointmentCard';
import type { InspectorAppointment } from '../types';
import type { HistoryItem } from '../hooks/useScheduleHistory';

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

/** AppointmentCard only reads display fields; contact/detail fields are stubbed. */
function toCardAppointment(item: HistoryItem): InspectorAppointment {
  return {
    id: item.id,
    appointmentCode: item.appointmentCode,
    propertyAddress: item.propertyAddress,
    suburb: item.suburb,
    scheduledDate: item.scheduledDate,
    timeSlotStart: item.timeSlotStart,
    timeSlotEnd: item.timeSlotEnd,
    status: item.status as InspectorAppointment['status'],
    rentalTenantConfirmation:
      item.rentalTenantConfirmationStatus as InspectorAppointment['rentalTenantConfirmation'],
    serviceTypeName: item.serviceTypeName,
    flowType: item.flowType,
    rentalTenantName: '',
    rentalTenantPhone: null,
    rentalTenantEmail: null,
    keyRequired: item.keyRequired,
    meetingLocation: item.meetingLocation,
    restrictions: null,
    propertyLatitude: null,
    propertyLongitude: null,
    notes: null,
    observation: null,
    customFields: [],
    agencyName: item.agencyName ?? undefined,
    apps: [],
  };
}

export function ScheduleHistoryList({ items }: ScheduleHistoryListProps) {
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
      <div data-testid="history-empty">
        <EmptyState
          icon="mdi-check-circle-outline"
          title="No completed inspections"
          description="Inspections you finish will show up here."
        />
      </div>
    );
  }

  return (
    <div>
      {grouped.map(([date, dateItems]) => (
        <div key={date}>
          <div
            data-testid="history-date-header"
            className="sticky top-0 z-10 bg-gray-50 px-page-x py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
          >
            {formatDateHeader(date)}
          </div>
          <div className="flex flex-col gap-3 px-page-x py-2">
            {dateItems.map((item) => (
              <AppointmentCard key={item.id} appointment={toCardAppointment(item)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
