import { useMemo } from 'react';
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

  // PR #961 bug class (web AppointmentFormDrawer freeze): memoized so consumers
  // get a stable mapped object per fetch result, never a fresh reference each
  // render. Keep any future payload transforms INSIDE this memo.
  const data = useMemo(
    () =>
      raw
        ? { data: mapInspectorAppointmentDetail({ data: raw }) as InspectorAppointment }
        : undefined,
    [raw],
  );

  return {
    ...query,
    data,
    jobDetails: raw?.jobDetails,
  };
}
