import type { Page } from '@playwright/test';
import { blockExternal, blockUnmockedApi, stubJson, stubJsonPrefix } from './api';
import { DAY_PLAN_TODAY, INSPECTOR_ME, PROPERTY_FILES_EMPTY, PROPERTY_ISSUES_EMPTY } from './fixtures';

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
 *   - `GET /v1/inspectors/me/notices/unread-count` — F02-3 Profile-tab + tile unread
 *     badge, read from `BottomNavBar` (mounted on every authenticated screen).
 *   - `GET /v1/inspectors/me/push-config` — F02-3 `usePushSubscriptionSync` /
 *     `PushPreferenceCard`, fetched on every authenticated boot. `null` key = push
 *     unavailable (no VAPID), so the resync stays a no-op in tests.
 *   - `POST /v1/inspectors/me/push-subscriptions` — F02-3 resync POST; only fires
 *     with a real local subscription (never in the hermetic suite), stubbed 204 for
 *     safety so it can never hit the 501 catch-all.
 *   - `GET /v1/inspector/day-plans/{date}` — F04-3 Today-screen read. Added to the
 *     baseline by F04-3b (the first feature with specs that navigate to `/today`,
 *     which the Today screen reads on load). Registered below via a PREFIX route
 *     (the civil date segment changes daily), not a flat entry. Default = a
 *     published plan with one stop; a spec that needs another plan state overrides
 *     it (last route wins).
 *   - `GET /v1/property-files` + `GET /v1/property-issues` — F10-3 mounts the Files
 *     section in the appointment detail, which fetches both on render (not at boot,
 *     but on every detail screen). Default = empty lists so detail-opening specs
 *     stay quiet; the F10-3 spec overrides them (last route wins). stubJson matches
 *     the pathname only, so the presign/confirm/`:id/download` sub-paths are NOT
 *     shadowed by these entries.
 *   - `GET /v1/inspector/program` — F08-4 mounts the Challenges tile on the More hub
 *     (ProfilePage), which fetches the program on every Profile load. Returned
 *     DIRECTLY (no `{ data }` envelope). Default = an empty program; a spec that
 *     exercises Challenges content overrides it (last route wins).
 */
export const BASELINE_STUBS: ReadonlyArray<{ path: string; body: unknown; status?: number }> = [
  { path: '/v1/me', body: INSPECTOR_ME },
  { path: '/v1/inspectors/me/app-state', body: null, status: 204 },
  { path: '/v1/property-files', body: { data: PROPERTY_FILES_EMPTY } },
  { path: '/v1/property-issues', body: { data: PROPERTY_ISSUES_EMPTY } },
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
  { path: '/v1/inspectors/me/notices/unread-count', body: { data: { count: 0 } } },
  { path: '/v1/inspectors/me/push-config', body: { data: { vapidPublicKey: null } } },
  { path: '/v1/inspectors/me/push-subscriptions', body: null, status: 204 },
  {
    // F08-4 Challenges tile on the More hub — returned directly (no `{ data }` envelope).
    path: '/v1/inspector/program',
    body: {
      generatedAt: '2026-01-01T00:00:00.000Z',
      timezone: 'Australia/Sydney',
      summary: { openCashTotal: 0, currency: 'AUD' },
      activeGoals: [],
      standing: {
        index: { score: null, status: 'NOT_COMPUTED', snapshotDate: null },
        level: null,
        streak: { cycle: null, count: 0, atRisk: false },
      },
      awards: [],
      ranking: { myPosition: null, myScore: null, totalRanked: 0, notRankedReason: 'NOT_COMPUTED', cohortTooSmall: false, entries: [] },
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
    // Dated path → prefix route (see the BASELINE_STUBS doc for day-plans).
    await stubJsonPrefix(page, '/v1/inspector/day-plans/', { data: DAY_PLAN_TODAY });
  }
}
