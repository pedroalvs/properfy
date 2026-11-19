import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DayPlanResponse } from '@properfy/shared';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import { getErrorMessage, type ApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { dayPlanKeys } from '../api/day-plan-keys';

/**
 * Reset a saved manual order back to the suggested one (`POST …/recalculate`).
 * The response replaces the cache; on error the server message is surfaced and
 * the plan re-fetched. Never throws. Local (unsaved) resets do not use this —
 * they realign the draft with no API call.
 */
export function useResetDayPlanOrder(date: string) {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const inFlight = useRef(false);

  const mutation = useMutation<SuccessResponse<DayPlanResponse>, ApiError, void>({
    mutationFn: () => apiPost<SuccessResponse<DayPlanResponse>>(`/v1/inspector/day-plans/${date}/recalculate`),
    onSuccess: (response) => {
      queryClient.setQueryData(dayPlanKeys.byDate(date), response);
      showSuccess('Route reset to the suggested order.');
    },
  });

  const reset = async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      await mutation.mutateAsync();
      return true;
    } catch (error) {
      showError(getErrorMessage(error));
      void queryClient.invalidateQueries({ queryKey: dayPlanKeys.byDate(date) });
      return false;
    } finally {
      inFlight.current = false;
    }
  };

  return { reset, isPending: mutation.isPending };
}
