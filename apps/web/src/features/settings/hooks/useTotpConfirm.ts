import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export interface UseTotpConfirmReturn {
  confirmTotp: (totpCode: string) => Promise<{ success: boolean; error?: string }>;
  isConfirming: boolean;
}

export function useTotpConfirm(): UseTotpConfirmReturn {
  const [isConfirming, setIsConfirming] = useState(false);

  const confirmTotp = useCallback(async (totpCode: string): Promise<{ success: boolean; error?: string }> => {
    setIsConfirming(true);
    try {
      const { error } = await api.POST('/v1/auth/2fa/confirm' as any, {
        body: { totpCode } as any,
      });
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm 2FA';
      return { success: false, error: message };
    } finally {
      setIsConfirming(false);
    }
  }, []);

  return { confirmTotp, isConfirming };
}
