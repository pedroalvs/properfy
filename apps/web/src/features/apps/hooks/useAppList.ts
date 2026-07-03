import { useCallback, useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import type { AppCredentialRow, AppFiltersState } from '../types';

const URL_FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  isActive: { type: 'string' as const, default: 'true' },
} satisfies FilterSchema;

export interface UseAppListReturn {
  data: AppCredentialRow[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AppFiltersState;
  setFilters: (filters: AppFiltersState) => void;
  pagination: DataTablePagination;
}

/**
 * Lists app credentials and threads filters to `/v1/app-credentials`. The
 * agency selector lives on the page (it's a scope filter, not a gate — the
 * list shows every agency's apps by default for AM/OP).
 */
export function useAppList(tenantIdOverride?: string, branchIdOverride?: string): UseAppListReturn {
  const [urlFilters, setFilter] = useUrlFilters(URL_FILTER_SCHEMA);

  const filters: AppFiltersState = {
    search: (urlFilters.search as string) ?? '',
    isActive: (urlFilters.isActive as string) ?? 'true',
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: AppFiltersState) => {
    if (next.search !== filters.search) setFilter('search', next.search);
    if (next.isActive !== filters.isActive) setFilter('isActive', next.isActive);
    setPage(1);
  }, [filters.search, filters.isActive, setFilter]);

  const params: ListParams = {
    page,
    pageSize,
    tenantId: tenantIdOverride || undefined,
    branchId: branchIdOverride || undefined,
    isActive: filters.isActive === '' ? undefined : filters.isActive,
    search: filters.search || undefined,
  } as ListParams;

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<AppCredentialRow>(
    ['app-credentials'],
    '/v1/app-credentials',
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
