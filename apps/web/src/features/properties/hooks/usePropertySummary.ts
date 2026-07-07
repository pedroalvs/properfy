import { useQuery } from '@tanstack/react-query';
import type { PropertySummaryResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export interface PropertySummaryParams {
  tenantId?: string;
  branchId?: string;
  search?: string;
}

export interface UsePropertySummaryReturn {
  summary: PropertySummaryResponse | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

export function usePropertySummary(params: PropertySummaryParams): UsePropertySummaryReturn {
  // Empty-string filters (unset FilterSelect values) are omitted from the request.
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => !!value),
  ) as Record<string, string>;

  const query = useQuery<{ data: PropertySummaryResponse }, ApiError>({
    queryKey: ['properties', 'summary', queryParams],
    queryFn: async () => {
      const { data, error, response } = (await api.GET(
        '/v1/properties/summary',
        { params: { query: queryParams } },
      )) as { data?: unknown; error?: unknown; response?: Response };
      if (error) {
        const envelope = error as ApiErrorEnvelope;
        throw new ApiError(
          response?.status ?? 500,
          envelope.error?.message ?? 'Failed to load property summary',
          envelope.error?.code,
          undefined,
        );
      }
      return data as { data: PropertySummaryResponse };
    },
    retry: false,
  });

  return {
    summary: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
