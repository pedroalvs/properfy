# Contract — `apps/pwa/tests/e2e/support/` harness API

This is the exported surface the E2E specs and the future F04-3b tour specs consume. Names are a
contract; changing them means updating every consumer. All modules are TypeScript ESM.

## `api.ts`

```ts
export const API = 'http://localhost:3000';

// Register a JSON stub for one API path (query-aware via pathname predicate where needed).
export function stubJson(page: Page, path: string, body: unknown, status = 200): Promise<void>;

// Origin-scoped catch-all: any unstubbed `${API}/v1/**` → 501 { error: { code:'E2E_UNMOCKED', message:url } }
// plus console.warn(`[E2E_UNMOCKED] <METHOD> <url>`). MUST be registered FIRST (last route wins),
// and is idempotent per page. NEVER use the `**/v1/**` glob (it would catch api.mapbox.com/styles/v1).
export function blockUnmockedApi(page: Page): Promise<void>;

// Defensive: abort https://api.mapbox.com/** and https://events.mapbox.com/**.
export function blockExternal(page: Page): Promise<void>;
```

Rules: `/v1/me` is **plain** (no `data` envelope). A `501 E2E_UNMOCKED` does not fail a test by
itself — only an assertion that depends on the call fails (L-X03-05). No `window.fetch` monkey-patch
(openapi-fetch captures `fetch` at client creation).

## `auth.ts`

```ts
export { INSPECTOR_ME } from './fixtures';

// The authenticated-boot stub set, registered by loginAsInspector. Owned collectively: every feature
// that adds an authenticated-boot API call adds its default stub here in the SAME PR (L-X03-05).
export const BASELINE_STUBS: ReadonlyArray<{ path: string; body: unknown; status?: number }>;
//  Verified @origin/develop ea3886c9: the ONLY authenticated-boot call is GET /v1/me.
//  GET  /v1/me                      -> INSPECTOR_ME (overridable via opts.me)
//  (POST /v1/inspectors/me/app-state — F01 heartbeat — is NOT in this snapshot; added to the
//   baseline by the PR that lands F01. GET /v1/inspectors/me is a profile-screen query, not boot.)

// Writes access_token/refresh_token via page.addInitScript (NOT goto+evaluate). With baseline=true,
// registers blockUnmockedApi then BASELINE_STUBS (me replaced by opts.me). A spec needing different
// behavior registers its stub AFTER loginAsInspector (last route wins) without touching the baseline.
export function loginAsInspector(
  page: Page,
  opts?: { me?: unknown; baseline?: boolean },
): Promise<void>;
```

## `projects.ts`

```ts
export const WIDE_PROJECTS = ['Tablet (iPad portrait)', 'Foldable open'] as const;
export function isWideProject(testInfo: TestInfo): boolean;   // WIDE_PROJECTS.includes(name)
export function isWebKitProject(testInfo: TestInfo): boolean; // browserName === 'webkit'
export function skipOnWide(reason: string): void;             // test.skip wrapper, reason required
export function skipOnPhone(reason: string): void;            // test.skip wrapper, reason required
```

Sole source of per-project restriction. Specs never read `viewport.width`, `isMobile`, or
`project.name` directly (all 4 projects set `isMobile:true`, so it distinguishes nothing). Tour specs
(F04-3b) run on the two phone projects only via `skipOnWide('tour targets are phone-layout anchors')`.

## `idb.ts`

```ts
// goto('/login') (public route; /v1/me is already baseline-stubbed by loginAsInspector) + awaited
// evaluate with openDB('properfy-pwa', 1) writing into 'execution-states' (phase:'FINISHING').
// Caller: loginAsInspector(page) -> seedExecutionState(page, state) -> goto('/execution/:id').
// NEVER seed IndexedDB in addInitScript (races the app's openDB) (L-X03-06).
export function seedExecutionState(page: Page, state: ExecutionState): Promise<void>;
```

## `fixtures.ts`

Pure response fixtures (no `@playwright/test` import), matching the shared schemas — see
[data-model.md](../data-model.md). Imported by `auth.ts`, `api.ts`, the specs, and the Vitest
validator.

## `global-setup.ts`

Playwright `globalSetup`: throws
`Error('Build workspace packages first: pnpm --filter @properfy/shared build && pnpm --filter @properfy/frontend-standards build')`
when `packages/shared/dist/index.js` or `packages/frontend-standards/dist/index.js` is absent
(path relative to `__dirname`). Does **not** build (so a stale `dist/` is not hidden).
