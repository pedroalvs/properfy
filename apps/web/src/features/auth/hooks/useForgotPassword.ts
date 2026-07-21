import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { ApiError, getErrorMessage, toApiError } from '@/lib/api-error';

export interface UseForgotPasswordReturn {
  requestReset: (email: string) => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  reset: () => void;
}

function getForgotPasswordErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status >= 500) return 'Server error. Please try again later.';
  }
  return getErrorMessage(error, 'An unexpected error occurred. Please try again.');
}

export function useForgotPassword(): UseForgotPasswordReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = useCallback(async (email: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: apiError, response } = await api.POST('/v1/auth/forgot-password', {
        body: { email },
      });

      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);

      setIsSuccess(true);
    } catch (err) {
      setError(getForgotPasswordErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setIsSuccess(false);
    setError(null);
  }, []);

  return { requestReset, isLoading, isSuccess, error, reset };
}
