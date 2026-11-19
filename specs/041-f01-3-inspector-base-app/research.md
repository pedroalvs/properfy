# Phase 0 — Research: F01-3 PWA

All decisions are inherited from the closed F01 decisions (D1–D19) and the accepted 2026-10-29 gaps (L-F01-*). There were **no open NEEDS CLARIFICATION** items. This file records the technical decisions that shape the PWA implementation.

## R-1 · Build-time app version injection

- **Decision**: Compute `__APP_VERSION__` at build time via a Vite `define`, using a pure helper `buildAppVersion(pkgVersion, sha?)` in `apps/pwa/src/lib/app-version.ts` that returns `` `${pkgVersion}+${(sha ?? 'dev').slice(0, 7)}` ``. CI injects `APP_BUILD_SHA: ${{ github.sha }}` into the three PWA build steps; local builds fall back to `dev`.
- **Rationale**: The footer and heartbeat must report a version traceable to the deployed commit (`pkg.version` only bumps on release). A pure helper is independently unit-testable and shared between `vite.config.ts` and the Vitest config, avoiding divergence. Reading `process.env.APP_BUILD_SHA` in the Node build (no `VITE_` prefix) keeps the SHA out of `import.meta.env`.
- **Alternatives considered**: Runtime fetch of a version endpoint (rejected — extra request, no offline value); hardcoded string (rejected — current "v1.0" is wrong and untraceable); `import.meta.env.VITE_*` (rejected — exposes to client env surface and the task forbids the prefix). The `+sha7` suffix is 8 chars, well within the backend `max(40)`.

## R-2 · Heartbeat throttle (client)

- **Decision**: `useAppStateHeartbeat()` triggered on mount and `visibilitychange`→visible, gated by a `localStorage` key `properfy.pwa.appStateHeartbeat = { at, displayMode }` written only on 204 (and on 429 to stop insisting). Send when `now - at ≥ 6h` OR `displayMode` differs. Storage and API are injected for testability. Errors/5xx do not write the key; all access is try/catch; logout clears the key.
- **Rationale**: The 6 h throttle bounds telemetry volume while the display-mode bypass captures the first standalone open promptly. Injecting storage + API is the established repo convention because jsdom `localStorage` is unreliable (memory: "jsdom localStorage"). Not writing on failure guarantees a retry; writing on 429 respects server backpressure.
- **Alternatives considered**: A background `setInterval` (rejected — wasteful, fires when hidden); a service-worker periodic sync (rejected — out of scope, uneven platform support); reading `displayMode` server-side (impossible — only the client knows the display mode).

## R-3 · Field visibility & typing of `/v1/inspectors/me`

- **Decision**: Type `useInspectorMe`/`useUpdateInspectorSelf` manually for the base fields and `baseGeocodeFailed`; do not read the base from `/v1/me`.
- **Rationale**: `/v1/inspectors/me` has no Fastify response schema (TASK-F01-1 risk note), so the client receives exactly what the use case returns with visibility already applied server-side. `/v1/me` uses `meResponseSchema`, which strips undeclared fields, so the base would never arrive there. No route schema changed → `api-types.ts` is not regenerated.
- **Alternatives considered**: Adding a response schema to `/v1/inspectors/me` (rejected — backend change, out of this PWA slice's scope, owned by F01-1); reading from `/v1/me` (rejected — fields stripped).

## R-4 · Legacy / incompatible saved address handling

- **Decision**: Pre-fill the card only when the saved `address` parses with `inspectorBaseAddressSchema`. Otherwise show empty fields + "Your saved address is incomplete. Please enter it again." and surface the raw value as reference. These legacy rows also show banner variant 2.
- **Rationale**: The AU-derived schema (L-F01-01) is stricter than the old free-text web form (`state:'New South Wales'`, `country≠AU`, `{foo:1}`). Never silently normalizing legacy data matches the backend contract (the backfill marks such rows `incompatible` and the app prompts a re-entry).
- **Alternatives considered**: Best-effort mapping of full state names to codes (rejected — guesswork, inconsistent with backend which does not normalize); blocking the app (rejected — D1: nothing blocks app use).

## R-5 · E2E hermeticity — baseline stub ownership

- **Decision**: Add BOTH `{ path: '/v1/inspectors/me/app-state', status: 204 }` AND `{ path: '/v1/inspectors/me', body: <located base> }` to `BASELINE_STUBS` in `apps/pwa/tests/e2e/support/auth.ts` in this PR.
- **Rationale**: The heartbeat is the first authenticated-boot API call added after X03. X03's harness uses `blockUnmockedApi`, so every authenticated spec would fail without the default stub. Crucially, F01-3 mounts `BaseAddressBanner` on the **Schedule home** (not only Profile), so `GET /v1/inspectors/me` now also runs on every authenticated boot — it is no longer a profile-only query, so it joins the baseline too (matching the F01 task's risk note). Its default body carries a located base so the banner is hidden by default and existing schedule specs are unchanged. This keeps `test-pwa-e2e` a real, fully-hermetic gate.
- **Alternatives considered**: Leaving `GET /v1/inspectors/me` out (rejected — the banner makes it a home-boot call; omitting it leaves a tolerated-but-real unmocked boot call on every schedule spec, against the harness's hermeticity rule); per-spec stubbing (rejected — both fire on every authenticated boot); disabling `blockUnmockedApi` (rejected — defeats hermeticity).

## R-6 · Banner placement & layout safety

- **Decision**: Mount `BaseAddressBanner` below the Schedule TopBar and above the install banners, and at the top of the Profile grid; render only when `useInspectorMe` is loaded and `baseLat == null`; non-sticky, scrolls with content.
- **Rationale**: Must not break the per-pane scroll in the wide two-pane layout (memory: "two-pane per-pane scroll", PR#1296). Gating on loaded state avoids a flash during boot and during error.
- **Alternatives considered**: A sticky/global banner (rejected — would fight per-pane scroll and the install banners); dismissable (rejected — D2: non-dismissable).
