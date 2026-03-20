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

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Record<string, unknown>>(
    ['notification-templates'],
    '/v1/notification-templates',
    params,
  );

  const templates: NotificationTemplate[] = (response?.data ?? []).map((raw) => ({
    id: raw['id'] as string,
    code: (raw['templateCode'] ?? raw['code']) as string,
    channel: raw['channel'] as NotificationTemplate['channel'],
    subject: (raw['subject'] as string) ?? '',
    body: (raw['bodyText'] ?? raw['body']) as string,
    active: (raw['isActive'] ?? raw['active']) as boolean,
    requiredVariables: (raw['variables'] ?? raw['requiredVariables'] ?? []) as string[],
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
  }));

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
    data: templates,
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
