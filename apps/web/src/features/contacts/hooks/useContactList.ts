import { useCallback, useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import { DEFAULT_FILTERS, type ContactListItem, type ContactFiltersState } from '../types';

const URL_FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  isActive: { type: 'string' as const, default: 'true' },
  primary: { type: 'string' as const, default: '' },
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

/**
 * Lists contacts and threads filters to `/v1/contacts`. Multiselect filters
 * (`type`, `branchIds`) are kept in local state — they are not surfaced in the
 * URL (the URL would balloon with arrays); scalar filters survive page reloads
 * via `useUrlFilters`.
 *
 * 023 §FR-204/205: backend `branchIds` and `primary` are passed as repeated
 * query params (`?branchIds=X&branchIds=Y&primary=true`). `openapi-fetch`
 * serialises array fields automatically when the schema declares them.
 */
export function useContactList(tenantIdOverride?: string): UseContactListReturn {
  const [urlFilters, setFilter] = useUrlFilters(URL_FILTER_SCHEMA);
  const [arrayFilters, setArrayFilters] = useState<{ type: string[]; branchIds: string[] }>({
    type: DEFAULT_FILTERS.type,
    branchIds: DEFAULT_FILTERS.branchIds,
  });

  const filters: ContactFiltersState = {
    search: (urlFilters.search as string) ?? '',
    isActive: (urlFilters.isActive as string) ?? 'true',
    primary: ((urlFilters.primary as string) ?? '') as ContactFiltersState['primary'],
    type: arrayFilters.type,
    branchIds: arrayFilters.branchIds,
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: ContactFiltersState) => {
    if (next.search !== filters.search) setFilter('search', next.search);
    if (next.isActive !== filters.isActive) setFilter('isActive', next.isActive);
    if (next.primary !== filters.primary) setFilter('primary', next.primary);
    setArrayFilters({ type: next.type, branchIds: next.branchIds });
    setPage(1);
  }, [filters.search, filters.isActive, filters.primary, setFilter]);

  const params: ListParams = {
    page,
    pageSize,
    tenantId: tenantIdOverride || undefined,
    isActive: filters.isActive === '' ? undefined : filters.isActive,
    search: filters.search || undefined,
    ...(filters.type.length > 0 ? { type: filters.type } : {}),
    ...(filters.branchIds.length > 0 ? { branchIds: filters.branchIds } : {}),
    ...(filters.primary === 'YES'
      ? { primary: 'true' }
      : filters.primary === 'NO'
        ? { primary: 'false' }
        : {}),
  } as ListParams;

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
