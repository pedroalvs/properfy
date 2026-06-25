import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import type { TotpSetupData } from '../types';

export interface UseTotpSetupReturn {
  setupTotp: () => Promise<TotpSetupData | null>;
  isSettingUp: boolean;
  error: string | null;
}

export function useTotpSetup(): UseTotpSetupReturn {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupTotp = useCallback(async (): Promise<TotpSetupData | null> => {
    setIsSettingUp(true);
    setError(null);
    try {
      const { data, error: apiError } = await api.POST('/v1/auth/2fa/setup' as any, {});
      if (apiError) throw new Error((apiError as any)?.error?.message ?? 'Request failed');
      return (data as any)?.data ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to setup 2FA';
      setError(message);
      return null;
    } finally {
      setIsSettingUp(false);
    }
  }, []);

  return { setupTotp, isSettingUp, error };
}
