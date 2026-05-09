import { useCallback, useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import type { ContactListItem, ContactFiltersState } from '../types';

const FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  type: { type: 'string' as const, default: '' },
  isActive: { type: 'string' as const, default: 'true' },
} satisfies FilterSchema;

export interface UseContactListReturn {
  data: ContactListItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ContactFiltersState;
  setFilters: (filters: ContactFiltersState) => void;
  pagination: DataTablePagination;
}

export function useContactList(tenantIdOverride?: string): UseContactListReturn {
  const [urlFilters, setFilter] = useUrlFilters(FILTER_SCHEMA);
  const filters = urlFilters as ContactFiltersState;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: ContactFiltersState) => {
    for (const key of Object.keys(FILTER_SCHEMA) as (keyof typeof FILTER_SCHEMA)[]) {
      if (next[key] !== filters[key]) setFilter(key, next[key]);
    }
    setPage(1);
  }, [filters, setFilter]);

  const params: ListParams = {
    page,
    pageSize,
    type: filters.type || undefined,
    tenantId: tenantIdOverride || undefined,
    isActive: filters.isActive === '' ? undefined : filters.isActive,
    search: filters.search || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<ContactListItem>(
    ['contacts'],
    '/v1/contacts',
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
