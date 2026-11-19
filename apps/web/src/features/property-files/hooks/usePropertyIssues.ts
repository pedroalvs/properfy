import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PropertyIssueResponse, ListPropertyIssuesResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';

export interface UsePropertyIssuesParams {
  propertyId?: string;
  appointmentId?: string;
}

export interface UsePropertyIssuesReturn {
  issues: PropertyIssueResponse[];
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Issues (with their photos) for a property or appointment
 * (F10 `GET /v1/property-issues`). Key under `['property-issues', scopeId]` so
 * create/mark-seen/delete invalidations refresh the Issues subtab. Derived array
 * memoised on the raw payload (web §13.11).
 */
export function usePropertyIssues(
  params: UsePropertyIssuesParams,
  options?: { enabled?: boolean },
): UsePropertyIssuesReturn {
  const scopeId = params.appointmentId ?? params.propertyId ?? null;

  const query = useQuery<ListPropertyIssuesResponse, ApiError>({
    queryKey: ['property-issues', scopeId],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/property-issues', {
        params: {
          query: { propertyId: params.propertyId, appointmentId: params.appointmentId },
        },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: ListPropertyIssuesResponse }).data;
    },
    enabled: scopeId != null && (options?.enabled ?? true),
  });

  const issues = useMemo(() => query.data?.issues ?? [], [query.data]);

  return {
    issues,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
