import { useState, useCallback } from 'react';
import { env } from '@/config/env';
import { ApiError } from '@/lib/api-error';

export const INVALID_TOKEN_CODE = 'AUTH_INVALID_RESET_TOKEN';

export interface UseResetPasswordReturn {
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  isInvalidToken: boolean;
}

function getErrorMessage(error: unknown): { message: string; invalidToken: boolean } {
  if (error instanceof ApiError) {
    if (error.code === INVALID_TOKEN_CODE) {
      return {
        message: 'This reset link is invalid or has expired. Please request a new link.',
        invalidToken: true,
      };
    }
    if (error.status === 429) {
      return { message: 'Too many attempts. Please wait and try again.', invalidToken: false };
    }
    if (error.status >= 500) {
      return { message: 'Server error. Please try again later.', invalidToken: false };
    }
    return { message: error.message, invalidToken: false };
  }
  return { message: 'An unexpected error occurred. Please try again.', invalidToken: false };
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
      const response = await fetch(`${env.apiBaseUrl}/v1/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        let code: string | undefined;
        let message = 'Failed to reset password.';
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
      const { message, invalidToken } = getErrorMessage(err);
      setError(message);
      setIsInvalidToken(invalidToken);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { resetPassword, isLoading, isSuccess, error, isInvalidToken };
}
