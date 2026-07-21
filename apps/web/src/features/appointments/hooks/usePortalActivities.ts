import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface PortalActivity {
  id: string;
  appointmentId: string;
  tenantPortalTokenId: string;
  action: string;
  previousValuesJson: unknown | null;
  newValuesJson: unknown | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface PortalActivitiesResponse {
  data: PortalActivity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UsePortalActivitiesReturn {
  activities: PortalActivity[];
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

export function usePortalActivities(appointmentId: string | null): UsePortalActivitiesReturn {
  const { data, isLoading, isError, error, refetch } = useQuery<PortalActivitiesResponse, ApiError>({
    queryKey: ['portal-activities', appointmentId],
    queryFn: async () => {
      const { data: response, error, response: httpResponse } = await (api.GET as any)(
        `/v1/appointments/${appointmentId}/portal-activities`,
        { params: { query: { page: '1', pageSize: '50' } } },
      );
      if (error) throw toApiError(error, httpResponse?.status);
      return response as unknown as PortalActivitiesResponse;
    },
    enabled: !!appointmentId,
  });

  return {
    activities: data?.data ?? [],
    isLoading,
    isError,
    error: error ?? null,
    refetch,
  };
}
