import { useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_INVOICE_FILTERS, type Invoice, type InvoiceFiltersState } from '../types';

export interface UseInvoiceListReturn {
  data: Invoice[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: InvoiceFiltersState;
  setFilters: (filters: InvoiceFiltersState) => void;
  pagination: DataTablePagination;
}

export function useInvoiceList(): UseInvoiceListReturn {
  const [filters, setFilters] = useState<InvoiceFiltersState>(DEFAULT_INVOICE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = usePaginatedQuery<Invoice>(
    ['invoices'],
    '/v1/billing/invoices',
    {
      page,
      pageSize,
      ...(filters.inspectorId ? { inspectorId: filters.inspectorId } : {}),
      ...(filters.agencyId ? { agencyId: filters.agencyId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.periodStart ? { fromDate: filters.periodStart } : {}),
      ...(filters.periodEnd ? { toDate: filters.periodEnd } : {}),
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
