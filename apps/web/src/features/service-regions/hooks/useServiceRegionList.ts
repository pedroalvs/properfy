import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type ServiceRegion, type ServiceRegionFiltersState } from '../types';

export interface UseServiceRegionListReturn {
  data: ServiceRegion[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceRegionFiltersState;
  setFilters: (filters: ServiceRegionFiltersState) => void;
  pagination: DataTablePagination;
}

export function useServiceRegionList(): UseServiceRegionListReturn {
  const [filters, setFilters] = useState<ServiceRegionFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = usePaginatedQuery<ServiceRegion>(
    ['service-regions'],
    '/v1/service-regions',
    {
      page,
      pageSize,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.state ? { state: filters.state } : {}),
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
