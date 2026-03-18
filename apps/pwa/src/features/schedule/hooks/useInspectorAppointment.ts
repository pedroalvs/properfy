import { useDetailQuery } from '@/hooks/useApiQuery';
import type { InspectorAppointment } from '../types';

export function useInspectorAppointment(appointmentId: string) {
  return useDetailQuery<InspectorAppointment>(
    ['inspector', 'appointment', appointmentId],
    `/v1/inspector/appointments/${appointmentId}`,
    {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  );
}
