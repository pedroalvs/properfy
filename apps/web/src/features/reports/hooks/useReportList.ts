import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReportStatus } from '@properfy/shared';
import { usePaginatedQuery, type ListParams, type PaginatedResponse } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Report, type ReportFiltersState } from '../types';

const REPORT_POLL_INTERVAL_MS = 3000;
const ACTIVE_REPORT_STATUSES = new Set<ReportStatus>(['PENDING', 'PROCESSING']);

export interface UseReportListReturn {
  data: Report[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ReportFiltersState;
  setFilters: (filters: ReportFiltersState) => void;
  pagination: DataTablePagination;
}

export function useReportList(): UseReportListReturn {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<ReportFiltersState>({
    ...DEFAULT_FILTERS,
    reportType: searchParams.get('reportType') ?? '',
    status: searchParams.get('status') ?? '',
    fromDate: searchParams.get('fromDate') ?? '',
    toDate: searchParams.get('toDate') ?? '',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params: ListParams = {
    page,
    pageSize,
    reportType: filters.reportType || undefined,
    status: filters.status || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Report>(
    ['reports'],
    '/v1/reports',
    params,
    {
      refetchInterval: (query) => {
        const reports = (query.state.data as PaginatedResponse<Report> | undefined)?.data ?? [];
        return reports.some((report) => ACTIVE_REPORT_STATUSES.has(report.status))
          ? REPORT_POLL_INTERVAL_MS
          : false;
      },
    },
  );

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: response?.pagination.total ?? 0,
    onChange: (newPage, newPageSize) => {
      setPage(newPage);
      setPageSize(newPageSize);
    },
  };

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    errorMessage: null,
    refetch,
    filters,
    setFilters,
    pagination,
  };
}
