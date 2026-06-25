import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type FinancialEntry, type FinancialFiltersState } from '../types';

export interface UseFinancialListReturn {
  data: FinancialEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: FinancialFiltersState;
  setFilters: (filters: FinancialFiltersState) => void;
  pagination: DataTablePagination;
}

export function useFinancialList(tenantId?: string, enabled: boolean = true): UseFinancialListReturn {
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<FinancialFiltersState>({
    ...DEFAULT_FILTERS,
    entryType: searchParams.get('type') ?? '',
    status: searchParams.get('status') ?? '',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = usePaginatedQuery<FinancialEntry>(
    ['financial-entries', tenantId ?? ''],
    '/v1/financial/entries',
    {
      page,
      pageSize,
      ...(tenantId ? { tenantId } : {}),
      ...(filters.entryType ? { type: filters.entryType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    { enabled },
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
