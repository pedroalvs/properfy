import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { passwordFieldSchema, PASSWORD_REQUIREMENTS_MESSAGE } from '@properfy/shared';
import { api } from '@/services/api';

export interface InspectorResetPasswordFormData {
  newPassword: string;
  confirmPassword: string;
}

export interface InspectorResetPasswordErrors {
  newPassword?: string;
  confirmPassword?: string;
}

export interface ResetPasswordResult {
  success: boolean;
  error?: string;
}

/**
 * Operator-initiated password reset for an inspector.
 *
 * Unlike useUserResetPassword there is no tenant/scope branching: inspector
 * login accounts are cross-tenant, so the endpoint is inspector-scoped and the
 * server resolves the linked account itself.
 */
export function useInspectorResetPassword() {
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const validate = useCallback((data: InspectorResetPasswordFormData): InspectorResetPasswordErrors => {
    const errors: InspectorResetPasswordErrors = {};

    if (!data.newPassword) {
      errors.newPassword = 'Required field';
    } else if (!passwordFieldSchema.safeParse(data.newPassword).success) {
      errors.newPassword = PASSWORD_REQUIREMENTS_MESSAGE;
    }

    if (!data.confirmPassword) {
      errors.confirmPassword = 'Required field';
    } else if (data.newPassword !== data.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    return errors;
  }, []);

  const resetPassword = useCallback(async (
    inspectorId: string,
    data: InspectorResetPasswordFormData,
  ): Promise<ResetPasswordResult> => {
    setIsResetting(true);
    try {
      const { error } = await api.POST(
        `/v1/inspectors/${inspectorId}/reset-password` as any,
        { body: { newPassword: data.newPassword } as any },
      );
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inspectors'] }),
        queryClient.invalidateQueries({ queryKey: ['inspectors', inspectorId] }),
      ]);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      return { success: false, error: message };
    } finally {
      setIsResetting(false);
    }
  }, [queryClient]);

  return { resetPassword, validate, isResetting };
}
