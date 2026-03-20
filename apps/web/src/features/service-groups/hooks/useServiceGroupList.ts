import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type ServiceGroup, type ServiceGroupFiltersState } from '../types';

export interface UseServiceGroupListReturn {
  data: ServiceGroup[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceGroupFiltersState;
  setFilters: (filters: ServiceGroupFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useServiceGroupList(): UseServiceGroupListReturn {
  const [filters, setFilters] = useState<ServiceGroupFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    status: filters.status || undefined,
    search: filters.search || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<any>(
    ['service-groups'],
    '/v1/service-groups',
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

  const rawData: any[] = response?.data ?? [];
  const data: ServiceGroup[] = rawData.map((item) => ({
    ...item,
    name: item.name ?? '',
    regionName: item.regionName ?? null,
    inspectorId: item.assignedInspectorId ?? null,
    inspectorName: null,
    appointmentsCount: item.groupSize ?? 0,
    updatedAt: item.updatedAt ?? item.createdAt,
  }));

  return {
    data,
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
