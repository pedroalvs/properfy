import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { toApiError, getErrorMessage } from '@/lib/api-error';

export function useChangePassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setIsSubmitting(true);
    try {
      const { error, response } = await api.POST('/v1/auth/change-password' as any, {
        body: { currentPassword, newPassword } as any,
      });
      if (error) {
        const apiError = toApiError(error, response?.status);
        apiError.message = getErrorMessage(apiError, 'Failed to change password');
        throw apiError;
      }
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { changePassword, isSubmitting };
}
