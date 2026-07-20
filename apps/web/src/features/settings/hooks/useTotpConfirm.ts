import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { getErrorMessage, toApiError } from '@/lib/api-error';

export interface UseTotpConfirmReturn {
  confirmTotp: (totpCode: string) => Promise<{ success: boolean; error?: string }>;
  isConfirming: boolean;
}

export function useTotpConfirm(): UseTotpConfirmReturn {
  const [isConfirming, setIsConfirming] = useState(false);

  const confirmTotp = useCallback(async (totpCode: string): Promise<{ success: boolean; error?: string }> => {
    setIsConfirming(true);
    try {
      const { error, response } = await api.POST('/v1/auth/2fa/confirm' as any, {
        body: { totpCode } as any,
      });
      if (error) throw toApiError(error, response?.status);
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err, 'Failed to confirm 2FA') };
    } finally {
      setIsConfirming(false);
    }
  }, []);

  return { confirmTotp, isConfirming };
}
