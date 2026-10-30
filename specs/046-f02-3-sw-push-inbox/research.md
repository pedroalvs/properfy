# Phase 0 Research — F02-3

All product decisions were resolved upstream (F02 decisions D1–D27 in `fase2-etapa1/tarefas/F02-tarefas.md`). No `NEEDS CLARIFICATION` remained in the spec. Research here covers the technical choices for the PWA client.

## Decision: Workbox `injectManifest` with a split SW

- **Decision**: Replace `VitePWA` `generateSW` with `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`. `src/sw.ts` calls `self.skipWaiting()` + `clientsClaim()` + `cleanupOutdatedCaches()` + `precacheAndRoute(self.__WB_MANIFEST)` + a `NavigationRoute(createHandlerBoundToURL('index.html'))` + `registerRuntimeCaching()`, and adds `push`/`notificationclick`/`pushsubscriptionchange` listeners. Output stays `dist/sw.js`.
- **Rationale**: `generateSW` cannot host custom event listeners. `injectManifest` is the supported path for custom SWs and preserves precache/offline. Keeping the same output path makes rollback a plain revert.
- **Alternatives rejected**: `importScripts` of a hand-written SW (loses precache manifest injection); a second SW registration (two SWs fight for scope).

## Decision: direct `workbox-*` devDeps pinned to the plugin's Workbox

- **Decision**: Add `workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration` at the version `vite-plugin-pwa@0.21` bundles (~`^7.3.0`), verified against the lockfile before committing.
- **Rationale**: `injectManifest` compiles `src/sw.ts` with the app's imports; a version mismatch ships two Workbox copies in `dist/sw.js`.
- **Alternatives rejected**: relying on transitive hoisting (fragile, breaks on lockfile changes).

## Decision: SW types via `tsconfig.sw.json`

- **Decision**: A dedicated `tsconfig.sw.json` with `lib: ["WebWorker", "ES2022"]` for `src/sw.ts` + `src/sw/**`; exclude `src/sw.ts` from the main `tsconfig.json` (DOM lib). The `build`/`typecheck` scripts cover both via `tsc -b` or an explicit second project.
- **Rationale**: `WebWorker` lib conflicts with `DOM` in the app config; `PushSubscriptionChangeEvent` is not in `lib.webworker`, so declare it locally in `push-handlers.ts`.

## Decision: pure helpers vs. glue

- **Decision**: `src/sw/runtime-caching.ts`, `src/sw/push-handlers.ts`, `src/features/push/lib/vapid.ts` are pure and unit-tested; `src/sw.ts` is thin glue tested only by the build assertion + device QA.
- **Rationale**: jsdom cannot run a real SW; isolating pure logic makes the SW testable without a worker runtime.

## Decision: shared allowlist reused in the SW

- **Decision**: `push-handlers.ts` imports `isAllowedInspectorNoticeTargetPath` / `INSPECTOR_NOTICE_TARGET_PATTERNS` from `@properfy/shared`; no local path list or normalization.
- **Rationale**: D15/D24 — one allowlist for backend and SW. Rollup tree-shakes the rest of shared out of `dist/sw.js` (verify bundle has no zod).

## Decision: injectable browser APIs in hooks

- **Decision**: `usePushSubscription` / `usePushSubscriptionSync` take injectable `serviceWorker`/`Notification`/`PushManager`/API dependencies (default to globals) so jsdom tests can supply fakes; avoid `localStorage`.
- **Rationale**: jsdom lacks these APIs and has unreliable `localStorage` (memory `jsdom-localstorage-unreliable`).

## Decision: fixed state precedence (L-F02-05) and VAPID re-subscribe (L-F02-04)

- **Decision**: state resolved in order `ios-needs-install → unsupported → blocked → unavailable → on/off`; before reporting `on`, compare local `applicationServerKey` bytes with the server key and re-subscribe (granted) or unsubscribe (not granted) on mismatch.
- **Rationale**: matches the accepted plan premises; prevents a dead "on" after a key rotation and surfaces the iOS install path instead of a dead-end "unsupported".

## Decision: `cacheableResponse: [200]` on the two API caches (L-X00-10)

- **Decision**: Add `cacheableResponse: { statuses: [200] }` to `api-schedule-cache` and `api-appointment-cache` only.
- **Rationale**: stops error responses from poisoning the offline schedule; font caches and the offers `NetworkOnly` route keep Workbox defaults.
