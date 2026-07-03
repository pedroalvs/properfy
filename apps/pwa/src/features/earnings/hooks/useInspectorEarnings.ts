import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiGet } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import type { InspectorEarningsSummaryResponse } from '@properfy/shared';

export interface PayoutEntry {
  id: string;
  entryType: string;
  amount: number;
  currency: string;
  status: string;
  effectiveAt: string;
}

export interface PaginatedPayouts {
  data: PayoutEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * Contract from packages/shared (inspectorEarningsSummaryResponseSchema):
 * all-time approved total, pending next-payment total and a zero-filled
 * last-N-months approved series (month = YYYY-MM, oldest first).
 */
export type InspectorEarningsSummary = InspectorEarningsSummaryResponse;

/**
 * Server-aggregated earnings summary for the Earnings tab (totals + monthly
 * chart series). Cached aggressively — this data changes at payout cadence,
 * not per navigation, so no window-focus refetch.
 */
export function useInspectorEarningsSummary() {
  const { user } = useAuth();
  return useQuery<InspectorEarningsSummary, ApiError>({
    queryKey: ['inspector-earnings-summary', user?.id],
    queryFn: () => apiGet<InspectorEarningsSummary>('/v1/inspector/earnings/summary', { months: '6' }),
    enabled: !!user,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export interface PayoutHistoryFilters {
  fromDate?: string;
  toDate?: string;
}

/**
 * Paginated payout history for the History tab. Date filters are applied
 * server-side; pages are appended via infinite scroll. keepPreviousData avoids
 * a content flash while a new filter window loads.
 */
export function useInspectorPayoutHistory(filters: PayoutHistoryFilters) {
  const { user } = useAuth();
  return useInfiniteQuery<PaginatedPayouts, ApiError>({
    queryKey: ['inspector-payouts', user?.id, filters.fromDate ?? '', filters.toDate ?? ''],
    queryFn: ({ pageParam }) =>
      apiGet<PaginatedPayouts>('/v1/financial/entries', {
        type: 'INSPECTOR_PAYOUT',
        page: String(pageParam),
        pageSize: '20',
        sortBy: 'effectiveAt',
        sortOrder: 'desc',
        ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
        ...(filters.toDate ? { toDate: filters.toDate } : {}),
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    enabled: !!user,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
