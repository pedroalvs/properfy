import { useCallback, useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import type { DataTablePagination } from '@/components/data/DataTable';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import type { Appointment, AppointmentFiltersState } from '../types';

/**
 * Shared by the list and the board so both screens read and write the SAME URL
 * query params — that is what lets filters survive the List ⇄ Board jump.
 * Do not fork this: a second copy is how the two screens silently drift apart.
 */
export const APPOINTMENT_FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  status: { type: 'string' as const, default: '' },
  rentalTenantConfirmationStatus: { type: 'string' as const, default: '' },
  tenantId: { type: 'string' as const, default: '' },
  branchId: { type: 'string' as const, default: '' },
  inspectorId: { type: 'string' as const, default: '' },
  serviceTypeId: { type: 'string' as const, default: '' },
  startDate: { type: 'string' as const, default: '' },
  endDate: { type: 'string' as const, default: '' },
  showCancelled: { type: 'boolean' as const, default: false },
  overdueOnly: { type: 'boolean' as const, default: false },
} satisfies FilterSchema;

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
  const [urlFilters, setFilter] = useUrlFilters(APPOINTMENT_FILTER_SCHEMA);
  const filters = urlFilters as AppointmentFiltersState;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: AppointmentFiltersState) => {
    for (const key of Object.keys(APPOINTMENT_FILTER_SCHEMA) as (keyof typeof APPOINTMENT_FILTER_SCHEMA)[]) {
      if (next[key] !== filters[key]) setFilter(key, next[key]);
    }
    setPage(1);
  }, [filters, setFilter]);

  const params: ListParams = {
    page,
    pageSize,
    status: filters.status || undefined,
    rentalTenantConfirmationStatus: filters.rentalTenantConfirmationStatus || undefined,
    tenantId: filters.tenantId || undefined,
    branchId: filters.branchId || undefined,
    inspectorId: filters.inspectorId || undefined,
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
