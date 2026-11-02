import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatInstantTime, type DayPlanResponse } from '@properfy/shared';
import { apiPut, type SuccessResponse } from '@/hooks/useApiQuery';
import { isNetworkError, type ApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { dayPlanKeys } from '../api/day-plan-keys';

/** The outcome the save bar branches on. */
export type SaveOrderResult =
  | { status: 'SAVED' }
  /** 409 version conflict / STALE — reload and ask the inspector to review. */
  | { status: 'CONFLICT' }
  /** 422 the reorderable set changed — reload and retry. */
  | { status: 'MISMATCH' }
  /** 422 the date is in the past — the screen becomes read-only. */
  | { status: 'PAST' }
  /** 429 too many changes. */
  | { status: 'RATE_LIMIT' }
  /** Network or any other error — keep the draft, let the inspector retry. */
  | { status: 'NETWORK' };

function classify(error: ApiError): Exclude<SaveOrderResult, { status: 'SAVED' }>['status'] {
  if (isNetworkError(error)) return 'NETWORK';
  if (error.status === 429) return 'RATE_LIMIT';
  switch (error.code) {
    case 'DAY_PLAN_VERSION_CONFLICT':
    case 'DAY_PLAN_STALE':
      return 'CONFLICT';
    case 'DAY_PLAN_ORDER_MISMATCH':
      return 'MISMATCH';
    case 'DAY_PLAN_DATE_IN_PAST':
      return 'PAST';
    default:
      return 'NETWORK';
  }
}

interface SaveVariables {
  appointmentIds: string[];
  basedOnVersion: number;
}

/**
 * Save a reordered day plan (`PUT …/order`). On success the response replaces
 * the cache (final Directions ETAs) with a confirmation snackbar; on a conflict,
 * mismatch or past-date the plan is re-fetched so the inspector sees the fresh
 * one. No `Idempotency-Key` — the server treats a same-order replay. The caller
 * clears / keeps the draft based on the returned status; this hook never throws.
 */
export function useSaveDayPlanOrder(date: string) {
  const queryClient = useQueryClient();
  const { showSuccess } = useSnackbar();
  const inFlight = useRef(false);

  const mutation = useMutation<SuccessResponse<DayPlanResponse>, ApiError, SaveVariables>({
    mutationFn: ({ appointmentIds, basedOnVersion }) =>
      apiPut<SuccessResponse<DayPlanResponse>>(`/v1/inspector/day-plans/${date}/order`, {
        appointmentIds,
        basedOnVersion,
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(dayPlanKeys.byDate(date), response);
      const plan = response.data;
      const finish = plan.finishEta ? formatInstantTime(plan.finishEta, plan.timezone) : '';
      const lateCount = plan.violations.length;
      if (lateCount > 0) {
        showSuccess(
          `Route saved. ${lateCount} ${lateCount === 1 ? 'stop arrives' : 'stops arrive'} after ${
            lateCount === 1 ? 'its' : 'their'
          } window.`,
        );
      } else {
        showSuccess(finish ? `Route saved. Finish ${finish}.` : 'Route saved.');
      }
    },
  });

  const save = async (variables: SaveVariables): Promise<SaveOrderResult> => {
    if (inFlight.current) return { status: 'NETWORK' };
    inFlight.current = true;
    try {
      await mutation.mutateAsync(variables);
      return { status: 'SAVED' };
    } catch (error) {
      const status = classify(error as ApiError);
      if (status === 'CONFLICT' || status === 'MISMATCH' || status === 'PAST') {
        void queryClient.invalidateQueries({ queryKey: dayPlanKeys.byDate(date) });
      }
      return { status };
    } finally {
      inFlight.current = false;
    }
  };

  return { save, isPending: mutation.isPending };
}
