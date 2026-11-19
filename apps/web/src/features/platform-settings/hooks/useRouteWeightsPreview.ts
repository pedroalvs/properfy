import { useMutation } from '@tanstack/react-query';
import type { RouteWeightsPreviewResponse, RouteWeightsSetting } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface RouteWeightsPreviewInput {
  inspectorId: string;
  /** Civil date `YYYY-MM-DD` in the user's effective timezone. */
  date: string;
  /** The weights from the form (saved or not) — sent as `proposed`. */
  weights: RouteWeightsSetting;
}

export interface UseRouteWeightsPreviewReturn {
  preview: (input: RouteWeightsPreviewInput) => Promise<RouteWeightsPreviewResponse>;
  data: RouteWeightsPreviewResponse | undefined;
  isLoading: boolean;
  error: ApiError | null;
  reset: () => void;
}

/**
 * AM/OP what-if on the route weights: `POST /v1/day-plans/preview` with the
 * form's weights. The backend returns `{ current, proposed }` — `current` from
 * the saved `routeWeights`, `proposed` from the request body. Nothing is
 * persisted. Surfaces the `ApiError` so the consumer can distinguish `429`
 * (rate limit) and `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE`.
 */
export function useRouteWeightsPreview(): UseRouteWeightsPreviewReturn {
  const mutation = useMutation<RouteWeightsPreviewResponse, ApiError, RouteWeightsPreviewInput>({
    mutationFn: async ({ inspectorId, date, weights }) => {
      const { data, error, response } = await api.POST('/v1/day-plans/preview', {
        body: { inspectorId, date, weights },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: RouteWeightsPreviewResponse }).data;
    },
  });

  return {
    preview: mutation.mutateAsync,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}
