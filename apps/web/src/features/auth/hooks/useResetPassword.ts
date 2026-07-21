import { useState, useCallback } from 'react';
import { mapResetPasswordError } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

export interface UseResetPasswordReturn {
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  isInvalidToken: boolean;
}

export function useResetPassword(): UseResetPasswordReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInvalidToken, setIsInvalidToken] = useState(false);

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    setIsLoading(true);
    setError(null);
    setIsInvalidToken(false);

    try {
      const { error: apiError, response } = await api.POST('/v1/auth/reset-password', {
        body: { token, newPassword },
      });

      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);

      setIsSuccess(true);
    } catch (err) {
      const { message, invalidToken } = mapResetPasswordError(toApiError(err));
      setError(message);
      setIsInvalidToken(invalidToken);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { resetPassword, isLoading, isSuccess, error, isInvalidToken };
}
