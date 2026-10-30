import { useCallback, useEffect, useRef, useState } from 'react';
import { keysEqual, urlBase64ToUint8Array } from '../lib/vapid';

/**
 * Per-device push state. Resolved by the fixed precedence (L-F02-05, D21):
 *   ios-needs-install → unsupported → blocked → unavailable → on/off
 * with `loading` while the VAPID config and the local subscription are read,
 * and the transient `enabling`/`disabling`.
 */
export type PushState =
  | 'loading'
  | 'ios-needs-install'
  | 'unsupported'
  | 'blocked'
  | 'unavailable'
  | 'on'
  | 'off'
  | 'enabling'
  | 'disabling';

export type PushError = 'save-failed' | null;

/**
 * Everything the hook touches, injected so it is fully testable in jsdom (which
 * has no `PushManager`/`Notification`/`navigator.serviceWorker`). The browser
 * wiring lives in `createBrowserPushDeps`.
 */
export interface PushDeps {
  isIosSafariEligible: () => boolean;
  isStandalone: () => boolean;
  hasServiceWorker: () => boolean;
  hasPushManager: () => boolean;
  hasNotification: () => boolean;
  getPermission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  /** Server VAPID public key (null = not configured); `loading` while fetched. */
  vapidPublicKey: string | null;
  vapidLoading: boolean;
  getSubscription: () => Promise<PushSubscription | null>;
  subscribe: (applicationServerKey: Uint8Array) => Promise<PushSubscription>;
  saveSubscription: (subscription: PushSubscription) => Promise<void>;
  removeSubscription: (endpoint: string) => Promise<void>;
}

export interface UsePushSubscriptionResult {
  state: PushState;
  error: PushError;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

/** The sync part of the precedence; returns null when it needs the async on/off probe. */
function resolveStaticState(deps: PushDeps): PushState | null {
  if (deps.isIosSafariEligible() && !deps.isStandalone()) return 'ios-needs-install';
  if (!deps.hasServiceWorker() || !deps.hasPushManager() || !deps.hasNotification()) {
    return 'unsupported';
  }
  if (deps.getPermission() === 'denied') return 'blocked';
  if (deps.vapidLoading) return 'loading';
  if (deps.vapidPublicKey === null) return 'unavailable';
  return null;
}

export function usePushSubscription(deps: PushDeps): UsePushSubscriptionResult {
  const [state, setState] = useState<PushState>('loading');
  const [error, setError] = useState<PushError>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Snapshot the environment inputs so the resolver effect has a static,
  // lint-checkable dependency array (no inline calls in the deps list).
  const permission = deps.getPermission();
  const standalone = deps.isStandalone();
  const iosEligible = deps.isIosSafariEligible();
  const hasServiceWorker = deps.hasServiceWorker();
  const hasPushManager = deps.hasPushManager();
  const hasNotification = deps.hasNotification();

  // Resolve on/off (with the L-F02-04 VAPID key check) once the static precedence
  // falls through to the subscription probe.
  useEffect(() => {
    let cancelled = false;
    const d = deps;
    const staticState = resolveStaticState(d);
    if (staticState) {
      setState(staticState);
      return;
    }
    const vapidKey = d.vapidPublicKey as string; // non-null past resolveStaticState
    void (async () => {
      try {
        const sub = await d.getSubscription();
        if (cancelled) return;
        if (!sub) {
          setState('off');
          return;
        }
        const serverKey = urlBase64ToUint8Array(vapidKey);
        const localKey = sub.options.applicationServerKey;
        // A null local key (older browsers) means we cannot compare — keep it on.
        if (localKey && !keysEqual(localKey, serverKey)) {
          // VAPID rotated. Re-subscribe only if permission is already granted
          // (no gesture needed); otherwise drop the dead local subscription.
          await sub.unsubscribe().catch(() => undefined);
          if (d.getPermission() === 'granted') {
            const fresh = await d.subscribe(serverKey);
            await d.saveSubscription(fresh);
            if (!cancelled) setState('on');
          } else if (!cancelled) {
            setState('off');
          }
          return;
        }
        setState('on');
      } catch {
        if (!cancelled) {
          setState('off');
          setError('save-failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deps.vapidPublicKey,
    deps.vapidLoading,
    permission,
    standalone,
    iosEligible,
    hasServiceWorker,
    hasPushManager,
    hasNotification,
  ]);

  const enable = useCallback(async () => {
    const d = depsRef.current;
    if (d.vapidPublicKey === null) return;
    setError(null);
    setState('enabling');
    const permission = await d.requestPermission();
    if (permission !== 'granted') {
      // Only an explicit 'denied' is blocked. A dismissed prompt stays 'default',
      // which is still toggleable — showing 'blocked' there would be false and
      // would not self-recover (the permission snapshot is unchanged).
      setState(permission === 'denied' ? 'blocked' : 'off');
      return;
    }
    let sub: PushSubscription | null = null;
    try {
      sub = await d.subscribe(urlBase64ToUint8Array(d.vapidPublicKey));
      await d.saveSubscription(sub);
      setState('on');
    } catch {
      // Roll back the local subscription so the device state matches the server.
      if (sub) await sub.unsubscribe().catch(() => undefined);
      setState('off');
      setError('save-failed');
    }
  }, []);

  const disable = useCallback(async () => {
    const d = depsRef.current;
    setError(null);
    setState('disabling');
    const sub = await d.getSubscription().catch(() => null);
    if (sub) {
      // Tell the server first (its middleware reads a token we still have), then
      // drop the local subscription even if the POST failed (offline path).
      await d.removeSubscription(sub.endpoint).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
    setState('off');
  }, []);

  return { state, error, enable, disable };
}
