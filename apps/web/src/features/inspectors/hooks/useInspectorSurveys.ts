import { useMemo } from 'react';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { InspectorSurvey } from '../types';

/**
 * Individual satisfaction responses for one inspector.
 *
 * `enabled` exists so the drawer's Ratings tab only issues the request once it
 * is opened — same pattern as the availability tab.
 */
export function useInspectorSurveys(inspectorId: string | null, page: number, enabled: boolean) {
  const query = usePaginatedQuery<Record<string, unknown>>(
    ['inspectors', inspectorId, 'surveys'],
    `/v1/inspectors/${inspectorId}/surveys`,
    { page, pageSize: 10 },
    { enabled: !!inspectorId && enabled },
  );

  // PR #961 bug class: memoized so consumers get a stable array per fetch result.
  const surveys: InspectorSurvey[] = useMemo(() => {
    const raw: any[] = query.data?.data ?? [];
    return raw.map((item) => ({
      rating: item.rating,
      comment: item.comment ?? null,
      submittedAt: item.submittedAt,
      appointmentCode: item.appointmentCode,
    }));
  }, [query.data?.data]);

  return {
    surveys,
    total: query.data?.pagination?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
