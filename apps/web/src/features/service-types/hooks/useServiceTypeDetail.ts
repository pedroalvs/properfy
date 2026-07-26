import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ServiceType } from '../types';

export interface UseServiceTypeDetailReturn {
  serviceType: ServiceType | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceTypeDetail(id: string | null): UseServiceTypeDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ServiceType>(
    ['service-types', id],
    `/v1/service-types/${id}`,
    { enabled: !!id },
  );

  // PR #961 bug class: ServiceTypeFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const serviceType = useMemo(() => response?.data ?? null, [response?.data]);

  return {
    serviceType,
    isLoading,
    isError,
    refetch,
  };
}
