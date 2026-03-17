import { useDetailQuery } from '@/hooks/useApiQuery';
import type { TenantContactDetail } from '../types';

export interface UseTenantContactDetailReturn {
  contact: TenantContactDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTenantContactDetail(id: string | null): UseTenantContactDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<TenantContactDetail>(
    ['tenants', id],
    `/v1/tenants/${id}`,
    { enabled: !!id },
  );

  return {
    contact: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
