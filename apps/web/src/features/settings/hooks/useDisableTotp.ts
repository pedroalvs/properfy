import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { getErrorMessage, toApiError } from '@/lib/api-error';

export interface UseDisableTotpReturn {
  disableTotp: (currentPassword: string) => Promise<{ success: boolean; error?: string }>;
  isDisabling: boolean;
}

/** Self-service disable of the caller's own 2FA (POST /v1/auth/2fa/disable). */
export function useDisableTotp(): UseDisableTotpReturn {
  const [isDisabling, setIsDisabling] = useState(false);

  const disableTotp = useCallback(async (
    currentPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    setIsDisabling(true);
    try {
      const { error, response } = await api.POST('/v1/auth/2fa/disable', {
        body: { currentPassword },
      });
      // The route declares no error response shape, so TS narrows `error` to
      // `never`; read the status before the guard, as the sibling auth hooks do.
      const status = response.status;
      if (error) throw toApiError(error, status);
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'Failed to disable 2FA') };
    } finally {
      setIsDisabling(false);
    }
  }, []);

  return { disableTotp, isDisabling };
}
