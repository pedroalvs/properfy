import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/hooks/useApiQuery';
import { ApiError } from '@/lib/api-error';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { useSnackbar } from '@/hooks/useSnackbar';
import type { OfferAcceptState } from '../types';

interface AcceptResult {
  groupId: string;
  status: string;
  assignedInspectorId: string;
  appointmentsScheduled: number;
  acceptedAt: string;
}

export function useAcceptOffer() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, showInfo } = useSnackbar();
  const [states, setStates] = useState<Record<string, OfferAcceptState>>({});

  const getState = useCallback(
    (groupId: string): OfferAcceptState => states[groupId] ?? 'IDLE',
    [states],
  );

  const setState = useCallback((groupId: string, state: OfferAcceptState) => {
    setStates((prev) => ({ ...prev, [groupId]: state }));
  }, []);

  const startConfirm = useCallback(
    (groupId: string) => setState(groupId, 'CONFIRMING'),
    [setState],
  );

  const cancelConfirm = useCallback(
    (groupId: string) => setState(groupId, 'IDLE'),
    [setState],
  );

  const accept = useCallback(
    async (groupId: string) => {
      setState(groupId, 'ACCEPTING');

      const idempotencyKey = generateIdempotencyKey();

      try {
        await apiPost<{ data: AcceptResult }>(
          `/v1/marketplace/offers/${groupId}/accept`,
          {},
          { 'Idempotency-Key': idempotencyKey },
        );
        setState(groupId, 'ACCEPTED');
        showSuccess('You accepted the group!');
        queryClient.invalidateQueries({ queryKey: ['marketplace', 'offers'] });
        queryClient.invalidateQueries({ queryKey: ['inspector', 'schedule'] });
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409) {
            setState(groupId, 'CONFLICT');
            showInfo('Another inspector accepted first');
            return;
          }
          if (err.status === 410 || err.status === 404) {
            setState(groupId, 'GONE');
            showInfo('Offer no longer available');
            return;
          }
          if (err.code === 'AVAILABILITY_SLOT_NOT_MATCHED') {
            setState(groupId, 'ERROR');
            showError('No availability slot for this time window — update your availability in Profile');
            setTimeout(() => setState(groupId, 'IDLE'), 4000);
            return;
          }
        }
        setState(groupId, 'ERROR');
        showError('Failed to accept — try again');
        setTimeout(() => setState(groupId, 'IDLE'), 4000);
      }
    },
    [setState, queryClient],
  );

  return { getState, startConfirm, cancelConfirm, accept };
}
