import { useDetailQuery } from '@/hooks/useApiQuery';
import { mapInspectorAppointmentDetail } from '../lib/adapters';
import type { InspectorAppointment, InspectorAppointmentDetailResponse } from '../types';

export function useInspectorAppointment(appointmentId: string) {
  const query = useDetailQuery<InspectorAppointmentDetailResponse['data']>(
    ['inspector', 'appointment', appointmentId],
    `/v1/inspector/appointments/${appointmentId}`,
    {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  );

  const raw = query.data?.data as InspectorAppointmentDetailResponse['data'] | undefined;

  return {
    ...query,
    data: raw
      ? { data: mapInspectorAppointmentDetail({ data: raw }) as InspectorAppointment }
      : undefined,
    jobDetails: raw?.jobDetails,
  };
}
