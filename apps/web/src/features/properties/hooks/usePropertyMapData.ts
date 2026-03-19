import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';

export interface PropertyMapItem {
  id: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  type: string;
  latitude: number;
  longitude: number;
  branchName: string;
}

export interface PropertyMapFilters {
  propertyType: string;
  search: string;
  branchId: string;
}

export const DEFAULT_PROPERTY_MAP_FILTERS: PropertyMapFilters = {
  propertyType: '',
  search: '',
  branchId: '',
};

export interface UsePropertyMapDataReturn {
  data: PropertyMapItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: PropertyMapFilters;
  setFilters: (filters: PropertyMapFilters) => void;
}

export function usePropertyMapData(): UsePropertyMapDataReturn {
  const [filters, setFilters] = useState<PropertyMapFilters>(DEFAULT_PROPERTY_MAP_FILTERS);

  const params: ListParams = {
    page: 1,
    pageSize: 200,
    sortBy: 'street',
    sortOrder: 'asc',
    type: filters.propertyType || undefined,
    search: filters.search || undefined,
    branchId: filters.branchId || undefined,
    hasCoordinates: true,
  };

  const { data: response, isLoading, isError, error, refetch } = usePaginatedQuery<PropertyMapItem>(
    ['properties-map'],
    '/v1/properties',
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
