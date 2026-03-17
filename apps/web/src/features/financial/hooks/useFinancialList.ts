import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
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
  sorting: DataTableSorting;
}

export function useFinancialList(): UseFinancialListReturn {
  const [filters, setFilters] = useState<FinancialFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('effectiveAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = usePaginatedQuery<FinancialEntry>(
    ['financial-entries'],
    '/v1/financial/entries',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filters.entryType ? { entryType: filters.entryType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    },
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
