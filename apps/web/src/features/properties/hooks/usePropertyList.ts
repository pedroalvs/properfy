import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Property, type PropertyFiltersState } from '../types';

export interface UsePropertyListReturn {
  data: Property[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: PropertyFiltersState;
  setFilters: (filters: PropertyFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function usePropertyList(): UsePropertyListReturn {
  const [filters, setFilters] = useState<PropertyFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('propertyCode');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    type: filters.type || undefined,
    branchId: filters.branchId || undefined,
    search: filters.search || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Property>(
    ['properties'],
    '/v1/properties',
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
