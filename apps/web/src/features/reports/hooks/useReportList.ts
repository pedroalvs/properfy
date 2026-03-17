import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Report, type ReportFiltersState } from '../types';

export interface UseReportListReturn {
  data: Report[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ReportFiltersState;
  setFilters: (filters: ReportFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useReportList(): UseReportListReturn {
  const [filters, setFilters] = useState<ReportFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    reportType: filters.reportType || undefined,
    status: filters.status || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Report>(
    ['reports'],
    '/v1/reports',
    params,
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

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
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
    sorting,
  };
}
