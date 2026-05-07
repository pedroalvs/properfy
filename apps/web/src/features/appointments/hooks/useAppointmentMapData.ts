import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';

export interface AppointmentMapItem {
  id: string;
  code: string;
  status: string;
  propertyAddress: string;
  latitude: number;
  longitude: number;
  scheduledDate: string;
  timeSlot: string;
  inspectorName: string | null;
  branchName: string;
}

export interface AppointmentMapFilters {
  status: string;
  dateFrom: string;
  dateTo: string;
  branchId: string;
}

export const DEFAULT_MAP_FILTERS: AppointmentMapFilters = {
  status: '',
  dateFrom: '',
  dateTo: '',
  branchId: '',
};

export interface UseAppointmentMapDataReturn {
  data: AppointmentMapItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: AppointmentMapFilters;
  setFilters: (filters: AppointmentMapFilters) => void;
}

export function useAppointmentMapData(): UseAppointmentMapDataReturn {
  const [filters, setFilters] = useState<AppointmentMapFilters>(DEFAULT_MAP_FILTERS);

  const params: ListParams = {
    page: 1,
    pageSize: 100,
    status: filters.status || undefined,
    fromDate: filters.dateFrom || undefined,
    toDate: filters.dateTo || undefined,
    branchId: filters.branchId || undefined,
  };

  const { data: response, isLoading, isError, error, refetch } = usePaginatedQuery<AppointmentMapItem>(
    ['appointments-map'],
    '/v1/appointments',
    params,
  );

  return {
    data: response?.data ?? [],
    isLoading,
    isError,
    errorMessage: error?.message ?? null,
    refetch,
    filters,
    setFilters,
  };
}
