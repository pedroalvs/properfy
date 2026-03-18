import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { EligibleAppointment } from '../components/EligibleAppointmentsTable';

export interface UseEligibleAppointmentsReturn {
  data: EligibleAppointment[];
  isLoading: boolean;
  isError: boolean;
}

export function useEligibleAppointments(serviceTypeId: string | null): UseEligibleAppointmentsReturn {
  const { data: response, isLoading, isError } = usePaginatedQuery<EligibleAppointment>(
    ['appointments', 'eligible', serviceTypeId],
    '/v1/appointments',
    {
      status: 'AWAITING_INSPECTOR',
      serviceTypeId: serviceTypeId || undefined,
      pageSize: 100,
    },
    { enabled: !!serviceTypeId },
  );

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
  };
}
