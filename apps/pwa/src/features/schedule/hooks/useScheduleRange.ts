import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import type { InspectorAppointment } from '../types';

interface ScheduleRangeResponse {
  appointments: InspectorAppointment[];
}

export function useScheduleRange(from: string, to: string) {
  return useQuery<ScheduleRangeResponse>({
    queryKey: ['inspector', 'schedule', 'range', { from, to }],
    queryFn: () => apiGet<ScheduleRangeResponse>('/v1/inspector/schedule/range', { from, to }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
