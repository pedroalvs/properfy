import { useMemo } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import type { ServiceTypeFlowType } from '@properfy/shared';
import { toLocalISODate } from '../lib/time-slot';

export type HistoryPeriod = '30d' | '90d' | '12m' | '24m';

export interface HistoryItem {
  id: string;
  appointmentCode: string;
  status: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  serviceTypeId: string;
  propertyId: string;
  rentalTenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  agencyName?: string | null;
  propertyAddress: string;
  suburb: string;
  serviceTypeName: string;
  flowType: ServiceTypeFlowType;
}

interface RawPaginatedResponse {
  data: HistoryItem[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

function buildDateRange(period: HistoryPeriod): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  switch (period) {
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case '12m':
      from.setMonth(from.getMonth() - 12);
      break;
    case '24m':
      from.setMonth(from.getMonth() - 24);
      break;
  }
  return {
    from: toLocalISODate(from),
    to: toLocalISODate(to),
  };
}

const PAGE_SIZE = 50;

/**
 * Paginated DONE-appointment history for the Schedule History tab.
 * Pages are appended via infinite scroll; the period narrows the server-side
 * date range. keepPreviousData avoids a content flash on period change.
 */
export function useScheduleHistory(period: HistoryPeriod = '24m') {
  const { from, to } = buildDateRange(period);
  const query = useInfiniteQuery<RawPaginatedResponse, Error>({
    queryKey: ['inspector', 'schedule', 'history', { from, to }],
    queryFn: ({ pageParam }) =>
      apiGet<RawPaginatedResponse>('/v1/inspector/schedule', {
        from,
        to,
        status: 'DONE',
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
    total: query.data?.pages[0]?.pagination.total ?? 0,
  };
}
