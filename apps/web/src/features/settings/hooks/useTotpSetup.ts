import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { ApiError, getErrorMessage, toApiError } from '@/lib/api-error';
import type { TotpSetupData } from '../types';

export interface UseTotpSetupReturn {
  setupTotp: () => Promise<TotpSetupData>;
  isSettingUp: boolean;
  error: string | null;
}

export function useTotpSetup(): UseTotpSetupReturn {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupTotp = useCallback(async (): Promise<TotpSetupData> => {
    setIsSettingUp(true);
    setError(null);
    try {
      const { data, error: apiError, response } = await api.POST('/v1/auth/2fa/setup', {});
      // The spec declares no error responses for this route, so TS narrows the
      // error branch to `never`; at runtime openapi-fetch still surfaces the
      // backend error envelope here.
      if (apiError) throw toApiError(apiError, (response as Response | undefined)?.status);
      if (!data) throw new ApiError(500, 'Failed to setup 2FA');
      return { totpUri: data.qrUri, secret: data.secret };
    } catch (err) {
      const apiErr = toApiError(err);
      setError(getErrorMessage(apiErr, 'Failed to setup 2FA'));
      throw apiErr;
    } finally {
      setIsSettingUp(false);
    }
  }, []);

  return { setupTotp, isSettingUp, error };
}
