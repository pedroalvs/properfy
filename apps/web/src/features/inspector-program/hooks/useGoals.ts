import { useQuery } from '@tanstack/react-query';
import type { BillingPeriodType, GoalMetric, GoalResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UseGoalsParams {
  active?: boolean;
  metric?: GoalMetric;
  period?: BillingPeriodType;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'title' | 'startsAt';
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

export interface GoalsListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UseGoalsReturn {
  goals: GoalResponse[];
  meta: GoalsListMeta | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * The AM/OP goals list (`GET /v1/inspector-program/goals`). `active` defaults to
 * true (the Status filter maps Active/Inactive/All to true/false/undefined).
 */
export function useGoals({
  active,
  metric,
  period,
  page,
  pageSize,
  sortBy,
  sortOrder,
  enabled = true,
}: UseGoalsParams = {}): UseGoalsReturn {
  const query = useQuery<{ goals: GoalResponse[]; meta: GoalsListMeta | null }, ApiError>({
    queryKey: ['inspector-program', 'goals', { active, metric, period, page, pageSize, sortBy, sortOrder }],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/inspector-program/goals', {
        params: {
          query: {
            ...(active !== undefined ? { active } : {}),
            ...(metric ? { metric } : {}),
            ...(period ? { period } : {}),
            ...(page ? { page } : {}),
            ...(pageSize ? { pageSize } : {}),
            ...(sortBy ? { sortBy } : {}),
            ...(sortOrder ? { sortOrder } : {}),
          },
        },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      const body = data as { data: GoalResponse[]; meta?: GoalsListMeta };
      return { goals: body.data, meta: body.meta ?? null };
    },
  });

  return {
    goals: query.data?.goals ?? [],
    meta: query.data?.meta ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
