import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
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
  sorting: DataTableSorting;
}

export function useInvoiceList(): UseInvoiceListReturn {
  const [filters, setFilters] = useState<InvoiceFiltersState>(DEFAULT_INVOICE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const query = usePaginatedQuery<Invoice>(
    ['invoices'],
    '/v1/billing/invoices',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
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
