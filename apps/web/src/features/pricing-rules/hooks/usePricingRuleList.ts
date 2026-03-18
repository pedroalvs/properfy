import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type PricingRule, type PricingRuleFiltersState } from '../types';

export interface UsePricingRuleListReturn {
  data: PricingRule[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: PricingRuleFiltersState;
  setFilters: (filters: PricingRuleFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function usePricingRuleList(): UsePricingRuleListReturn {
  const [filters, setFilters] = useState<PricingRuleFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = usePaginatedQuery<PricingRule>(
    ['pricing-rules'],
    '/v1/pricing-rules',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      ...(filters.serviceTypeId ? { serviceTypeId: filters.serviceTypeId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
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
