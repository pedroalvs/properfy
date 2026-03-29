import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type Inspector, type InspectorFiltersState } from '../types';

export interface UseInspectorListReturn {
  data: Inspector[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: InspectorFiltersState;
  setFilters: (filters: InspectorFiltersState) => void;
  pagination: DataTablePagination;
}

export function useInspectorList(): UseInspectorListReturn {
  const [filters, setFilters] = useState<InspectorFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = usePaginatedQuery<Inspector>(
    ['inspectors'],
    '/v1/inspectors',
    {
      page,
      pageSize,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
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

  const rawData: any[] = query.data?.data ?? [];
  const data: Inspector[] = rawData.map((item) => ({
    ...item,
    regionsCount: Array.isArray(item.regionsJson) ? item.regionsJson.length : 0,
    serviceTypesCount: Array.isArray(item.serviceTypesJson) ? item.serviceTypesJson.length : 0,
  }));

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    filters,
    setFilters,
    pagination,
  };
}
