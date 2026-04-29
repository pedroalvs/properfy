import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';

export interface ServiceGroupMapItem {
  id: string;
  name: string;
  regionName: string | null;
  status: string;
  priorityMode: string;
  appointmentsCount: number;
  // Optional: API may omit when includeAppointments=false or when the group has
  // no rows. Consumers must guard with `?? []`.
  appointments?: {
    id: string;
    code: string;
    status: string;
    address: string;
    latitude: number;
    longitude: number;
    scheduledDate?: string;
    inspectorName?: string | null;
  }[];
}

export interface ServiceGroupMapFilters {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_SG_MAP_FILTERS: ServiceGroupMapFilters = {
  status: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

export interface UseServiceGroupMapDataReturn {
  data: ServiceGroupMapItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceGroupMapFilters;
  setFilters: (filters: ServiceGroupMapFilters) => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
}

export function useServiceGroupMapData(): UseServiceGroupMapDataReturn {
  const [filters, setFilters] = useState<ServiceGroupMapFilters>(DEFAULT_SG_MAP_FILTERS);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const params: ListParams = {
    page: 1,
    pageSize: 100,
    sortBy: 'name',
    sortOrder: 'asc',
    status: filters.status || undefined,
    search: filters.search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    includeAppointments: true,
  };

  const { data: response, isLoading, isError, error, refetch } = usePaginatedQuery<ServiceGroupMapItem>(
    ['service-groups-map', filters.status, filters.search, filters.dateFrom, filters.dateTo],
    '/v1/service-groups',
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
    selectedGroupId,
    setSelectedGroupId,
  };
}
