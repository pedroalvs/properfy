import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/hooks/useApiQuery';
import { toLocalISODate } from '../lib/time-slot';

interface HistoryItem {
  id: string;
  appointmentCode: string;
  status: string;
  scheduledDate: string;
  timeSlot: string;
  serviceTypeId: string;
  propertyId: string;
  tenantConfirmationStatus: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  executionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  agencyName?: string | null;
}

interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface RawPaginatedResponse {
  data: HistoryItem[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
}

function buildDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 24);
  return {
    from: toLocalISODate(from),
    to: toLocalISODate(to),
  };
}

export function useScheduleHistory(page = 1, pageSize = 50) {
  const { from, to } = buildDateRange();
  return useQuery<RawPaginatedResponse, Error, HistoryResponse>({
    queryKey: ['inspector', 'schedule', 'history', { from, to, page, pageSize }],
    queryFn: () =>
      apiGet<RawPaginatedResponse>('/v1/inspector/schedule', {
        from,
        to,
        status: 'DONE',
        page: String(page),
        pageSize: String(pageSize),
      }),
    select: (raw) => ({
      items: raw.data,
      total: raw.pagination.total,
      page: raw.pagination.page,
      pageSize: raw.pagination.pageSize,
    }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
