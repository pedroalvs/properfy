import { useMemo } from 'react';
import { useAllPagesQuery } from '@/hooks/useApiQuery';
import type { InspectorOption } from '../types';

/** The subset of the `/v1/inspectors` row this feature needs. */
interface ActiveInspectorRow {
  id: string;
  name: string;
  email: string | null;
}

export interface UseActiveInspectorOptionsReturn {
  options: InspectorOption[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * All ACTIVE inspectors for the New notice multi-select. `useAllPagesQuery`
 * walks every page of `/v1/inspectors?status=ACTIVE` (pageSize 100) so a roster
 * larger than one page is complete before the picker enables. Only enabled when
 * the "Selected inspectors" audience is chosen.
 */
export function useActiveInspectorOptions(enabled: boolean): UseActiveInspectorOptionsReturn {
  const query = useAllPagesQuery<ActiveInspectorRow>(
    ['inspector-notices', 'inspector-options'],
    '/v1/inspectors',
    { status: 'ACTIVE' },
    { enabled },
  );

  const options = useMemo<InspectorOption[]>(
    () =>
      (query.data?.data ?? [])
        .map((row) => ({ id: row.id, name: row.name, email: row.email ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [query.data],
  );

  return {
    options,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
