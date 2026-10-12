import { useEffect, useRef } from 'react';
import { TIMING } from '@properfy/frontend-standards';
import { saveExecutionState } from '../lib/indexeddb';
import type { ExecutionState } from '../types';

export function useAutoSave(state: ExecutionState) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (state.phase === 'PRE_START' || state.phase === 'DONE') return;

    const interval = setInterval(() => {
      const snapshot = JSON.stringify(stateRef.current);
      if (snapshot !== lastSavedRef.current) {
        const stateToSave = { ...stateRef.current, lastSavedAt: new Date().toISOString() };
        saveExecutionState(stateToSave.appointmentId, stateToSave)
          .then(() => {
            lastSavedRef.current = snapshot;
          })
          .catch(() => {
            // Keep the snapshot marked dirty so the next tick retries the write.
          });
      }
    }, TIMING.autoSaveInterval);

    return () => clearInterval(interval);
  }, [state.phase, state.appointmentId]);
}
