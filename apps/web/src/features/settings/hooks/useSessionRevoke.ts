import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';

export interface UseSessionRevokeReturn {
  revoke: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  isRevoking: boolean;
}

export function useSessionRevoke(): UseSessionRevokeReturn {
  const [isRevoking, setIsRevoking] = useState(false);
  const queryClient = useQueryClient();

  const revoke = useCallback(async (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    setIsRevoking(true);
    try {
      const { error } = await api.DELETE(`/v1/auth/sessions/${sessionId}` as any, {} as any);
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke session';
      return { success: false, error: message };
    } finally {
      setIsRevoking(false);
    }
  }, [queryClient]);

  return { revoke, isRevoking };
}
