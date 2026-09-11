import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError, getErrorMessage, isNetworkError } from '@/lib/api-error';

export interface DeactivateResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface UseContactDeactivateReturn {
  deactivate: (contactId: string) => Promise<DeactivateResult>;
  reactivate: (contactId: string) => Promise<DeactivateResult>;
  isPending: boolean;
}

/**
 * Wraps the soft-delete + reactivate flows. Deactivation goes through the
 * dedicated POST :id/deactivate alias (mirrors the backend's QA-021-HIGH-002
 * surface); reactivation reuses PATCH `{ isActive: true }` since the backend
 * has no symmetric alias yet (FR-016 in spec 022).
 */
export function useContactDeactivate(): UseContactDeactivateReturn {
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();

  const deactivate = useCallback(async (contactId: string): Promise<DeactivateResult> => {
    setIsPending(true);
    try {
      try {
        const { error } = await api.POST(`/v1/contacts/${contactId}/deactivate` as any, { body: {} as any });
        if (error) {
          return {
            success: false,
            errorCode: (error as any)?.error?.code ?? 'UNKNOWN_ERROR',
            errorMessage: (error as any)?.error?.message ?? 'Request failed',
          };
        }
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        return { success: true };
      } catch (err) {
        // WI-5 (#202): a thrown network/API error must not escape as an
        // unhandled rejection — normalize it into the same failure shape.
        const apiError = toApiError(err);
        return {
          success: false,
          errorCode: apiError.code ?? (isNetworkError(apiError) ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR'),
          errorMessage: getErrorMessage(err, 'Failed to deactivate contact'),
        };
      }
    } finally {
      setIsPending(false);
    }
  }, [queryClient]);

  const reactivate = useCallback(async (contactId: string): Promise<DeactivateResult> => {
    setIsPending(true);
    try {
      try {
        const { error } = await api.PATCH(`/v1/contacts/${contactId}` as any, { body: { isActive: true } as any });
        if (error) {
          return {
            success: false,
            errorCode: (error as any)?.error?.code ?? 'UNKNOWN_ERROR',
            errorMessage: (error as any)?.error?.message ?? 'Request failed',
          };
        }
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        return { success: true };
      } catch (err) {
        const apiError = toApiError(err);
        return {
          success: false,
          errorCode: apiError.code ?? (isNetworkError(apiError) ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR'),
          errorMessage: getErrorMessage(err, 'Failed to reactivate contact'),
        };
      }
    } finally {
      setIsPending(false);
    }
  }, [queryClient]);

  return { deactivate, reactivate, isPending };
}
