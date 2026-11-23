import { useEffect, useRef } from 'react';
import { keysEqual, urlBase64ToUint8Array } from '../lib/vapid';

/**
 * The subset of push dependencies the resync needs (a `PushDeps` is structurally
 * assignable, so `PwaLayout` can pass the same `useBrowserPushDeps()` object).
 */
export interface PushSyncDeps {
  hasServiceWorker: () => boolean;
  hasPushManager: () => boolean;
  hasNotification: () => boolean;
  getPermission: () => NotificationPermission;
  vapidPublicKey: string | null;
  getSubscription: () => Promise<PushSubscription | null>;
  subscribe: (applicationServerKey: Uint8Array) => Promise<PushSubscription>;
  saveSubscription: (subscription: PushSubscription) => Promise<void>;
  /** Per-device opt-out (R2). An opted-out device is never auto-subscribed. */
  getOptOut: () => boolean;
}

async function resync(deps: PushSyncDeps): Promise<void> {
  if (!deps.hasServiceWorker() || !deps.hasPushManager() || !deps.hasNotification()) return;
  if (deps.getPermission() !== 'granted') return;
  try {
    const sub = await deps.getSubscription();
    const serverKey = deps.vapidPublicKey ? urlBase64ToUint8Array(deps.vapidPublicKey) : null;
    if (!sub) {
      // R1 default-on: the OS permission is already granted, so no user gesture is
      // needed. Subscribe from scratch unless this device opted out or the server
      // has no VAPID key to subscribe with.
      if (deps.getOptOut() || !serverKey) return;
      const fresh = await deps.subscribe(serverKey);
      await deps.saveSubscription(fresh);
      return;
    }
    const localKey = sub.options.applicationServerKey;
    // Server VAPID key rotated (and we can compare): re-subscribe with the new
    // key, then POST the fresh subscription. Without a server key (config failed
    // or push not configured) fall back to POSTing the current subscription.
    if (serverKey && localKey && !keysEqual(localKey, serverKey)) {
      await sub.unsubscribe().catch(() => undefined);
      const fresh = await deps.subscribe(serverKey);
      await deps.saveSubscription(fresh);
      return;
    }
    await deps.saveSubscription(sub);
  } catch {
    // Silent: the next load or SW message retries.
  }
}

/**
 * Keeps this device's push subscription registered with the server on every
 * authenticated app load (mounted in `PwaLayout`) and whenever the service
 * worker reports `push-subscription-changed`. Push is default-on (R1): when the
 * OS permission is already granted and the device has not opted out, it
 * subscribes from scratch (no gesture needed) as well as re-POSTing an existing
 * subscription and re-subscribing on a VAPID rotation (L-F02-04). An opted-out
 * device is never auto-subscribed. At most one POST per load per `userId`.
 */
export function usePushSubscriptionSync(userId: string | null, deps: PushSyncDeps): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const syncedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (syncedUserRef.current !== userId) {
      syncedUserRef.current = userId;
      void resync(depsRef.current);
    }
  }, [userId]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    if (!container) return;
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === 'push-subscription-changed') {
        void resync(depsRef.current);
      }
    };
    container.addEventListener('message', handler);
    return () => container.removeEventListener('message', handler);
  }, []);
}
