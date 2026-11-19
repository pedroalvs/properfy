import { useQuery } from '@tanstack/react-query';
import type { BillingPeriodType, ProgramPeriodSummaryResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UseProgramSummaryReturn {
  summary: ProgramPeriodSummaryResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Promised × achieved for one period (`GET /v1/inspector-program/summary`). The
 * query is disabled until a period is chosen.
 */
export function useProgramSummary(
  periodType: BillingPeriodType,
  periodStart: string | null,
): UseProgramSummaryReturn {
  const query = useQuery<ProgramPeriodSummaryResponse, ApiError>({
    queryKey: ['inspector-program', 'summary', periodType, periodStart],
    enabled: Boolean(periodStart),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/inspector-program/summary', {
        params: { query: { periodType, periodStart: periodStart as string } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: ProgramPeriodSummaryResponse }).data;
    },
  });

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
