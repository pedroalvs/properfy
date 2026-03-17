import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type TenantContact, type TenantContactFiltersState } from '../types';

export interface UseTenantContactListReturn {
  data: TenantContact[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: TenantContactFiltersState;
  setFilters: (filters: TenantContactFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useTenantContactList(): UseTenantContactListReturn {
  const [filters, setFilters] = useState<TenantContactFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('appointmentDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    confirmationStatus: filters.confirmationStatus || undefined,
    search: filters.search || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<TenantContact>(
    ['tenants'],
    '/v1/tenants',
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
