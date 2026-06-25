import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';

export function useChangePassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setIsSubmitting(true);
    try {
      const { error, response } = await api.POST('/v1/auth/change-password' as any, {
        body: { currentPassword, newPassword } as any,
      });
      if (error) {
        const err = error as any;
        throw new ApiError(
          response?.status ?? 500,
          err?.error?.message ?? 'Failed to change password',
          err?.error?.code,
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { changePassword, isSubmitting };
}
