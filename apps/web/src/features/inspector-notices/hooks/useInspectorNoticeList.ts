import { useState, useCallback } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { InspectorNoticeSummary, InspectorNoticeStatusFilter } from '../types';

export interface UseInspectorNoticeListReturn {
  data: InspectorNoticeSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  status: InspectorNoticeStatusFilter;
  setStatus: (status: InspectorNoticeStatusFilter) => void;
  pagination: DataTablePagination;
}

const DEFAULT_PAGE_SIZE = 20;

export function useInspectorNoticeList(): UseInspectorNoticeListReturn {
  const [status, setStatusState] = useState<InspectorNoticeStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Changing the status filter must return to page 1 so the new result set is
  // requested from the start (#612 pattern).
  const setStatus = useCallback((next: InspectorNoticeStatusFilter) => {
    setStatusState(next);
    setPage(1);
  }, []);

  const query = usePaginatedQuery<InspectorNoticeSummary>(
    ['inspector-notices'],
    '/v1/inspector-notices',
    { page, pageSize, status },
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
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    status,
    setStatus,
    pagination,
  };
}
