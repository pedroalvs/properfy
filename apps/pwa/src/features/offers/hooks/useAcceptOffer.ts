import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError, toApiError, getErrorMessage } from '@/lib/api-error';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { OfferAcceptState } from '../types';

export function useAcceptOffer() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const [states, setStates] = useState<Record<string, OfferAcceptState>>({});
  const resetTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const getState = useCallback(
    (groupId: string): OfferAcceptState => states[groupId] ?? 'IDLE',
    [states],
  );

  const setState = useCallback((groupId: string, state: OfferAcceptState) => {
    setStates((prev) => ({ ...prev, [groupId]: state }));
  }, []);

  const clearResetTimer = useCallback((groupId: string) => {
    const existing = resetTimers.current.get(groupId);
    if (existing !== undefined) {
      clearTimeout(existing);
      resetTimers.current.delete(groupId);
    }
  }, []);

  const scheduleReset = useCallback(
    (groupId: string) => {
      clearResetTimer(groupId);
      const id = setTimeout(() => {
        resetTimers.current.delete(groupId);
        setState(groupId, 'IDLE');
      }, 4000);
      resetTimers.current.set(groupId, id);
    },
    [clearResetTimer, setState],
  );

  const startConfirm = useCallback(
    (groupId: string) => {
      // Clear any pending post-ERROR reset timer: reopening the confirm sheet
      // within the 4s window must not have the stale timer yank it back to IDLE.
      clearResetTimer(groupId);
      setState(groupId, 'CONFIRMING');
    },
    [clearResetTimer, setState],
  );

  const cancelConfirm = useCallback(
    (groupId: string) => {
      clearResetTimer(groupId);
      setState(groupId, 'IDLE');
    },
    [clearResetTimer, setState],
  );

  const accept = useCallback(
    async (groupId: string): Promise<OfferAcceptState> => {
      clearResetTimer(groupId);
      setState(groupId, 'ACCEPTING');

      const idempotencyKey = generateIdempotencyKey();

      try {
        // Typed against the generated contract (literal path + path params)
        // instead of a template-string call with a local response interface.
        const result = await api.POST('/v1/marketplace/offers/{groupId}/accept', {
          params: { path: { groupId } },
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        });
        // The endpoint declares only a 200, so `result.error` is typed `never`;
        // at runtime openapi-fetch still populates it (and a non-ok response) on
        // failure. Normalize into the same ApiError the branches below expect,
        // preserving the real HTTP status and the backend error code.
        if (result.error || result.response?.ok === false) {
          throw toApiError(result.error, result.response?.status);
        }
        setState(groupId, 'ACCEPTED');
        showSuccess('You accepted the group!');
        queryClient.invalidateQueries({ queryKey: ['marketplace', 'offers'] });
        queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
        return 'ACCEPTED';
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409) {
            setState(groupId, 'CONFLICT');
            showInfo('Another inspector accepted first');
            return 'CONFLICT';
          }
          if (err.status === 410 || err.status === 404) {
            setState(groupId, 'GONE');
            showInfo('Offer no longer available');
            return 'GONE';
          }
          if (err.code === 'AVAILABILITY_SLOT_NOT_MATCHED') {
            setState(groupId, 'ERROR');
            showError('No availability slot for this time window — update your availability in Profile');
            scheduleReset(groupId);
            return 'ERROR';
          }
        }
        setState(groupId, 'ERROR');
        showError(getErrorMessage(err, 'Failed to accept — try again'));
        scheduleReset(groupId);
        return 'ERROR';
      }
    },
    [setState, clearResetTimer, scheduleReset, queryClient],
  );

  useEffect(() => {
    return () => {
      resetTimers.current.forEach((id) => clearTimeout(id));
      resetTimers.current.clear();
    };
  }, []);

  return { getState, startConfirm, cancelConfirm, accept };
}
