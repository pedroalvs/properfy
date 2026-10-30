/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { registerRuntimeCaching } from './sw/runtime-caching';
import {
  buildNotification,
  handleSubscriptionChange,
  resolveClickTarget,
  type PushSubscriptionChangeEvent,
} from './sw/push-handlers';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

// Preserve the former generateSW + autoUpdate behaviour.
self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Single-page-app navigation fallback (= navigateFallback: 'index.html').
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
// The 5 runtime-caching routes, same cache names as before.
registerRuntimeCaching();

self.addEventListener('push', (event) => {
  const { title, options } = buildNotification(event.data?.text() ?? null);
  event.waitUntil(
    (async () => {
      // Always show a notification: with userVisibleOnly, iOS revokes the
      // subscription if a push does not surface a notification.
      await self.registration.showNotification(title, options);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: 'inspector-notice:received' }));
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  event.waitUntil(resolveClickTarget(self, data?.url));
});

// The subscription expired or was rotated by the push service. The SW has no
// API token, so it only re-subscribes locally and messages the windows;
// usePushSubscriptionSync performs the server POST.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(handleSubscriptionChange(self, event as PushSubscriptionChangeEvent));
});
