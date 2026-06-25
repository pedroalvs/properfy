import { useEffect, useRef } from 'react';
import { saveExecutionState } from '../lib/indexeddb';
import type { ExecutionState } from '../types';

const AUTO_SAVE_INTERVAL_MS = 2000;

export function useAutoSave(state: ExecutionState) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (state.phase === 'PRE_START' || state.phase === 'DONE') return;

    const interval = setInterval(() => {
      const snapshot = JSON.stringify(stateRef.current);
      if (snapshot !== lastSavedRef.current) {
        lastSavedRef.current = snapshot;
        const stateToSave = { ...stateRef.current, lastSavedAt: new Date().toISOString() };
        saveExecutionState(stateToSave.appointmentId, stateToSave);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [state.phase, state.appointmentId]);
}
