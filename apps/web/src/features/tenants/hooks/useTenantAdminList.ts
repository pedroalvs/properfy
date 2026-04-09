import { useCallback, useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import type { TenantAdmin, TenantAdminFiltersState } from '../types';

const FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  status: { type: 'string' as const, default: '' },
} satisfies FilterSchema;

export interface UseTenantAdminListReturn {
  data: TenantAdmin[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: TenantAdminFiltersState;
  setFilters: (filters: TenantAdminFiltersState) => void;
  pagination: DataTablePagination;
}

export function useTenantAdminList(): UseTenantAdminListReturn {
  const [urlFilters, setFilter] = useUrlFilters(FILTER_SCHEMA);
  const filters = urlFilters as TenantAdminFiltersState;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: TenantAdminFiltersState) => {
    for (const key of Object.keys(FILTER_SCHEMA) as (keyof typeof FILTER_SCHEMA)[]) {
      if (next[key] !== filters[key]) setFilter(key, next[key]);
    }
    setPage(1);
  }, [filters, setFilter]);

  const params: ListParams = {
    page,
    pageSize,
    status: filters.status || undefined,
    search: filters.search || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<TenantAdmin>(
    ['tenant-admins'],
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
