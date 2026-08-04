import { useEffect, useMemo, useRef } from 'react';
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
  const pageSurveys: InspectorSurvey[] = useMemo(() => {
    const raw: any[] = query.data?.data ?? [];
    return raw.map((item) => ({
      rating: item.rating,
      comment: item.comment ?? null,
      submittedAt: item.submittedAt,
      appointmentCode: item.appointmentCode,
    }));
  }, [query.data?.data]);

  /**
   * "Load more" appends; it does not page.
   *
   * The query key changes with `page`, so each fetch returns only that page.
   * Without accumulating, clicking Load more would replace the visible list with
   * page 2 — which reads to the operator as the earlier responses vanishing.
   *
   * Kept in a ref rather than state so accumulating never triggers a second
   * render pass, and reset whenever the inspector changes so one inspector's
   * responses can never bleed into another's list.
   */
  const accumulated = useRef<{ inspectorId: string | null; byPage: Map<number, InspectorSurvey[]> }>({
    inspectorId,
    byPage: new Map(),
  });

  if (accumulated.current.inspectorId !== inspectorId) {
    accumulated.current = { inspectorId, byPage: new Map() };
  }
  if (query.data?.data) {
    accumulated.current.byPage.set(page, pageSurveys);
  }

  const surveys = useMemo(
    () =>
      [...accumulated.current.byPage.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([, rows]) => rows),
    // Recomputed whenever a page lands or the inspector changes; the ref itself
    // is stable, so these are the only inputs that can alter the result.
    [pageSurveys, inspectorId, page],
  );

  // Dropping back to the first page (drawer reopened) discards the tail so a
  // stale page 2 cannot linger under a fresh page 1.
  useEffect(() => {
    if (page === 1) {
      for (const key of [...accumulated.current.byPage.keys()]) {
        if (key !== 1) accumulated.current.byPage.delete(key);
      }
    }
  }, [page]);

  return {
    surveys,
    total: query.data?.pagination?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
