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

  return {
    serviceType: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
