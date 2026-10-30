/// <reference lib="webworker" />
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, type Strategy } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

/**
 * The runtime-caching routes carried over verbatim from the former
 * `generateSW` config in `vite.config.ts`. Exported as plain data so a unit
 * test can assert the full shape without running inside a service worker, and
 * so the API cache names stay in lockstep with `INSPECTOR_API_CACHES`
 * (`hooks/useAuth.ts`) that logout clears.
 *
 * The only intentional change vs. the `generateSW` behaviour is
 * `cacheableStatuses: [200]` on the two inspector API caches (L-X00-10): an
 * error response for the schedule/appointment endpoints must never poison the
 * offline copy. Font caches and the offers `NetworkOnly` route keep the Workbox
 * defaults.
 */
export type RuntimeCachingRoute = {
  urlPattern: RegExp;
  handler: 'CacheFirst' | 'NetworkFirst' | 'NetworkOnly';
  cacheName?: string;
  maxEntries?: number;
  maxAgeSeconds?: number;
  networkTimeoutSeconds?: number;
  cacheableStatuses?: number[];
};

export const RUNTIME_CACHING_ROUTES: RuntimeCachingRoute[] = [
  {
    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
    handler: 'CacheFirst',
    cacheName: 'google-fonts-cache',
    maxEntries: 10,
    maxAgeSeconds: 60 * 60 * 24 * 365,
  },
  {
    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
    handler: 'CacheFirst',
    cacheName: 'gstatic-fonts-cache',
    maxEntries: 10,
    maxAgeSeconds: 60 * 60 * 24 * 365,
  },
  {
    urlPattern: /\/v1\/inspector\/schedule/i,
    handler: 'NetworkFirst',
    cacheName: 'api-schedule-cache',
    maxEntries: 50,
    maxAgeSeconds: 60 * 60 * 24,
    networkTimeoutSeconds: 10,
    cacheableStatuses: [200],
  },
  {
    urlPattern: /\/v1\/inspector\/appointments\/.*/i,
    handler: 'NetworkFirst',
    cacheName: 'api-appointment-cache',
    maxEntries: 100,
    maxAgeSeconds: 5 * 60,
    networkTimeoutSeconds: 10,
    cacheableStatuses: [200],
  },
  {
    urlPattern: /\/v1\/marketplace\/offers/i,
    handler: 'NetworkOnly',
  },
];

function buildStrategy(route: RuntimeCachingRoute): Strategy {
  const plugins = [];
  if (route.maxEntries != null || route.maxAgeSeconds != null) {
    plugins.push(
      new ExpirationPlugin({
        maxEntries: route.maxEntries,
        maxAgeSeconds: route.maxAgeSeconds,
      }),
    );
  }
  if (route.cacheableStatuses) {
    plugins.push(new CacheableResponsePlugin({ statuses: route.cacheableStatuses }));
  }

  const options = { cacheName: route.cacheName, plugins };
  switch (route.handler) {
    case 'CacheFirst':
      return new CacheFirst(options);
    case 'NetworkFirst':
      return new NetworkFirst({ ...options, networkTimeoutSeconds: route.networkTimeoutSeconds });
    case 'NetworkOnly':
      return new NetworkOnly();
  }
}

/** Registers the 5 runtime-caching routes with Workbox. Called once from `sw.ts`. */
export function registerRuntimeCaching(): void {
  for (const route of RUNTIME_CACHING_ROUTES) {
    registerRoute(route.urlPattern, buildStrategy(route));
  }
}
