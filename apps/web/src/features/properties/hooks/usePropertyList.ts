import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
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
}

export function usePropertyList(tenantId?: string): UsePropertyListReturn {
  const [filters, setFilters] = useState<PropertyFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params: ListParams = {
    page,
    pageSize,
    type: filters.type || undefined,
    tenantId: tenantId || undefined,
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
