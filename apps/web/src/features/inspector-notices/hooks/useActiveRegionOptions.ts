import { useMemo } from 'react';
import { useAllPagesQuery } from '@/hooks/useApiQuery';
import type { RegionOption } from '../types';

/**
 * The `/v1/service-regions` row fields this feature needs. `inspectorCount` is
 * returned by the backend but not declared in the generated OpenAPI list type
 * (its 200 schema is loose), so it is typed locally here — runtime-safe.
 */
interface ActiveRegionRow {
  id: string;
  name: string;
  inspectorCount: number;
}

export interface UseActiveRegionOptionsReturn {
  options: RegionOption[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** All ACTIVE service regions for the New notice region select. */
export function useActiveRegionOptions(enabled: boolean): UseActiveRegionOptionsReturn {
  const query = useAllPagesQuery<ActiveRegionRow>(
    ['inspector-notices', 'region-options'],
    '/v1/service-regions',
    { status: 'ACTIVE' },
    { enabled },
  );

  const options = useMemo<RegionOption[]>(
    () =>
      (query.data?.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        inspectorCount: row.inspectorCount ?? 0,
      })),
    [query.data],
  );

  return {
    options,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
