import type { Page } from '@playwright/test';
import { blockExternal, blockUnmockedApi, stubJson } from './api';
import { INSPECTOR_ME } from './fixtures';

export { INSPECTOR_ME };

/**
 * The authenticated-boot stub set registered by {@link loginAsInspector}.
 *
 * Authenticated-boot API calls, owned collectively — every feature that adds one
 * adds its default stub HERE in the same PR (L-X03-05):
 *   - `GET /v1/me` (via `AuthProvider.fetchFullUser`).
 *   - `POST /v1/inspectors/me/app-state` — the F01-3 app-state heartbeat, fired from
 *     `PwaLayout` on every authenticated mount. Returns 204.
 *   - `GET /v1/inspectors/me` — F01-3 mounts `BaseAddressBanner` on the Schedule home
 *     (not only Profile), so this query now runs on every authenticated boot. Its
 *     default body is a LOCATED base, so the banner stays hidden by default; a spec
 *     that exercises the missing/legacy-base states overrides it (last-route-wins).
 */
export const BASELINE_STUBS: ReadonlyArray<{ path: string; body: unknown; status?: number }> = [
  { path: '/v1/me', body: INSPECTOR_ME },
  { path: '/v1/inspectors/me/app-state', body: null, status: 204 },
  {
    path: '/v1/inspectors/me',
    body: {
      data: {
        id: INSPECTOR_ME.inspectorId,
        fullName: INSPECTOR_ME.name,
        address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
        baseLat: -33.8688197,
        baseLng: 151.2092955,
        baseGeocodedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  },
];

export interface LoginOptions {
  /** Override the `/v1/me` body (e.g. a different inspector). */
  me?: unknown;
  /** Register `blockUnmockedApi` + `BASELINE_STUBS` (default true). */
  baseline?: boolean;
}

/**
 * Authenticate as an inspector by seeding tokens via `addInitScript` (so they are
 * present before the app boots — never via `goto('/login') + evaluate`). With
 * `baseline` (default), registers `blockUnmockedApi` FIRST, then the baseline stubs.
 * A spec that needs different behaviour for a baseline route registers its own stub
 * AFTER calling this (last route wins) without touching `BASELINE_STUBS`.
 */
export async function loginAsInspector(page: Page, opts: LoginOptions = {}): Promise<void> {
  const { me = INSPECTOR_ME, baseline = true } = opts;

  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'e2e-access-token');
    localStorage.setItem('refresh_token', 'e2e-refresh-token');
  });

  if (baseline) {
    await blockUnmockedApi(page);
    // Defense in depth: abort Mapbox tile/telemetry hosts. Hermeticity does not
    // depend on this (the map never initializes with an empty VITE_MAPBOX_TOKEN and
    // serviceWorkers are blocked), but it guarantees no external request can escape
    // even if a future screen changes how the map boots.
    await blockExternal(page);
    for (const stub of BASELINE_STUBS) {
      const body = stub.path === '/v1/me' ? me : stub.body;
      await stubJson(page, stub.path, body, stub.status ?? 200);
    }
  }
}
