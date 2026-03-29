import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import { formatAddressLabel } from '@/lib/address';
import type { DataTablePagination } from '@/components/data/DataTable';
import type { Branch } from '../types';

export interface UseBranchListReturn {
  data: Branch[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  pagination: DataTablePagination;
}

export function useBranchList(tenantId: string | null): UseBranchListReturn {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params: ListParams = {
    page,
    pageSize,
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

  return {
    data: (response?.data ?? []).map((branch: Branch) => ({
      ...branch,
      address: formatAddressLabel((branch as Branch).addressJson) ?? null,
    })),
    isLoading,
    isError,
    refetch,
    pagination,
  };
}
