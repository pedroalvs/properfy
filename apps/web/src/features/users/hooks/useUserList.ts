import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_FILTERS, type User, type UserFiltersState, type UserScope } from '../types';

export interface UseUserListReturn {
  data: User[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: UserFiltersState;
  setFilters: (filters: UserFiltersState) => void;
  pagination: DataTablePagination;
}

export function useUserList(overrideTenantId?: string, scope: UserScope = 'tenant'): UseUserListReturn {
  const { user: authUser } = useAuth();
  const tenantId = scope === 'tenant' ? (overrideTenantId ?? authUser?.tenantId) : null;

  const [filters, setFilters] = useState<UserFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Changing the audience (scope, or the selected agency within tenant scope)
  // must not carry the previous view's filters or page — an internal list
  // inheriting a CL_* role filter, or a stale page on a smaller agency, would
  // silently render empty. Reset during render (React's "adjust state on prop
  // change" pattern) rather than in an effect, so the query never subscribes
  // once with the new endpoint and the old filters/page.
  const resetKey = `${scope}:${tenantId ?? ''}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }
  const query = usePaginatedQuery<User>(
    ['users', scope, tenantId],
    scope === 'internal' ? '/v1/users' : `/v1/tenants/${tenantId}/users`,
    {
      page,
      pageSize,
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    },
    { enabled: scope === 'internal' || !!tenantId },
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
