import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { AuditLog } from '@/features/audit-logs';

export interface UseContactTimelineOptions {
  /** When false, the hook does not fire — used by lazy tab activation. */
  enabled?: boolean;
}

export interface UseContactTimelineReturn {
  entries: AuditLog[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  pagination: DataTablePagination;
}

export function useContactTimeline(
  contactId: string | null,
  options: UseContactTimelineOptions = {},
): UseContactTimelineReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const query = usePaginatedQuery<AuditLog>(
    ['audit-logs', 'contact', contactId, page, pageSize],
    '/v1/audit-logs',
    {
      entityType: 'contact',
      entityId: contactId ?? '',
      page,
      pageSize,
    },
    { enabled: !!contactId && options.enabled !== false },
  );

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: query.data?.pagination.total ?? 0,
    onChange: (newPage, newPageSize) => {
      setPage(newPage);
      setPageSize(newPageSize);
    },
  };

  return {
    entries: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    pagination,
  };
}
