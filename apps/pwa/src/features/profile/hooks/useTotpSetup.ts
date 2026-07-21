import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { toApiError, getErrorMessage } from '@/lib/api-error';

interface TotpSetupData {
  secret: string;
  qrUri: string;
}

export function useTotpSetup() {
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const startSetup = useCallback(async () => {
    setIsSettingUp(true);
    try {
      const { data, error, response } = await api.POST('/v1/auth/2fa/setup' as any, {} as any);
      if (error || !data) {
        const apiError = toApiError(error, response?.status);
        apiError.message = getErrorMessage(apiError, 'Failed to set up 2FA');
        throw apiError;
      }
      const result = data as any;
      setSetupData({ secret: result.secret ?? result.data?.secret, qrUri: result.qrUri ?? result.data?.qrUri });
    } finally {
      setIsSettingUp(false);
    }
  }, []);

  const confirmSetup = useCallback(async (totpCode: string) => {
    setIsConfirming(true);
    try {
      const { error, response } = await api.POST('/v1/auth/2fa/confirm' as any, {
        body: { totpCode } as any,
      });
      if (error) {
        const apiError = toApiError(error, response?.status);
        apiError.message = getErrorMessage(apiError, 'Invalid verification code');
        throw apiError;
      }
      setSetupData(null);
    } finally {
      setIsConfirming(false);
    }
  }, []);

  const cancelSetup = useCallback(() => {
    setSetupData(null);
  }, []);

  return { setupData, startSetup, confirmSetup, cancelSetup, isSettingUp, isConfirming };
}
