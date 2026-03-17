import { useDetailQuery } from '@/hooks/useApiQuery';
import type { ServiceGroupDetail } from '../types';

export interface UseServiceGroupDetailReturn {
  serviceGroup: ServiceGroupDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useServiceGroupDetail(id: string | null): UseServiceGroupDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<ServiceGroupDetail>(
    ['service-groups', id],
    `/v1/service-groups/${id}`,
    { enabled: !!id },
  );

  return {
    serviceGroup: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
