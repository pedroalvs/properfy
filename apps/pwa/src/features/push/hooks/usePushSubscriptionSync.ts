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
}

async function resync(deps: PushSyncDeps): Promise<void> {
  if (!deps.hasServiceWorker() || !deps.hasPushManager() || !deps.hasNotification()) return;
  if (deps.getPermission() !== 'granted') return;
  try {
    const sub = await deps.getSubscription();
    if (!sub) return; // never subscribe from scratch during a resync
    const serverKey = deps.vapidPublicKey ? urlBase64ToUint8Array(deps.vapidPublicKey) : null;
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
 * worker reports `push-subscription-changed`. It never subscribes from scratch
 * (only an existing local subscription is re-POSTed); the single automatic
 * re-subscription is a VAPID key rotation with permission already granted
 * (L-F02-04). At most one POST per load per `userId`.
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
