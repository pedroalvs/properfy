import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type ServiceType, type ServiceTypeFiltersState } from '../types';

export interface UseServiceTypeListReturn {
  data: ServiceType[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceTypeFiltersState;
  setFilters: (filters: ServiceTypeFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useServiceTypeList(): UseServiceTypeListReturn {
  const [filters, setFilters] = useState<ServiceTypeFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = usePaginatedQuery<ServiceType>(
    ['service-types'],
    '/v1/service-types',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
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
