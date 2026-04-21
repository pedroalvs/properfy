import { useState, useCallback } from 'react';
import { env } from '@/config/env';
import { ApiError } from '@/lib/api-error';

export interface UseForgotPasswordReturn {
  requestReset: (email: string) => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  reset: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status >= 500) return 'Server error. Please try again later.';
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export function useForgotPassword(): UseForgotPasswordReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = useCallback(async (email: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${env.apiBaseUrl}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        let code: string | undefined;
        let message = 'Failed to send reset email.';
        try {
          const body = await response.json();
          code = body?.error?.code;
          message = body?.error?.message ?? message;
        } catch {
          // ignore parse errors
        }
        throw new ApiError(response.status, message, code);
      }

      setIsSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
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
