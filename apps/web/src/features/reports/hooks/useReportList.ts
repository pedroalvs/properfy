import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Report, type ReportFiltersState } from '../types';
import { MOCK_REPORTS } from '../mocks/reports';

function filterReports(
  data: Report[],
  filters: ReportFiltersState,
): Report[] {
  return data.filter((report) => {
    if (filters.reportType && report.reportType !== filters.reportType) return false;
    if (filters.status && report.status !== filters.status) return false;
    return true;
  });
}

function sortReports(
  data: Report[],
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Report[] {
  return [...data].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
    const cmp = aVal.localeCompare(bVal);
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const simulateLoad = useCallback(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return simulateLoad();
  }, [simulateLoad]);

  const filtered = useMemo(
    () => filterReports(MOCK_REPORTS, filters),
    [filters],
  );

  const sorted = useMemo(
    () => sortReports(filtered, sortBy, sortOrder),
    [filtered, sortBy, sortOrder],
  );

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const pagination: DataTablePagination = {
    page,
    pageSize,
    total: filtered.length,
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

  const refetch = useCallback(() => {
    simulateLoad();
  }, [simulateLoad]);

  return {
    data: isLoading ? [] : paginatedData,
    isLoading,
    isError: false,
    errorMessage: null,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  };
}
