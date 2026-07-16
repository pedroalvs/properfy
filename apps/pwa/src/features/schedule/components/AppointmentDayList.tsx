import { AppointmentCard } from './AppointmentCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { InspectorAppointment } from '../types';

interface AppointmentDayListProps {
  appointments: InspectorAppointment[];
  /** Sydney civil date (YYYY-MM-DD) from the schedule payload. */
  today?: string;
}

export function AppointmentDayList({ appointments, today }: AppointmentDayListProps) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        title="No appointments"
        description="You have no inspections scheduled for this day"
        icon="mdi-calendar-blank"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 px-page-x" data-testid="appointment-day-list">
      {appointments.map((apt) => (
        <AppointmentCard key={apt.id} appointment={apt} today={today} />
      ))}
    </div>
  );
}
