import { useQuery } from '@tanstack/react-query';
import type { BillingPeriodType, RewardAwardResponse, RewardAwardStatus } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UseRewardAwardsParams {
  periodType: BillingPeriodType;
  periodStart: string | null;
  status?: RewardAwardStatus;
  goalId?: string;
  inspectorId?: string;
}

export interface UseRewardAwardsReturn {
  awards: RewardAwardResponse[];
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * The awards of one period (`GET /v1/inspector-program/awards`). Disabled until a
 * period is chosen.
 */
export function useRewardAwards({
  periodType,
  periodStart,
  status,
  goalId,
  inspectorId,
}: UseRewardAwardsParams): UseRewardAwardsReturn {
  const query = useQuery<RewardAwardResponse[], ApiError>({
    queryKey: ['inspector-program', 'awards', { periodType, periodStart, status, goalId, inspectorId }],
    enabled: Boolean(periodStart),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/inspector-program/awards', {
        params: {
          query: {
            periodType,
            periodStart: periodStart as string,
            ...(status ? { status } : {}),
            ...(goalId ? { goalId } : {}),
            ...(inspectorId ? { inspectorId } : {}),
          },
        },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: RewardAwardResponse[] }).data;
    },
  });

  return {
    awards: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
