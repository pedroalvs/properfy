import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage, toApiError } from '@/lib/api-error';
import type { UserScope } from '../types';

export interface ResetTotpResult {
  success: boolean;
  error?: string;
}

/**
 * Admin 2FA reset for another user. Mirrors {@link useUserResetPassword}: the
 * internal scope hits the null-tenant route, the tenant scope the tenant route.
 * Reserved for AM/OP (the callers that surface the action).
 */
export function useResetUserTotp(
  overrideTenantId?: string,
  scope: UserScope = 'tenant',
) {
  const { user: authUser } = useAuth();
  const tenantId = scope === 'tenant' ? (overrideTenantId ?? authUser?.tenantId) : null;
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const resetTotp = useCallback(async (userId: string): Promise<ResetTotpResult> => {
    if (scope === 'tenant' && !tenantId) return { success: false, error: 'No agency context' };

    setIsResetting(true);
    try {
      if (scope === 'internal') {
        const { error, response } = await api.POST('/v1/users/{userId}/2fa/reset', {
          params: { path: { userId } },
        });
        const status = response.status;
        if (error) throw toApiError(error, status);
      } else {
        const { error, response } = await api.POST('/v1/tenants/{tenantId}/users/{userId}/2fa/reset', {
          params: { path: { tenantId: tenantId as string, userId } },
        });
        const status = response.status;
        if (error) throw toApiError(error, status);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['users', scope, tenantId, userId] }),
      ]);

      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'Failed to reset 2FA') };
    } finally {
      setIsResetting(false);
    }
  }, [queryClient, scope, tenantId]);

  return { resetTotp, isResetting };
}
