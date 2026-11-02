import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearTourPending,
  isTourPendingFor,
  setTourPending,
  type PendingStorage,
} from '../lib/tour-pending-storage';

/**
 * Module-level "opened this load" guard. The tour opens at most once per app load
 * even when `localStorage` is unavailable (so completion cannot be persisted) and
 * across the gap between a successful completion POST and the profile refetch.
 * Reset only in tests.
 */
const loadGuard = { opened: false };
export function resetAppTourLoadGuard(): void {
  loadGuard.opened = false;
}

export interface TourControllerInputs {
  userId: string | null;
  /** `undefined` = still loading; `null` = not completed; string = completed. */
  onboardingCompletedAt: string | null | undefined;
  inspectorMeLoaded: boolean;
  isTodayRoute: boolean;
  planSettled: boolean;
  replayRequested: boolean;
}

export interface TourControllerDeps {
  storage?: PendingStorage;
  /** POST the app-state completion (3 heartbeat fields + `onboardingCompleted: true`). */
  postCompletion: () => Promise<void>;
  invalidateInspectorMe: () => void;
  isOnline?: () => boolean;
  /** True when a Sheet/Dialog is open (the tour defers until it closes). */
  hasOpenOverlay?: () => boolean;
}

export interface TourControllerResult {
  open: boolean;
  onFinish: (reason: 'completed' | 'skipped') => void;
}

export function useAppTourController(
  inputs: TourControllerInputs,
  deps: TourControllerDeps,
): TourControllerResult {
  const [open, setOpen] = useState(false);
  const modeRef = useRef<'auto' | 'replay' | null>(null);
  const postingRef = useRef(false);
  const { userId } = inputs;
  const { storage } = deps;

  const sendCompletion = useCallback(() => {
    if (postingRef.current || !userId) return;
    postingRef.current = true;
    deps
      .postCompletion()
      .then(() => {
        clearTourPending(storage);
        deps.invalidateInspectorMe();
      })
      .catch(() => {
        setTourPending(storage, userId);
      })
      .finally(() => {
        postingRef.current = false;
      });
  }, [deps, storage, userId]);

  // Open decision — re-evaluated on every render so a deferred open (blocking
  // overlay) is retried on the next render, per the spec edge case.
  useEffect(() => {
    if (open || modeRef.current) return;
    if (inputs.replayRequested) {
      modeRef.current = 'replay';
      setOpen(true);
      return;
    }
    if (loadGuard.opened) return;
    if (!userId || !inputs.inspectorMeLoaded) return;
    if (inputs.onboardingCompletedAt != null) return;
    if (isTourPendingFor(storage, userId)) return;
    if (!inputs.isTodayRoute || !inputs.planSettled) return;
    if (deps.hasOpenOverlay?.()) return;
    loadGuard.opened = true;
    modeRef.current = 'auto';
    setOpen(true);
  });

  // Retry a pending completion on mount and when connectivity returns.
  useEffect(() => {
    const retry = () => {
      if (!userId || !isTourPendingFor(storage, userId)) return;
      if (inputs.onboardingCompletedAt != null) {
        clearTourPending(storage);
        return;
      }
      if (deps.isOnline && !deps.isOnline()) return;
      sendCompletion();
    };
    retry();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [userId, inputs.onboardingCompletedAt, storage, deps, sendCompletion]);

  const onFinish = useCallback(
    (_reason: 'completed' | 'skipped') => {
      const wasReplay = modeRef.current === 'replay';
      setOpen(false);
      modeRef.current = null;
      if (wasReplay) return;
      sendCompletion();
    },
    [sendCompletion],
  );

  return { open, onFinish };
}
