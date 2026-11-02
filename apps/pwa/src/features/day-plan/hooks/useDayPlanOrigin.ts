import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DayPlanResponse, InspectorBaseAddress } from '@properfy/shared';
import { apiPut, apiDelete, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { dayPlanKeys } from '../api/day-plan-keys';

type OriginVariant = { type: 'set'; address: InspectorBaseAddress } | { type: 'clear' };

/**
 * Set or clear the day's starting point (`PUT`/`DELETE …/origin`). The server
 * returns the fully recomputed plan, so the response replaces the cached plan
 * wholesale (`setQueryData`) rather than merging. Concurrent submits are
 * coalesced to one request; errors surface the server message with the cache
 * untouched, so the sheet can show it and decide whether to close/invalidate.
 */
export function useDayPlanOrigin(date: string) {
  const queryClient = useQueryClient();
  const { showSuccess } = useSnackbar();
  const inFlight = useRef(false);

  const mutation = useMutation<SuccessResponse<DayPlanResponse>, ApiError, OriginVariant>({
    mutationFn: (variant) =>
      variant.type === 'set'
        ? apiPut<SuccessResponse<DayPlanResponse>>(
            `/v1/inspector/day-plans/${date}/origin`,
            { address: variant.address },
          )
        : apiDelete<SuccessResponse<DayPlanResponse>>(`/v1/inspector/day-plans/${date}/origin`),
    onSuccess: (response, variant) => {
      queryClient.setQueryData(dayPlanKeys.byDate(date), response);
      if (variant.type === 'set') {
        const label = response.data.origin.label ?? 'this address';
        showSuccess(`Route updated. Starting from ${label} for this day.`);
      } else {
        showSuccess('Route updated. Starting from your base address.');
      }
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  /** Resolves `null` on success, or the `ApiError` so the caller can branch on
   * its code (the error is also exposed reactively via `error`). Never rejects. */
  const run = (variant: OriginVariant): Promise<ApiError | null> => {
    if (inFlight.current) return Promise.resolve(null);
    inFlight.current = true;
    return mutation.mutateAsync(variant).then(
      () => null,
      (err: ApiError) => err,
    );
  };

  return {
    setOrigin: (address: InspectorBaseAddress) => run({ type: 'set', address }),
    clearOrigin: () => run({ type: 'clear' }),
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
