import { useState, type Dispatch, type SetStateAction } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_FILTERS, type PricingRule, type PricingRuleFiltersState } from '../types';

export interface UsePricingRuleListReturn {
  data: PricingRule[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: PricingRuleFiltersState;
  setFilters: Dispatch<SetStateAction<PricingRuleFiltersState>>;
  pagination: DataTablePagination;
}

export function usePricingRuleList(initialFilters?: Partial<PricingRuleFiltersState>): UsePricingRuleListReturn {
  const [filters, setFilters] = useState<PricingRuleFiltersState>({ ...DEFAULT_FILTERS, ...initialFilters });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = usePaginatedQuery<PricingRule>(
    ['pricing-rules'],
    '/v1/pricing-rules',
    {
      page,
      pageSize,
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
