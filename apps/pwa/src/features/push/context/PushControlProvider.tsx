import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useBrowserPushDeps } from '../hooks/useBrowserPushDeps';
import { usePushSubscription, type PushError, type PushState } from '../hooks/usePushSubscription';

/**
 * The single source of per-device push state and actions. Mounted once in
 * `PwaLayout` so the top-bar indicator, the app-wide enable modal, the
 * `/profile/settings` card and the tour's notifications step all read the SAME
 * `usePushSubscription` instance (one subscription probe, one consistent state)
 * instead of each spinning up its own hook.
 */
export interface PushControlValue {
  state: PushState;
  error: PushError;
  /** True when this device explicitly opted out of push (R2). */
  optedOut: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  /** Opt back in and enable (clears opt-out, requests permission, subscribes) + closes the modal. */
  requestEnable: () => Promise<void>;
  /** Persist an opt-out ("Agora não" / toggle off) without touching the subscription + closes the modal. */
  declinePersistently: () => void;
  isEnableModalOpen: boolean;
  openEnableModal: () => void;
  closeEnableModal: () => void;
}

const PushControlContext = createContext<PushControlValue | null>(null);

export function PushControlProvider({ children }: { children: ReactNode }) {
  const deps = useBrowserPushDeps();
  const { state, error, enable, disable } = usePushSubscription(deps);
  const [isEnableModalOpen, setEnableModalOpen] = useState(false);

  // Derived live from the store on every render rather than kept in local state:
  // every opt-out mutation (the settings toggle's enable/disable, the modal's Turn
  // on / Not now) changes `state` or the modal flag and so re-renders the provider,
  // re-reading the persisted value — so `optedOut` never drifts from `localStorage`.
  const optedOut = deps.getOptOut();

  const openEnableModal = useCallback(() => setEnableModalOpen(true), []);
  const closeEnableModal = useCallback(() => setEnableModalOpen(false), []);

  const requestEnable = useCallback(async () => {
    try {
      // `enable()` clears the opt-out in the store (then re-render picks it up).
      await enable();
    } finally {
      setEnableModalOpen(false);
    }
  }, [enable]);

  const declinePersistently = useCallback(() => {
    deps.setOptOut(true);
    setEnableModalOpen(false);
  }, [deps]);

  const value = useMemo<PushControlValue>(
    () => ({
      state,
      error,
      optedOut,
      enable,
      disable,
      requestEnable,
      declinePersistently,
      isEnableModalOpen,
      openEnableModal,
      closeEnableModal,
    }),
    [
      state,
      error,
      optedOut,
      enable,
      disable,
      requestEnable,
      declinePersistently,
      isEnableModalOpen,
      openEnableModal,
      closeEnableModal,
    ],
  );

  return <PushControlContext.Provider value={value}>{children}</PushControlContext.Provider>;
}

/** Read the push control context. Throws when used outside {@link PushControlProvider}. */
export function usePushControl(): PushControlValue {
  const ctx = useContext(PushControlContext);
  if (!ctx) {
    throw new Error('usePushControl must be used within a PushControlProvider');
  }
  return ctx;
}

export { PushControlContext };
