import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiGet } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import type { InspectorProgramResponse } from '@properfy/shared';

/**
 * The inspector's own program (GET /v1/inspector/program): active goals, standing,
 * reward history and the anonymous ranking. Cached for a minute — the data changes
 * at the daily-job cadence, not per navigation.
 */
export function useInspectorProgram() {
  const { user } = useAuth();
  return useQuery<InspectorProgramResponse, ApiError>({
    queryKey: ['inspector-program', user?.id],
    queryFn: () => apiGet<InspectorProgramResponse>('/v1/inspector/program'),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
