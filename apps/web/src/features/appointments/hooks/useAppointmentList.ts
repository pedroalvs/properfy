import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
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
}

export function useAppointmentList(): UseAppointmentListReturn {
  const [searchParams] = useSearchParams();
  const [filters, setFiltersRaw] = useState<AppointmentFiltersState>({
    ...DEFAULT_FILTERS,
    status: searchParams.get('status') ?? '',
    tenantConfirmationStatus: searchParams.get('tenantConfirmationStatus') ?? '',
    startDate: searchParams.get('fromDate') ?? '',
    endDate: searchParams.get('toDate') ?? '',
  });
  const setFilters = (f: AppointmentFiltersState) => { setFiltersRaw(f); setPage(1); };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params: ListParams = {
    page,
    pageSize,
    status: filters.status || undefined,
    tenantConfirmationStatus: filters.tenantConfirmationStatus || undefined,
    tenantId: filters.tenantId || undefined,
    branchId: filters.branchId || undefined,
    serviceTypeId: filters.serviceTypeId || undefined,
    search: filters.search || undefined,
    fromDate: filters.startDate || undefined,
    toDate: filters.endDate || undefined,
    showCancelled: filters.showCancelled ? 'true' : undefined,
    overdueOnly: filters.overdueOnly ? 'true' : undefined,
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

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    errorMessage: null,
    refetch,
    filters,
    setFilters: setFilters,
    pagination,
  };
}
