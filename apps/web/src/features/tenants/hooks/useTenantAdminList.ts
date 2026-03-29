import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { DEFAULT_TENANT_ADMIN_FILTERS, type TenantAdmin, type TenantAdminFiltersState } from '../types';

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
  const [filters, setFilters] = useState<TenantAdminFiltersState>(DEFAULT_TENANT_ADMIN_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
