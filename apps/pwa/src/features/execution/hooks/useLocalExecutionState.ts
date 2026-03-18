import { useState, useEffect, useCallback } from 'react';
import { saveExecutionState, getExecutionState, clearExecutionState } from '../lib/indexeddb';
import type { ExecutionState } from '../types';

const DEFAULT_STATE: Omit<ExecutionState, 'appointmentId'> = {
  phase: 'PRE_START',
  startLocation: null,
  finishLocation: null,
  checklistTemplate: [],
  checklistResponses: [],
  notes: '',
  assets: [],
  startedAt: null,
  errorMessage: null,
  lastSavedAt: null,
};

export function useLocalExecutionState(appointmentId: string) {
  const [state, setState] = useState<ExecutionState>({
    ...DEFAULT_STATE,
    appointmentId,
  });
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    getExecutionState(appointmentId).then((saved) => {
      if (saved) {
        setState(saved);
      }
      setIsRestored(true);
    });
  }, [appointmentId]);

  const updateState = useCallback(
    (updater: Partial<ExecutionState> | ((prev: ExecutionState) => ExecutionState)) => {
      setState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        saveExecutionState(appointmentId, next);
        return next;
      });
    },
    [appointmentId],
  );

  const clearState = useCallback(() => {
    clearExecutionState(appointmentId);
    setState({ ...DEFAULT_STATE, appointmentId });
  }, [appointmentId]);

  return { state, updateState, clearState, isRestored };
}
