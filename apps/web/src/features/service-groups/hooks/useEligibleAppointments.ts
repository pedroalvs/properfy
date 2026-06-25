import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { EligibleAppointment } from '../components/EligibleAppointmentsTable';

export interface UseEligibleAppointmentsReturn {
  data: EligibleAppointment[];
  isLoading: boolean;
  isError: boolean;
}

export function useEligibleAppointments(
  serviceTypeId: string | null,
  tenantId?: string | null,
): UseEligibleAppointmentsReturn {
  const tenantReady = tenantId === undefined || tenantId === null || tenantId.length > 0;

  const { data: response, isLoading, isError } = usePaginatedQuery<EligibleAppointment>(
    ['appointments', 'eligible', serviceTypeId, tenantId ?? null],
    '/v1/appointments',
    {
      serviceTypeId: serviceTypeId || undefined,
      tenantId: tenantId || undefined,
      ungroupedOnly: 'true',
      pageSize: 100,
    },
    { enabled: !!serviceTypeId && tenantReady },
  );

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
  };
}
