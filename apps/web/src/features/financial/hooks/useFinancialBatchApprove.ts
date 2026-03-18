import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface UseFinancialBatchApproveReturn {
  approve: (ids: string[]) => Promise<{ success: boolean; failedCount: number }>;
  isApproving: boolean;
}

export function useFinancialBatchApprove(): UseFinancialBatchApproveReturn {
  const [isApproving, setIsApproving] = useState(false);
  const queryClient = useQueryClient();

  const approve = useCallback(async (ids: string[]) => {
    setIsApproving(true);
    let failedCount = 0;

    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const { error } = await api.PATCH(`/v1/financial/entries/${id}/approve` as any, {});
          if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        }),
      );

      failedCount = results.filter((r) => r.status === 'rejected').length;

      await queryClient.invalidateQueries({ queryKey: ['financial-entries'] });

      return { success: failedCount === 0, failedCount };
    } finally {
      setIsApproving(false);
    }
  }, [queryClient]);

  return { approve, isApproving };
}
