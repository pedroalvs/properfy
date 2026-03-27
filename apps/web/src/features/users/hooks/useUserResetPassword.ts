import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
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
    if (scope === 'tenant' && !tenantId) return { success: false, error: 'No tenant context' };

    setIsResetting(true);
    try {
      const path = scope === 'internal'
        ? `/v1/users/${userId}/reset-password`
        : `/v1/tenants/${tenantId}/users/${userId}/reset-password`;
      const { error } = await api.POST(
        path as any,
        {
          body: { newPassword: data.newPassword } as any,
        },
      );
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['users', scope, tenantId, userId] }),
      ]);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      return { success: false, error: message };
    } finally {
      setIsResetting(false);
    }
  }, [queryClient, scope, tenantId]);

  return { resetPassword, validate, isResetting };
}
