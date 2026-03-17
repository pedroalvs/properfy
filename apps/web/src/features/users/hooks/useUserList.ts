import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_FILTERS, type User, type UserFiltersState } from '../types';

export interface UseUserListReturn {
  data: User[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: UserFiltersState;
  setFilters: (filters: UserFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useUserList(): UseUserListReturn {
  const { user: authUser } = useAuth();
  const tenantId = authUser?.tenantId;

  const [filters, setFilters] = useState<UserFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const query = usePaginatedQuery<User>(
    ['users', tenantId],
    `/v1/tenants/${tenantId}/users`,
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    },
    { enabled: !!tenantId },
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

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
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
    sorting,
  };
}
