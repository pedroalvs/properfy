import type { Page } from '@playwright/test';

/**
 * The single API origin every request targets (fixed in `webServer.env` as
 * `VITE_API_BASE_URL`). Nothing is ever really called — every `/v1/**` request is
 * either stubbed here or returned as 501 `E2E_UNMOCKED`.
 */
export const API = 'http://localhost:3000';

/**
 * Stub one API path with a JSON body. Matches by PATHNAME on the API origin
 * (query-string agnostic, and does not match sub-paths), so
 * `stubJson(page, '/v1/marketplace/offers', …)` never shadows `/offers/:id`.
 *
 * `page.route` matches the LAST registered route first, so a `stubJson` call made
 * AFTER `blockUnmockedApi` wins over the catch-all (this is the intended order).
 */
export function stubJson(page: Page, path: string, body: unknown, status = 200): Promise<void> {
  return page.route(
    (url) => url.origin === API && url.pathname === path,
    (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      }),
  );
}

/**
 * Origin-scoped catch-all: any unstubbed `${API}/v1/**` request is fulfilled with
 * 501 `E2E_UNMOCKED` and a readable `console.warn` (visible in the trace). A 501
 * never fails a test by itself — only an assertion that depends on the call does
 * (L-X03-05). MUST be registered FIRST (specific stubs are registered after and
 * win). It is scoped to the API origin, not a broad cross-origin glob, so it never
 * intercepts Mapbox tile URLs (which also carry a "/v1/" path segment).
 */
export function blockUnmockedApi(page: Page): Promise<void> {
  return page.route(
    (url) => url.origin === API && url.pathname.startsWith('/v1/'),
    (route) => {
      const req = route.request();
      // eslint-disable-next-line no-console
      console.warn(`[E2E_UNMOCKED] ${req.method()} ${req.url()}`);
      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'E2E_UNMOCKED', message: req.url() } }),
      });
    },
  );
}

/**
 * Defensive: abort Mapbox tiles/telemetry so a stray token never produces an
 * outbound request (the map also never initializes with an empty `VITE_MAPBOX_TOKEN`).
 */
export function blockExternal(page: Page): Promise<void> {
  return Promise.all([
    page.route('https://api.mapbox.com/**', (route) => route.abort()),
    page.route('https://events.mapbox.com/**', (route) => route.abort()),
  ]).then(() => undefined);
}
