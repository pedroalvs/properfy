import { useMemo } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import type { ServiceTypeFlowType } from '@properfy/shared';
import { PLATFORM_TIMEZONE, todayInTzDateString } from '@properfy/shared';

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
  // Range is anchored to the Sydney civil day, independent of the device timezone.
  const today = todayInTzDateString(PLATFORM_TIMEZONE);
  const from = new Date(`${today}T00:00:00.000Z`);
  switch (period) {
    case '30d':
      from.setUTCDate(from.getUTCDate() - 30);
      break;
    case '90d':
      from.setUTCDate(from.getUTCDate() - 90);
      break;
    case '12m':
      from.setUTCMonth(from.getUTCMonth() - 12);
      break;
    case '24m':
      from.setUTCMonth(from.getUTCMonth() - 24);
      break;
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: today,
  };
}

const PAGE_SIZE = 50;

/**
 * Paginated DONE-appointment history for the Schedule History tab.
 * Pages are appended via infinite scroll; the period narrows the server-side
 * date range. keepPreviousData avoids a content flash on period change.
 * Pass enabled=false while the History tab is not active to avoid fetching
 * two years of history on page mount.
 */
export function useScheduleHistory(period: HistoryPeriod = '24m', enabled = true) {
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
    enabled,
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
