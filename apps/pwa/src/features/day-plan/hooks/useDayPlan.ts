import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DayPlanResponse } from '@properfy/shared';
import { apiGet, type SuccessResponse } from '@/hooks/useApiQuery';
import { ApiError, isNetworkError } from '@/lib/api-error';
import { dayPlanKeys } from '../api/day-plan-keys';

export type DayPlanState =
  | 'LOADING'
  | 'OK'
  | 'STALE'
  | 'NOT_PUBLISHED'
  | 'NOT_FOUND'
  | 'ERROR';

export interface DayPlanQueryResult {
  data: DayPlanResponse | undefined;
  state: DayPlanState;
  isOffline: boolean;
  isLoading: boolean;
  refetch: () => void;
}

const STALE_REFETCH_DELAY_MS = 2000;

/** The server already returns the recalculated plan to the inspector, so a 404
 * means "not published yet" (tomorrow/past) or "no plan"; the PWA never resolves
 * STALE itself — it nudges one refetch per version to catch the brief server
 * race, then holds. Network failures keep the last good plan (offline). */
export function useDayPlan(date: string, options: { enabled?: boolean } = {}): DayPlanQueryResult {
  const enabled = options.enabled ?? true;

  const query = useQuery<SuccessResponse<DayPlanResponse>, ApiError>({
    queryKey: dayPlanKeys.byDate(date),
    queryFn: () => apiGet<SuccessResponse<DayPlanResponse>>(`/v1/inspector/day-plans/${date}`),
    enabled,
  });

  const data = query.data?.data;

  // One automatic refetch per plan version while the server reports STALE.
  const refetchedVersions = useRef<Set<number>>(new Set());
  const refetch = query.refetch;
  useEffect(() => {
    if (!data || data.status !== 'STALE') return;
    const version = data.version;
    if (refetchedVersions.current.has(version)) return;
    refetchedVersions.current.add(version);
    const timer = setTimeout(() => {
      void refetch();
    }, STALE_REFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, refetch]);

  const error = (query.error ?? query.failureReason) as ApiError | null;
  const isOffline = isNetworkError(error);

  let state: DayPlanState;
  if (data) {
    state = data.status === 'STALE' ? 'STALE' : 'OK';
  } else if (query.isLoading) {
    state = 'LOADING';
  } else if (error instanceof ApiError && error.status === 404) {
    state = error.code === 'DAY_PLAN_NOT_FOUND' ? 'NOT_FOUND' : 'NOT_PUBLISHED';
  } else {
    state = 'ERROR';
  }

  return {
    data,
    state,
    isOffline,
    isLoading: query.isLoading,
    refetch: () => {
      void refetch();
    },
  };
}
