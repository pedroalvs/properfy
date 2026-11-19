import { useQuery } from '@tanstack/react-query';
import type { PropertyIssueUnseenCountResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError, type ApiError } from '@/lib/api-error';
import { usePermissions } from '@/hooks/usePermissions';

export interface UseUnseenIssueCountReturn {
  appointmentsWithUnseenIssues: number;
  propertiesWithUnseenIssues: number;
}

/**
 * Unseen-issue counts for the sidebar dots (F10 D15/D26). Runs shell-wide, so it
 * is gated to AM/OP/CL_ADMIN (`property_issue.unseen_count`) — CL_USER/INSP never
 * issue the request. `staleTime` 60s keeps it off the hot path; the mark-seen /
 * create / delete mutations invalidate the `['property-issues']` prefix (which
 * covers this key), so the dots clear promptly.
 */
export function useUnseenIssueCount(): UseUnseenIssueCountReturn {
  const { canPerform } = usePermissions();
  const enabled = canPerform('property_issue.unseen_count');

  const query = useQuery<PropertyIssueUnseenCountResponse, ApiError>({
    queryKey: ['property-issues', 'unseen-count'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/property-issues/unseen-count');
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: PropertyIssueUnseenCountResponse }).data;
    },
    enabled,
    staleTime: 60_000,
  });

  return {
    appointmentsWithUnseenIssues: query.data?.appointmentsWithUnseenIssues ?? 0,
    propertiesWithUnseenIssues: query.data?.propertiesWithUnseenIssues ?? 0,
  };
}
