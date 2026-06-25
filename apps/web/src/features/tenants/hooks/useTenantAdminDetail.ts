import { useDetailQuery } from '@/hooks/useApiQuery';
import type { TenantAdminDetail } from '../types';

export interface UseTenantAdminDetailReturn {
  tenant: TenantAdminDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTenantAdminDetail(id: string | null): UseTenantAdminDetailReturn {
  const { data: response, isLoading, isError, refetch } = useDetailQuery<TenantAdminDetail>(
    ['tenant-admins', id],
    `/v1/tenants/${id}`,
    { enabled: !!id },
  );

  return {
    tenant: response?.data ?? null,
    isLoading,
    isError,
    refetch,
  };
}
