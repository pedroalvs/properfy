import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ListPropertyFilesResponse } from '@properfy/shared';
import { apiGet, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { groupNonIssueFiles, type GroupedFiles } from '../lib/property-file-view';

export const propertyFilesKey = (appointmentId: string) =>
  ['inspector', 'property-files', appointmentId] as const;

/**
 * Read-only list of the Document/Report/Other files on an appointment (the
 * inspector path — `appointmentId` is mandatory server-side, D28). Online-only:
 * the response is not cached in the service worker, so offline the consumer shows
 * a "connect to load" state rather than stale data. Derived groups are memoized
 * on the raw payload (PWA §11.11).
 */
export function usePropertyFiles(appointmentId: string) {
  const query = useQuery<SuccessResponse<ListPropertyFilesResponse>, ApiError>({
    queryKey: propertyFilesKey(appointmentId),
    queryFn: () =>
      apiGet<SuccessResponse<ListPropertyFilesResponse>>('/v1/property-files', { appointmentId }),
    staleTime: 30_000,
  });

  const raw = query.data?.data;
  const grouped = useMemo<GroupedFiles>(() => groupNonIssueFiles(raw?.files ?? []), [raw]);

  return { ...query, grouped };
}
