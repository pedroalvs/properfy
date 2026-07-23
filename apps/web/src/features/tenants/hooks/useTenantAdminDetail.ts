import { useMemo } from 'react';
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

  // PR #961 bug class: TenantFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const tenant = useMemo(() => response?.data ?? null, [response?.data]);

  return {
    tenant,
    isLoading,
    isError,
    refetch,
  };
}
