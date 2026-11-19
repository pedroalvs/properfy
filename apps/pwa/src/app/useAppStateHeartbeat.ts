import { useEffect, useRef } from 'react';
import type { InspectorAppStateInput } from '@properfy/shared';
import { api } from '@/services/api';
import { getIsStandalone } from './useInstallPrompt';

/** localStorage throttle key: `{ at, displayMode }` of the last 204/429 send. */
export const APP_STATE_HEARTBEAT_KEY = 'properfy.pwa.appStateHeartbeat';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

type DisplayMode = InspectorAppStateInput['displayMode'];
type PushPermission = InspectorAppStateInput['pushPermission'];

interface StoredBeat {
  at: number;
  displayMode: DisplayMode;
}

/** Injectable collaborators — the hook is driven with fakes in tests. */
export interface AppStateHeartbeatDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  send?: (payload: InspectorAppStateInput) => Promise<{ status: number }>;
  now?: () => number;
  getDisplayMode?: () => DisplayMode;
  getPushPermission?: () => PushPermission;
  appVersion?: string;
}

function readPushPermission(): PushPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushPermission;
}

async function defaultSend(payload: InspectorAppStateInput): Promise<{ status: number }> {
  const { response } = await api.POST('/v1/inspectors/me/app-state', { body: payload });
  return { status: response.status };
}

/**
 * Reports the installed-app state (display mode, push permission, version) to
 * `POST /v1/inspectors/me/app-state`, at most once per 6 h per device (contract
 * 00.10). Called from `PwaLayout` for an authenticated inspector.
 *
 * Throttle: a `localStorage` entry written only on a 204 (success) or 429
 * (rate-limited — stop insisting). A beat is sent on mount and when the tab becomes
 * visible, when `now - at ≥ 6h` OR the `displayMode` changed (so the first
 * standalone open is captured promptly). Network errors / 5xx do not write the
 * entry, so the next trigger retries. All storage access is guarded; with no usable
 * storage, at most one beat is sent per app load. Errors never surface in the UI.
 */
export function useAppStateHeartbeat(deps: AppStateHeartbeatDeps = {}): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  // No usable storage → at most one beat per app load (this hook instance).
  const sentWithoutStorageRef = useRef(false);

  useEffect(() => {
    const resolve = () => {
      const d = depsRef.current;
      return {
        storage: d.storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined),
        send: d.send ?? defaultSend,
        now: d.now ?? (() => Date.now()),
        getDisplayMode: d.getDisplayMode ?? ((): DisplayMode => (getIsStandalone() ? 'standalone' : 'browser')),
        getPushPermission: d.getPushPermission ?? readPushPermission,
        appVersion: d.appVersion ?? __APP_VERSION__,
      };
    };

    const doSend = async (mode: DisplayMode, persist: boolean) => {
      const r = resolve();
      try {
        const { status } = await r.send({
          displayMode: mode,
          pushPermission: r.getPushPermission(),
          appVersion: r.appVersion,
        });
        if ((status === 204 || status === 429) && persist && r.storage) {
          try {
            r.storage.setItem(APP_STATE_HEARTBEAT_KEY, JSON.stringify({ at: r.now(), displayMode: mode }));
          } catch {
            /* storage write unavailable — tolerated */
          }
        }
      } catch {
        // Network error or 5xx that rejects: do not persist, so the next trigger
        // retries. Silent — telemetry must never affect the UI.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[appStateHeartbeat] send failed');
        }
      }
    };

    const maybeSend = () => {
      const r = resolve();
      const mode = r.getDisplayMode();

      let storageOk = true;
      let raw: string | null = null;
      if (r.storage) {
        try {
          raw = r.storage.getItem(APP_STATE_HEARTBEAT_KEY);
        } catch {
          storageOk = false;
        }
      } else {
        storageOk = false;
      }

      if (!storageOk) {
        if (sentWithoutStorageRef.current) return;
        sentWithoutStorageRef.current = true;
        void doSend(mode, false);
        return;
      }

      let stored: StoredBeat | null = null;
      if (raw) {
        try {
          stored = JSON.parse(raw) as StoredBeat;
        } catch {
          stored = null;
        }
      }

      const due = !stored || r.now() - stored.at >= SIX_HOURS_MS || stored.displayMode !== mode;
      if (due) void doSend(mode, true);
    };

    maybeSend();

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') maybeSend();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // Mount-only: triggers are mount + visibilitychange; deps are read via depsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
