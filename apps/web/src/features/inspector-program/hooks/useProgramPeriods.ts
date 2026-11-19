import { useQuery } from '@tanstack/react-query';
import type { BillingPeriodType, ProgramPeriodDirection, ProgramPeriodsResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export type ProgramPeriodOption = ProgramPeriodsResponse['data'][number];

export interface UseProgramPeriodsParams {
  periodType: BillingPeriodType;
  direction: ProgramPeriodDirection;
  count: number;
  /** Skip the request (e.g. before a cycle is chosen). Defaults to true. */
  enabled?: boolean;
}

export interface UseProgramPeriodsReturn {
  periods: ProgramPeriodOption[];
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Canonical program periods for a cycle (`GET /v1/inspector-program/periods`).
 * The web never computes a billing period — the Starts/Ends/Rewards selectors all
 * read this route (civil dates in `PLATFORM_TIMEZONE`). `direction` is
 * `upcoming` (current first) or `past` (last closed first).
 */
export function useProgramPeriods({
  periodType,
  direction,
  count,
  enabled = true,
}: UseProgramPeriodsParams): UseProgramPeriodsReturn {
  const query = useQuery<ProgramPeriodOption[], ApiError>({
    queryKey: ['inspector-program', 'periods', periodType, direction, count],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/inspector-program/periods', {
        params: { query: { periodType, direction, count } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as ProgramPeriodsResponse).data;
    },
  });

  return {
    periods: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
