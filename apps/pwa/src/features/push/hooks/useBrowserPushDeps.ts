import { getIsIosSafariEligible, getIsStandalone } from '@/app/useInstallPrompt';
import { apiPost, useListQuery, type SuccessResponse } from '@/hooks/useApiQuery';
import type { PushConfigResponse } from '@properfy/shared';
import type { PushDeps } from './usePushSubscription';

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

/**
 * Builds the real browser-backed {@link PushDeps} for `usePushSubscription`:
 * capability probes, the OS permission, the `PushManager` subscription calls and
 * the server subscribe/unsubscribe POSTs. The VAPID public key comes from
 * `GET /push-config` (focus-refetched so a server key rotation is picked up).
 */
export function useBrowserPushDeps(): PushDeps {
  const config = useListQuery<SuccessResponse<PushConfigResponse>>(
    ['inspector-notices', 'push-config'],
    '/v1/inspectors/me/push-config',
    undefined,
    { staleTime: 60_000, refetchOnWindowFocus: true },
  );

  return {
    isIosSafariEligible: getIsIosSafariEligible,
    isStandalone: getIsStandalone,
    hasServiceWorker: () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPushManager: () => typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification: () => typeof window !== 'undefined' && 'Notification' in window,
    getPermission: () => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'),
    requestPermission: () => Notification.requestPermission(),
    vapidPublicKey: config.data?.data.vapidPublicKey ?? null,
    vapidLoading: config.isLoading,
    getSubscription: async () => (await readyRegistration()).pushManager.getSubscription(),
    subscribe: async (applicationServerKey) =>
      (await readyRegistration()).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      }),
    saveSubscription: async (subscription) => {
      await apiPost('/v1/inspectors/me/push-subscriptions', subscription.toJSON());
    },
    removeSubscription: async (endpoint) => {
      await apiPost('/v1/inspectors/me/push-subscriptions/unsubscribe', { endpoint });
    },
  };
}
