import { useCallback, useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import type { Property, PropertyFiltersState } from '../types';

const FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  type: { type: 'string' as const, default: '' },
  branchId: { type: 'string' as const, default: '' },
} satisfies FilterSchema;

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
  const [urlFilters, setFilter] = useUrlFilters(FILTER_SCHEMA);
  const filters = urlFilters as PropertyFiltersState;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: PropertyFiltersState) => {
    for (const key of Object.keys(FILTER_SCHEMA) as (keyof typeof FILTER_SCHEMA)[]) {
      if (next[key] !== filters[key]) setFilter(key, next[key]);
    }
    setPage(1);
  }, [filters, setFilter]);

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
