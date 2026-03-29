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

  return {
    serviceRegion: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
