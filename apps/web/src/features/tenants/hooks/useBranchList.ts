import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import type { Branch } from '../types';

export interface UseBranchListReturn {
  data: Branch[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useBranchList(tenantId: string | null): UseBranchListReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Branch>(
    ['tenant-admins', tenantId, 'branches'],
    `/v1/tenants/${tenantId}/branches`,
    params,
    { enabled: !!tenantId },
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

  const sorting: DataTableSorting = {
    sortBy,
    sortOrder,
    onChange: (newSortBy, newSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
  };

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    refetch,
    pagination,
    sorting,
  };
}
