import { useCallback, useMemo, useState } from 'react';
import type { DataTablePagination } from '@/components/data/DataTable';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useUrlFilters, type FilterSchema } from '@/hooks/useUrlFilters';
import type { InspectorStatus, ServiceTypeEntry, paths } from '@properfy/shared';
import type { Inspector, InspectorFiltersState } from '../types';

type InspectorApiRecord =
  paths['/v1/inspectors']['get']['responses']['200']['content']['application/json']['data'][number];

const FILTER_SCHEMA = {
  search: { type: 'string' as const, default: '' },
  status: { type: 'string' as const, default: '' },
} satisfies FilterSchema;

export interface UseInspectorListReturn {
  data: Inspector[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: InspectorFiltersState;
  setFilters: (filters: InspectorFiltersState) => void;
  pagination: DataTablePagination;
}

export function useInspectorList(): UseInspectorListReturn {
  const [urlFilters, setFilter] = useUrlFilters(FILTER_SCHEMA);
  const filters = urlFilters as InspectorFiltersState;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const setFilters = useCallback((next: InspectorFiltersState) => {
    for (const key of Object.keys(FILTER_SCHEMA) as (keyof typeof FILTER_SCHEMA)[]) {
      if (next[key] !== filters[key]) setFilter(key, next[key]);
    }
    setPage(1);
  }, [filters, setFilter]);
  const query = usePaginatedQuery<InspectorApiRecord>(
    ['inspectors'],
    '/v1/inspectors',
    {
      page,
      pageSize,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
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

  // PR #961 bug class: memoized so consumers get a stable array per fetch result.
  const data: Inspector[] = useMemo(() => {
    const rawData: InspectorApiRecord[] = query.data?.data ?? [];
    return rawData.map((item): Inspector => {
      const serviceTypes = Array.isArray(item.serviceTypesJson)
        ? (item.serviceTypesJson as ServiceTypeEntry[])
        : [];
      return {
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        status: item.status as InspectorStatus,
        regionsCount: item.regionIds?.length ?? 0,
        serviceTypesCount: serviceTypes.length,
        // Defaults keep a pre-deploy API from rendering undefined cells. null, not
        // 0, for an unrated inspector — see Inspector.ratingAvg.
        ratingAvg: item.rating?.average ?? null,
        ratingCount: item.rating?.responseCount ?? 0,
        completedCount: item.rating?.doneServicesCount ?? 0,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });
  }, [query.data?.data]);

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: query.refetch,
    filters,
    setFilters,
    pagination,
  };
}
