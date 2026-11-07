import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InspectorAlertThresholdsResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

/** The strict PUT body: each field is an integer 5–240, or null to use the platform default. */
export interface InspectorAlertThresholdsInput {
  delayMinutes: number | null;
  notStartedMinutes: number | null;
}

export interface UseInspectorAlertThresholdsReturn {
  data: InspectorAlertThresholdsResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
  /** Persist the override. Resolves on success; rejects with an ApiError. */
  save: (body: InspectorAlertThresholdsInput) => Promise<InspectorAlertThresholdsResponse>;
  isSaving: boolean;
}

/**
 * Read/write one inspector's Live Day alert thresholds
 * (`GET`/`PUT /v1/inspectors/:id/alert-thresholds`, AM/OP only). The GET is gated
 * by `enabled` (false for CL roles — the section must make no request and raise no
 * 403 noise) and by a non-null id. A successful `PUT` invalidates this query and
 * the `['live-day']` query so the next Live Day poll uses the new limit at once.
 */
export function useInspectorAlertThresholds(
  inspectorId: string | null,
  options: { enabled?: boolean } = {},
): UseInspectorAlertThresholdsReturn {
  const queryClient = useQueryClient();
  const enabled = (options.enabled ?? true) && !!inspectorId;

  const query = useQuery<InspectorAlertThresholdsResponse, ApiError>({
    queryKey: ['inspector-alert-thresholds', inspectorId],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/inspectors/{inspectorId}/alert-thresholds', {
        params: { path: { inspectorId: inspectorId as string } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: InspectorAlertThresholdsResponse }).data;
    },
  });

  const mutation = useMutation<InspectorAlertThresholdsResponse, ApiError, InspectorAlertThresholdsInput>({
    mutationFn: async (body) => {
      const { data, error, response } = await api.PUT('/v1/inspectors/{inspectorId}/alert-thresholds', {
        params: { path: { inspectorId: inspectorId as string } },
        body,
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: InspectorAlertThresholdsResponse }).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspector-alert-thresholds', inspectorId] });
      // The Live Day recomputes alerts from the stored override, so the next poll reflects it.
      queryClient.invalidateQueries({ queryKey: ['live-day'] });
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
