import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListPropertyIssuesResponse, PropertyIssueResponse } from '@properfy/shared';
import { apiGet, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { sortIssuesNewestFirst } from '../lib/property-file-view';

export const propertyIssuesKey = (appointmentId: string) =>
  ['inspector', 'property-issues', appointmentId] as const;

/**
 * Read-only list of every issue on an appointment (inspector, staff and
 * rental-tenant-portal origins; `appointmentId` is mandatory server-side, D28).
 * The author is masked server-side for the inspector. Issues are memoized,
 * newest-first.
 */
export function usePropertyIssues(appointmentId: string) {
  const query = useQuery<SuccessResponse<ListPropertyIssuesResponse>, ApiError>({
    queryKey: propertyIssuesKey(appointmentId),
    queryFn: () =>
      apiGet<SuccessResponse<ListPropertyIssuesResponse>>('/v1/property-issues', { appointmentId }),
    staleTime: 30_000,
  });

  const raw = query.data?.data;
  const issues = useMemo<PropertyIssueResponse[]>(
    () => sortIssuesNewestFirst(raw?.issues ?? []),
    [raw],
  );

  return { ...query, issues };
}
