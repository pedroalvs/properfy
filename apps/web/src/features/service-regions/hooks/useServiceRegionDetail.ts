import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ServiceRegionDetail } from '../types';

export interface UseServiceRegionDetailReturn {
  serviceRegion: ServiceRegionDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceRegionDetail(id: string | null): UseServiceRegionDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ServiceRegionDetail>(
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
