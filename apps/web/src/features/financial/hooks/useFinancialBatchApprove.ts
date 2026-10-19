import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

export interface UseFinancialBatchApproveReturn {
  approve: (ids: string[]) => Promise<{ 
    success: boolean; 
    failedCount: number; 
    errors: Array<{ id: string; message: string; code?: string }>;
  }>;
  isApproving: boolean;
}

export function useFinancialBatchApprove(): UseFinancialBatchApproveReturn {
  const [isApproving, setIsApproving] = useState(false);
  const queryClient = useQueryClient();

  const approve = useCallback(async (ids: string[]) => {
    setIsApproving(true);
    const errors: Array<{ id: string; message: string; code?: string }> = [];

    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const { error, response } = await api.POST('/v1/financial/entries/{entryId}/approve', {
            params: { path: { entryId: id } },
          });
          if (error) {
            const apiError = toApiError(error, (response as Response | undefined)?.status);
            throw {
              id,
              message: apiError.message || 'Request failed',
              code: apiError.code,
              status: apiError.status,
            };
          }
        }),
      );

      results.forEach((r) => {
        if (r.status === 'rejected') {
          errors.push(r.reason);
        }
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['financial-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['financial-entries', 'summary'] }),
      ]);

      return { 
        success: errors.length === 0, 
        failedCount: errors.length,
        errors
      };
    } finally {
      setIsApproving(false);
    }
  }, [queryClient]);

  return { approve, isApproving };
}
