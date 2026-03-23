import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import { mapInspectorAppointmentDetail } from '../lib/adapters';
import type {
  InspectorAppointment,
  InspectorAppointmentDetailResponse,
  InspectorScheduleDayResponse,
} from '../types';

interface ScheduleRangeResponse {
  appointments: InspectorAppointment[];
}

function listDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]!);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function useScheduleRange(from: string, to: string) {
  return useQuery<ScheduleRangeResponse>({
    queryKey: ['inspector', 'schedule', 'range', { from, to }],
    queryFn: async () => {
      const dates = listDates(from, to);
      const dayResponses = await Promise.all(
        dates.map((date) =>
          apiGet<InspectorScheduleDayResponse>('/v1/inspector/schedule', { date }),
        ),
      );

      const appointmentIds = dayResponses.flatMap((response) =>
        response.appointments.map((appointment) => appointment.id),
      );

      const detailResponses = await Promise.all(
        appointmentIds.map((appointmentId) =>
          apiGet<InspectorAppointmentDetailResponse>(
            `/v1/inspector/appointments/${appointmentId}`,
          ),
        ),
      );

      return {
        appointments: detailResponses.map(mapInspectorAppointmentDetail),
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
