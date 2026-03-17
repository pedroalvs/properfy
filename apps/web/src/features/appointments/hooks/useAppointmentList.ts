import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination, DataTableSorting } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type Appointment, type AppointmentFiltersState } from '../types';

export interface UseAppointmentListReturn {
  data: Appointment[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AppointmentFiltersState;
  setFilters: (filters: AppointmentFiltersState) => void;
  pagination: DataTablePagination;
  sorting: DataTableSorting;
}

export function useAppointmentList(): UseAppointmentListReturn {
  const [filters, setFilters] = useState<AppointmentFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState('scheduledDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const params: ListParams = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    status: filters.status || undefined,
    branchId: filters.branchId || undefined,
    search: filters.search || undefined,
    fromDate: filters.startDate || undefined,
    toDate: filters.endDate || undefined,
    showCancelled: filters.showCancelled || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Appointment>(
    ['appointments'],
    '/v1/appointments',
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
