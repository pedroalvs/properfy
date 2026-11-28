import { resolvePwaUrl } from './resolve-pwa-url';

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string ?? 'http://localhost:3000',
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN as string ?? '',
  // Public URL of the Properfy Inspector app (PWA). Inspectors are redirected
  // here when they try to sign in on the web. Derived per environment from the
  // baked VITE_API_BASE_URL (see resolve-pwa-url.ts for why not a workflow var);
  // an explicit VITE_PWA_URL overrides it for local dev.
  pwaUrl: resolvePwaUrl(
    import.meta.env.VITE_PWA_URL as string | undefined,
    import.meta.env.VITE_API_BASE_URL as string | undefined,
  ),
} as const;
