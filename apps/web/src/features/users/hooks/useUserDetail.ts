import { useDetailQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import type { UserDetail } from '../types';

export interface UseUserDetailReturn {
  user: UserDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useUserDetail(id: string | null, overrideTenantId?: string): UseUserDetailReturn {
  const { user: authUser } = useAuth();
  const tenantId = overrideTenantId ?? authUser?.tenantId;

  const query = useDetailQuery<UserDetail>(
    ['users', tenantId, id],
    `/v1/tenants/${tenantId}/users/${id}`,
    { enabled: !!id && !!tenantId },
  );

  return {
    user: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
