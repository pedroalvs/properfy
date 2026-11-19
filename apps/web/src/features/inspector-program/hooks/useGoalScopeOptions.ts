import { useMemo } from 'react';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import type { SelectOption } from '@/components/forms/SelectInput';

interface NamedRow {
  id: string;
  name: string;
}

export interface UseGoalScopeOptionsReturn {
  regionOptions: SelectOption[];
  serviceTypeOptions: SelectOption[];
  isLoading: boolean;
}

/**
 * Region and service-type options for the goal form's scope fields. Both are
 * bounded catalogs, so a single `pageSize: 100` page is enough (unlike the
 * inspector search, which is unbounded — that uses `InspectorSelect`).
 */
export function useGoalScopeOptions(): UseGoalScopeOptionsReturn {
  const regions = usePaginatedQuery<NamedRow>(
    ['inspector-program', 'scope-regions'],
    '/v1/service-regions',
    { pageSize: 100 },
  );
  const serviceTypes = usePaginatedQuery<NamedRow>(
    ['inspector-program', 'scope-service-types'],
    '/v1/service-types',
    { pageSize: 100 },
  );

  const regionOptions = useMemo<SelectOption[]>(
    () => (regions.data?.data ?? []).map((r) => ({ value: r.id, label: r.name })),
    [regions.data],
  );
  const serviceTypeOptions = useMemo<SelectOption[]>(
    () => (serviceTypes.data?.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    [serviceTypes.data],
  );

  return {
    regionOptions,
    serviceTypeOptions,
    isLoading: regions.isLoading || serviceTypes.isLoading,
  };
}
