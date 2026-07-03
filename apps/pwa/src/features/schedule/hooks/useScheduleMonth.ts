import { useQuery } from '@tanstack/react-query';
import { apiGet, type SuccessResponse } from '@/hooks/useApiQuery';
import { mapInspectorScheduleMonthItem } from '../lib/adapters';
import type {
  InspectorAppointment,
  InspectorScheduleMonthDay,
  InspectorScheduleMonthResponse,
} from '../types';

interface ScheduleMonthViewModel {
  today: string;
  from: string;
  to: string;
  days: InspectorScheduleMonthDay[];
  appointments: InspectorAppointment[];
  overdueAppointments: InspectorAppointment[];
}

export function useScheduleMonth() {
  return useQuery<SuccessResponse<InspectorScheduleMonthResponse>, Error, ScheduleMonthViewModel>({
    queryKey: ['inspector', 'schedule', 'month'],
    queryFn: () =>
      apiGet<SuccessResponse<InspectorScheduleMonthResponse>>('/v1/inspector/schedule/month'),
    select: (response) => ({
      today: response.data.today,
      from: response.data.from,
      to: response.data.to,
      days: response.data.days,
      appointments: response.data.appointments.map(mapInspectorScheduleMonthItem),
      overdueAppointments: response.data.overdueAppointments.map(mapInspectorScheduleMonthItem),
    }),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
