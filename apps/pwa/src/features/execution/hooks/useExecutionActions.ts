import { useCallback, useRef, useState } from 'react';
import type { StartInspectionResponse } from '@properfy/shared';
import { useLocalExecutionState } from './useLocalExecutionState';
import { useStartInspection } from './useStartInspection';
import { useFinishInspection } from './useFinishInspection';
import type { CapturedLocation } from '../types';

export type FinishConfirmStep = 'SYNC' | 'PAST_TIME' | null;

export interface CheckOutContext {
  /** The appointment has a linked inspection app the inspector must sync first. */
  hasInspectionAppLink: boolean;
  /** The scheduled window has already ended (needs a past-time confirmation). */
  isPastScheduledEnd: boolean;
}

/**
 * The execution flow (check-in → check-out → finish) extracted from `ExecutionPage`
 * so the schedule card can drive the exact same IndexedDB `ExecutionState`. Two
 * independent writers of that state would drift; this hook is the single owner.
 *
 * `ExecutionPage` keeps its visible behaviour: PreStart → IN_PROGRESS → (proceed)
 * FINISHING → confirm steps → SUBMITTING → DONE/ERROR. The card uses `checkIn`
 * and `requestCheckOut` directly (two taps, D5) and renders the confirm modals
 * from `confirmStep`.
 */
export function useExecutionActions(appointmentId: string) {
  const { state, updateState, clearState, isRestored } = useLocalExecutionState(appointmentId);
  const startMutation = useStartInspection();
  const finishMutation = useFinishInspection();
  const [confirmStep, setConfirmStep] = useState<FinishConfirmStep>(null);
  const pendingRef = useRef<{ location: CapturedLocation; isPastScheduledEnd: boolean } | null>(null);

  // Check-in. Writes IN_PROGRESS only on success — a rejected check-in (e.g. a
  // 422 GEOFENCE_OUT_OF_RADIUS under BLOCK) leaves no local draft and the error
  // propagates so the caller can surface the server message.
  const checkIn = useCallback(
    async (location: CapturedLocation): Promise<StartInspectionResponse> => {
      const result = await startMutation.mutateAsync({ appointmentId, location });
      updateState({ phase: 'IN_PROGRESS', startLocation: location, startedAt: location.capturedAt });
      return result.data;
    },
    [appointmentId, startMutation, updateState],
  );

  const submit = useCallback(
    async (location: CapturedLocation) => {
      updateState({ phase: 'SUBMITTING', finishLocation: location });
      try {
        const result = await finishMutation.mutateAsync({ appointmentId, location });
        updateState({ phase: 'DONE', pendingSync: result.queued, errorMessage: null });
      } catch (err) {
        updateState({
          phase: 'ERROR',
          pendingSync: false,
          errorMessage: err instanceof Error ? err.message : 'Submission failed',
        });
      }
    },
    [appointmentId, finishMutation, updateState],
  );

  // Request check-out. Moves IN_PROGRESS → FINISHING (the card comes straight
  // from IN_PROGRESS; ExecutionPage is already FINISHING), then either asks for a
  // confirmation (app-sync, past-time) or submits the finish directly.
  const requestCheckOut = useCallback(
    (location: CapturedLocation, ctx: CheckOutContext) => {
      updateState((prev) => (prev.phase === 'IN_PROGRESS' ? { ...prev, phase: 'FINISHING' } : prev));
      if (ctx.hasInspectionAppLink) {
        pendingRef.current = { location, isPastScheduledEnd: ctx.isPastScheduledEnd };
        setConfirmStep('SYNC');
        return;
      }
      if (ctx.isPastScheduledEnd) {
        pendingRef.current = { location, isPastScheduledEnd: true };
        setConfirmStep('PAST_TIME');
        return;
      }
      submit(location);
    },
    [submit, updateState],
  );

  const confirmSync = useCallback(() => {
    const pending = pendingRef.current;
    if (pending?.isPastScheduledEnd) {
      setConfirmStep('PAST_TIME');
      return;
    }
    setConfirmStep(null);
    pendingRef.current = null;
    if (pending) submit(pending.location);
  }, [submit]);

  const confirmPastTime = useCallback(() => {
    const pending = pendingRef.current;
    setConfirmStep(null);
    pendingRef.current = null;
    if (pending) submit(pending.location);
  }, [submit]);

  const cancelConfirm = useCallback(() => {
    setConfirmStep(null);
    pendingRef.current = null;
  }, []);

  const proceedToFinish = useCallback(() => {
    updateState({ phase: 'FINISHING' });
  }, [updateState]);

  const retry = useCallback(() => {
    if (state.finishLocation) submit(state.finishLocation);
  }, [state.finishLocation, submit]);

  return {
    state,
    updateState,
    clearState,
    isRestored,
    checkIn,
    proceedToFinish,
    requestCheckOut,
    submit,
    retry,
    confirmStep,
    confirmSync,
    confirmPastTime,
    cancelConfirm,
    isStarting: startMutation.isPending,
    isSubmitting: finishMutation.isPending,
  };
}
