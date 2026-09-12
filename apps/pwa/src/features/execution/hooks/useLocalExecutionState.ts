import { useState, useEffect, useCallback, useRef } from 'react';
import { saveExecutionState, getExecutionState, clearExecutionState } from '../lib/indexeddb';
import type { ExecutionState } from '../types';

const DEFAULT_STATE: Omit<ExecutionState, 'appointmentId'> = {
  phase: 'PRE_START',
  pendingSync: false,
  startLocation: null,
  finishLocation: null,
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
  // Only a genuine updateState() should persist. Restore and clearState also
  // commit new `state`, and persisting those from the effect would (a) resurrect
  // a row clearState just deleted and (b) write a DEFAULT row on fresh mount.
  const shouldPersistRef = useRef(false);

  useEffect(() => {
    getExecutionState(appointmentId).then((saved) => {
      if (saved) {
        setState(saved);
      }
      setIsRestored(true);
    });
  }, [appointmentId]);

  // Persist from an effect keyed on the committed `state`, not from inside the
  // `setState` updater — React (StrictMode in particular) can invoke an updater
  // function more than once per commit, which would double-write to IndexedDB.
  // The ref gate ensures we persist exactly the state changes updateState made,
  // never a restore or a clear.
  useEffect(() => {
    if (!isRestored || !shouldPersistRef.current) return;
    shouldPersistRef.current = false;
    saveExecutionState(appointmentId, state);
  }, [appointmentId, isRestored, state]);

  const updateState = useCallback(
    (updater: Partial<ExecutionState> | ((prev: ExecutionState) => ExecutionState)) => {
      shouldPersistRef.current = true;
      setState((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
    },
    [],
  );

  const clearState = useCallback(() => {
    // Ensure the DEFAULT commit below is not persisted back by the effect.
    shouldPersistRef.current = false;
    clearExecutionState(appointmentId);
    setState({ ...DEFAULT_STATE, appointmentId });
  }, [appointmentId]);

  return { state, updateState, clearState, isRestored };
}
