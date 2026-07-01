import { useMemo } from 'react';
import type { InspectorAppointment } from '../types';

export function useScheduleDay(
  appointments: InspectorAppointment[] | undefined,
  selectedDate: string,
): InspectorAppointment[] {
  return useMemo(() => {
    if (!appointments) return [];

    return appointments
      .filter((apt) => apt.scheduledDate === selectedDate)
      .sort((a, b) => {
        const timeDiff = a.timeSlotStart.localeCompare(b.timeSlotStart);
        if (timeDiff !== 0) return timeDiff;
        return a.suburb.localeCompare(b.suburb);
      });
  }, [appointments, selectedDate]);
}
