import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BillingPeriodType, GoalComparator, GoalMetric, GoalResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface CreateGoalBody {
  title: string;
  metric: GoalMetric;
  comparator?: GoalComparator;
  period: BillingPeriodType;
  scopeRegionId?: string | null;
  scopeServiceTypeId?: string | null;
  scopeInspectorId?: string | null;
  target: number;
  rewardAmount: number;
  startsAt: string;
  endsAt?: string | null;
}

/** Only the mutable fields; `.strict()` on the server rejects anything else. */
export interface UpdateGoalBody {
  title?: string;
  target?: number;
  rewardAmount?: number;
  endsAt?: string | null;
  active?: boolean;
}

export interface UseSaveGoalReturn {
  createGoal: (body: CreateGoalBody) => Promise<GoalResponse>;
  updateGoal: (args: { goalId: string; patch: UpdateGoalBody }) => Promise<GoalResponse>;
  isSaving: boolean;
}

/**
 * Create / update a goal (`POST` / `PATCH /v1/inspector-program/goals`). Both
 * throw an `ApiError` the form maps (422 → top message, 400 `details` → per-field).
 * On success the whole `['inspector-program']` prefix is invalidated (list, single
 * goal, summary, awards).
 */
export function useSaveGoal(): UseSaveGoalReturn {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inspector-program'] });

  const create = useMutation<GoalResponse, ApiError, CreateGoalBody>({
    mutationFn: async (body) => {
      const { data, error, response } = await api.POST('/v1/inspector-program/goals', { body });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: GoalResponse }).data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation<GoalResponse, ApiError, { goalId: string; patch: UpdateGoalBody }>({
    mutationFn: async ({ goalId, patch }) => {
      const { data, error, response } = await api.PATCH('/v1/inspector-program/goals/{goalId}', {
        params: { path: { goalId } },
        body: patch,
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: GoalResponse }).data;
    },
    onSuccess: invalidate,
  });

  return {
    createGoal: create.mutateAsync,
    updateGoal: update.mutateAsync,
    isSaving: create.isPending || update.isPending,
  };
}
