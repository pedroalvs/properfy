import { useQuery } from '@tanstack/react-query';
import type { GoalResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UseGoalReturn {
  goal: GoalResponse | null;
  isLoading: boolean;
  isError: boolean;
  isNotFound: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * A single goal (`GET /v1/inspector-program/goals/:id`) for the edit form. The
 * query is disabled without an id; a 404 surfaces as `isNotFound` so the form
 * shows "Goal not found" + "Back to goals".
 */
export function useGoal(goalId: string | null): UseGoalReturn {
  const query = useQuery<GoalResponse, ApiError>({
    queryKey: ['inspector-program', 'goal', goalId],
    enabled: Boolean(goalId),
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/inspector-program/goals/{goalId}', {
        params: { path: { goalId: goalId as string } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: GoalResponse }).data;
    },
  });

  return {
    goal: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isNotFound: query.error?.status === 404,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
