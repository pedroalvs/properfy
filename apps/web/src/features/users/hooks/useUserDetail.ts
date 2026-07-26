import { useMemo } from 'react';
import { useDetailQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/hooks/useAuth';
import type { UserDetail, UserScope } from '../types';

export interface UseUserDetailReturn {
  user: UserDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useUserDetail(
  id: string | null,
  overrideTenantId?: string,
  scope: UserScope = 'tenant',
): UseUserDetailReturn {
  const { user: authUser } = useAuth();
  const tenantId = scope === 'tenant' ? (overrideTenantId ?? authUser?.tenantId) : null;

  const query = useDetailQuery<UserDetail>(
    ['users', scope, tenantId, id],
    scope === 'internal' ? `/v1/users/${id}` : `/v1/tenants/${tenantId}/users/${id}`,
    { enabled: !!id && (scope === 'internal' || !!tenantId) },
  );

  // PR #961 bug class: UserFormDrawer's populate effect depends on this reference —
  // keep any future payload transforms INSIDE this memo so it stays stable per fetch.
  const user = useMemo(() => query.data?.data ?? null, [query.data?.data]);

  return {
    user,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
