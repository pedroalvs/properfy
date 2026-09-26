import { useCallback, useMemo, useState } from 'react';
import type { paths, ServiceGroupStatus } from '@properfy/shared';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import { getErrorMessage } from '@/lib/api-error';
import type { DataTablePagination } from '@/components/data/DataTable';
import { DEFAULT_FILTERS, type ServiceGroup, type ServiceGroupFiltersState } from '../types';

/**
 * API-side list item, derived from the generated contract so a backend rename
 * of a mapped field (`groupSize`, `assignedInspectorId`, `regionName`, …) breaks
 * the build instead of silently producing `undefined`.
 *
 * Two fields are narrowed on top of the contract because the OpenAPI
 * registration under-specifies them (a known gap — see
 * `audit-specs/service-groups.md` risk #8; fixing it is backend scope): the
 * backend returns `assignedInspectorName`, absent from the schema entirely.
 */
type ServiceGroupListItem =
  paths['/v1/service-groups']['get']['responses'][200]['content']['application/json']['data'][number] & {
    assignedInspectorName?: string | null;
  };

export interface UseServiceGroupListReturn {
  data: ServiceGroup[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: ServiceGroupFiltersState;
  setFilters: (filters: ServiceGroupFiltersState) => void;
  pagination: DataTablePagination;
}

export function useServiceGroupList(): UseServiceGroupListReturn {
  const [filters, setFiltersState] = useState<ServiceGroupFiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Narrowing the result set while on a later page would query e.g. page 3 of a
  // now-shorter list and render a misleadingly empty table.
  const setFilters = useCallback((next: ServiceGroupFiltersState) => {
    setFiltersState(next);
    setPage(1);
  }, []);

  const params: ListParams = {
    page,
    pageSize,
    search: filters.search || undefined,
    status: filters.status || undefined,
  };

  const { data: response, isLoading, isError, error, refetch } = usePaginatedQuery<ServiceGroupListItem>(
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

  // PR #961 bug class: memoized so consumers get a stable array per fetch result.
  const data: ServiceGroup[] = useMemo(() => {
    const rawData: ServiceGroupListItem[] = response?.data ?? [];
    return rawData.map((item) => ({
      ...item,
      status: item.status as ServiceGroupStatus,
      serviceRegionId: item.serviceRegionId ?? null,
      regionName: item.regionName ?? null,
      inspectorId: item.assignedInspectorId ?? null,
      inspectorName: item.assignedInspectorName ?? null,
      agencies: item.agencies ?? [],
      appointmentsCount: item.groupSize ?? 0,
      updatedAt: item.updatedAt ?? item.createdAt,
    }));
  }, [response?.data]);

  return {
    data,
    isLoading,
    isError,
    // Truthful error contract: surface the backend message when there is one,
    // otherwise null so the page-level fallback copy applies (was hardcoded null).
    errorMessage: isError ? getErrorMessage(error) : null,
    refetch,
    filters,
    setFilters,
    pagination,
  };
}
