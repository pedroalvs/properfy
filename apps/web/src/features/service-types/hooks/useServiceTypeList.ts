import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
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
}

export function useServiceTypeList(): UseServiceTypeListReturn {
  const [filters, setFilters] = useState<ServiceTypeFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = usePaginatedQuery<ServiceType>(
    ['service-types'],
    '/v1/service-types',
    {
      page,
      pageSize,
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

  return {
    data: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    filters,
    setFilters,
    pagination,
  };
}
