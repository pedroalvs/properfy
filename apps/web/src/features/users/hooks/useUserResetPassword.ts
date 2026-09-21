import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage, toApiError } from '@/lib/api-error';
import type { UserScope } from '../types';

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}$/;

export interface UserResetPasswordFormData {
  newPassword: string;
  confirmPassword: string;
}

export interface UserResetPasswordErrors {
  newPassword?: string;
  confirmPassword?: string;
}

export interface ResetPasswordResult {
  success: boolean;
  error?: string;
}

export function useUserResetPassword(
  overrideTenantId?: string,
  scope: UserScope = 'tenant',
) {
  const { user: authUser } = useAuth();
  const tenantId = scope === 'tenant' ? (overrideTenantId ?? authUser?.tenantId) : null;
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const validate = useCallback((data: UserResetPasswordFormData): UserResetPasswordErrors => {
    const errors: UserResetPasswordErrors = {};

    if (!data.newPassword) {
      errors.newPassword = 'Required field';
    } else if (!PASSWORD_REGEX.test(data.newPassword)) {
      errors.newPassword = 'Min 8 chars, uppercase, lowercase, number and special character';
    }

    if (!data.confirmPassword) {
      errors.confirmPassword = 'Required field';
    } else if (data.newPassword !== data.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    return errors;
  }, []);

  const resetPassword = useCallback(async (
    userId: string,
    data: UserResetPasswordFormData,
  ): Promise<ResetPasswordResult> => {
    if (scope === 'tenant' && !tenantId) return { success: false, error: 'No agency context' };

    setIsResetting(true);
    try {
      // response.status is read before narrowing on `error` — these endpoints
      // declare no error response shape in the OpenAPI schema, so `error`'s
      // type is `never`; inside `if (error)` TS treats the branch as
      // unreachable and collapses every other binding (incl. `response`) too.
      if (scope === 'internal') {
        const { error, response } = await api.POST('/v1/users/{userId}/reset-password', {
          params: { path: { userId } },
          body: { newPassword: data.newPassword },
        });
        const status = response.status;
        if (error) throw toApiError(error, status);
      } else {
        const { error, response } = await api.POST('/v1/tenants/{tenantId}/users/{userId}/reset-password', {
          params: { path: { tenantId: tenantId as string, userId } },
          body: { newPassword: data.newPassword },
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
      return { success: false, error: getErrorMessage(err, 'Failed to reset password') };
    } finally {
      setIsResetting(false);
    }
  }, [queryClient, scope, tenantId]);

  return { resetPassword, validate, isResetting };
}
