import type { Page } from '@playwright/test';
import { blockExternal, blockUnmockedApi, stubJson } from './api';
import { INSPECTOR_ME } from './fixtures';

export { INSPECTOR_ME };

/**
 * The authenticated-boot stub set registered by {@link loginAsInspector}.
 *
 * Verified against `origin/develop` @ea3886c9: the ONLY authenticated-boot API
 * call is `GET /v1/me` (via `AuthProvider.fetchFullUser`). This list is owned
 * collectively — every feature that adds an authenticated-boot API call adds its
 * default stub HERE in the same PR (L-X03-05). F01's
 * `POST /v1/inspectors/me/app-state` heartbeat is not in this snapshot; it joins
 * the baseline in the PR that lands it. `GET /v1/inspectors/me` is a profile-screen
 * query, not a boot call, so it is not in the baseline.
 */
export const BASELINE_STUBS: ReadonlyArray<{ path: string; body: unknown; status?: number }> = [
  { path: '/v1/me', body: INSPECTOR_ME },
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
