import { useDetailQuery } from '@/hooks/useApiQuery';
import type { AppointmentDetail } from '../types';

export interface UseAppointmentDetailReturn {
  appointment: AppointmentDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentDetail(id: string | null): UseAppointmentDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<AppointmentDetail>(
    ['appointments', id],
    `/v1/appointments/${id}`,
    { enabled: !!id },
  );

  return {
    appointment: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
