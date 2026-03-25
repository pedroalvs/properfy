import { useState } from 'react';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { DEFAULT_SLOT_FILTERS, type AvailabilitySlot, type SlotFiltersState } from '../types';

export interface UseSlotListReturn {
  data: AvailabilitySlot[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: SlotFiltersState;
  setFilters: (filters: SlotFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useSlotList(): UseSlotListReturn {
  const [filters, setFilters] = useState<SlotFiltersState>(DEFAULT_SLOT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const query = usePaginatedQuery<AvailabilitySlot>(
    ['availability-slots'],
    '/v1/availability-slots',
    {
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(filters.inspectorId ? { inspectorId: filters.inspectorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
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
