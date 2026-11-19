import { useQuery } from '@tanstack/react-query';
import type { InspectorReliabilityResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UseInspectorReliabilityReturn {
  inspector: InspectorReliabilityResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  /** 400 (bad id) or 404 (unknown/soft-deleted) → the drawer shows "We couldn't find this inspector." */
  isNotFound: boolean;
  refetch: () => void;
}

/**
 * One inspector's reliability detail for the drawer. Enabled only when an
 * `inspectorId` is set (the drawer is deep-linked by `?inspector=`). A 400/404
 * is surfaced as `isNotFound` so the drawer can show a distinct message.
 */
export function useInspectorReliability(inspectorId: string | null): UseInspectorReliabilityReturn {
  const enabled = Boolean(inspectorId);

  const query = useQuery<InspectorReliabilityResponse, ApiError>({
    queryKey: ['reliability', 'inspector', inspectorId],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/dashboard/inspector-performance/{inspectorId}', {
        params: { path: { inspectorId: inspectorId as string } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: InspectorReliabilityResponse }).data;
    },
  });

  const error = query.error ?? null;
  return {
    inspector: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error,
    isNotFound: error?.status === 400 || error?.status === 404,
    refetch: query.refetch,
  };
}
