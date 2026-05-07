import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

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
  refetch: () => void;
}

export function usePortalActivities(appointmentId: string | null): UsePortalActivitiesReturn {
  const { data, isLoading, isError, refetch } = useQuery<PortalActivitiesResponse, ApiError>({
    queryKey: ['portal-activities', appointmentId],
    queryFn: async () => {
      const { data: response, error } = await (api.GET as any)(
        `/v1/appointments/${appointmentId}/portal-activities`,
        { params: { query: { page: '1', pageSize: '50' } } },
      );
      if (error) {
        const apiError = error as { status?: number; message?: string };
        throw new ApiError(apiError.status ?? 500, apiError.message ?? 'Failed to load portal activities');
      }
      return response as unknown as PortalActivitiesResponse;
    },
    enabled: !!appointmentId,
  });

  return {
    activities: data?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
