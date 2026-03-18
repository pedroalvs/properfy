import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_TEMPLATE_FILTERS, type NotificationTemplate, type TemplateFiltersState } from '../types';

export interface UseTemplateListReturn {
  data: NotificationTemplate[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: TemplateFiltersState;
  setFilters: (filters: TemplateFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useTemplateList(): UseTemplateListReturn {
  const [filters, setFilters] = useState<TemplateFiltersState>(DEFAULT_TEMPLATE_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    search: filters.search || undefined,
    channel: filters.channel || undefined,
    active: filters.active || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<NotificationTemplate>(
    ['notification-templates'],
    '/v1/notification-templates',
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
    errorMessage: null,
    refetch,
    filters,
    setFilters,
    pagination,
    sorting,
  };
}
