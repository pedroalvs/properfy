import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ServiceRegion } from '../types';

export interface UseServiceRegionDetailReturn {
  serviceRegion: ServiceRegion | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceRegionDetail(id: string | null): UseServiceRegionDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ServiceRegion>(
    ['service-regions', id],
    `/v1/service-regions/${id}`,
    { enabled: !!id },
  );

  // PR #961 bug class: ServiceRegionFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const serviceRegion = useMemo(() => response?.data ?? null, [response?.data]);

  return {
    serviceRegion,
    isLoading,
    isError,
    refetch,
  };
}
