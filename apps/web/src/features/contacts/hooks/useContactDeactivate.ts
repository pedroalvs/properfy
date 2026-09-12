import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { toApiError, getErrorMessage, isNetworkError } from '@/lib/api-error';

export interface DeactivateResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/** Backend error envelope shape (openapi-fetch types these routes' `error` loosely). */
type ApiErrorEnvelope = { error?: { code?: string; message?: string } };

function toEnvelopeFailure(error: unknown, fallbackMessage: string): DeactivateResult {
  const envelope = error as ApiErrorEnvelope;
  return {
    success: false,
    errorCode: envelope?.error?.code ?? 'UNKNOWN_ERROR',
    errorMessage: envelope?.error?.message ?? fallbackMessage,
  };
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
        const { error } = await api.POST('/v1/contacts/{contactId}/deactivate', {
          params: { path: { contactId } },
        });
        if (error) return toEnvelopeFailure(error, 'Request failed');
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
        const { error } = await api.PATCH('/v1/contacts/{contactId}', {
          params: { path: { contactId } },
          body: { isActive: true },
        });
        if (error) return toEnvelopeFailure(error, 'Request failed');
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
