import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface DeactivateResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface UseAppDeactivateReturn {
  deactivate: (appId: string) => Promise<DeactivateResult>;
  reactivate: (appId: string) => Promise<DeactivateResult>;
  isPending: boolean;
}

/** Soft-delete + reactivate for app credentials (mirrors the contacts flow). */
export function useAppDeactivate(): UseAppDeactivateReturn {
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();

  const run = useCallback(async (fn: () => Promise<{ error?: unknown }>): Promise<DeactivateResult> => {
    setIsPending(true);
    try {
      const { error } = await fn();
      if (error) {
        return { success: false, errorCode: (error as any)?.error?.code, errorMessage: (error as any)?.error?.message ?? 'Request failed' };
      }
      queryClient.invalidateQueries({ queryKey: ['app-credentials'] });
      return { success: true };
    } finally {
      setIsPending(false);
    }
  }, [queryClient]);

  const deactivate = useCallback(
    (appId: string) => run(() => api.POST(`/v1/app-credentials/${appId}/deactivate` as any, { body: {} as any })),
    [run],
  );
  const reactivate = useCallback(
    (appId: string) => run(() => api.PATCH(`/v1/app-credentials/${appId}` as any, { body: { isActive: true } as any })),
    [run],
  );

  return { deactivate, reactivate, isPending };
}
