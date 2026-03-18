import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type AuditLog, type AuditLogFiltersState } from '../types';

export interface UseAuditLogListReturn {
  data: AuditLog[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AuditLogFiltersState;
  setFilters: (filters: AuditLogFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useAuditLogList(): UseAuditLogListReturn {
  const [filters, setFilters] = useState<AuditLogFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = usePaginatedQuery<AuditLog>(
    ['audit-logs'],
    '/v1/audit-logs',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.startDate ? { startDate: filters.startDate } : {}),
      ...(filters.endDate ? { endDate: filters.endDate } : {}),
    },
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

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
  };

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  };
}
