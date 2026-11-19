# Tasks: PWA Service Worker, Web Push & Announcements Inbox (F02-3)

**Branch**: `046-f02-3-sw-push-inbox` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

TDD is mandatory (constitution III): every implementation task is preceded by its red tests. All paths are under `apps/pwa/` unless noted. Shared is already built; rebuild it after any (none expected) shared change.

## Phase 1: Setup

- [ ] T001 Add workbox devDeps (`workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`) at the version `vite-plugin-pwa@0.21` bundles (verify against `pnpm-lock.yaml`) in `apps/pwa/package.json`; run `pnpm install`.
- [ ] T002 Create `apps/pwa/tsconfig.sw.json` (`lib: ["WebWorker","ES2022"]`, includes `src/sw.ts` + `src/sw/**`) and exclude `src/sw.ts`/`src/sw/**` worker glue from the main `apps/pwa/tsconfig.json`; wire `typecheck`/`build` scripts to cover both projects.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T003 [P] Red tests for `src/features/push/lib/vapid.ts` in `src/features/push/lib/__tests__/vapid.test.ts`: `urlBase64ToUint8Array` with/without padding; `keysEqual(ArrayBuffer, Uint8Array)` true for equal bytes, false for different length/byte, false for null.
- [ ] T004 [P] Red test for `src/sw/runtime-caching.ts` in `src/sw/__tests__/runtime-caching.test.ts`: exactly the 5 routes in order with matching patterns/strategies/`cacheName`/`maxEntries`/`maxAgeSeconds`/`networkTimeoutSeconds`; `cacheableResponse:{statuses:[200]}` on the 2 API caches only; cache names equal `INSPECTOR_API_CACHES` from `useAuth.tsx`.
- [ ] T005 Implement `src/features/push/lib/vapid.ts` (`urlBase64ToUint8Array`, `keysEqual`) — green T003.
- [ ] T006 Export `INSPECTOR_API_CACHES` from `src/hooks/useAuth.tsx`; implement `src/sw/runtime-caching.ts` `registerRuntimeCaching()` (5 routes, `cacheableResponse:[200]` on the 2 API caches) — green T004.

## Phase 3: User Story 1 — Announcements inbox + badge (P1)

**Goal**: inspector reads announcements, sees unread marking and badges, opening marks read. **Independent test**: with push off, publish a notice → appears in inbox, badge shows count, open marks read + decrements.

- [ ] T007 [P] [US1] Red test `src/features/announcements/lib/__tests__/format-relative.test.ts`: "2h ago"; "Yesterday"; >6 days → "3 Nov".
- [ ] T008 [P] [US1] Red test `src/features/announcements/hooks/__tests__/useUnreadNoticeCount.test.tsx`: key `['inspector-notices','unread-count']`; `refetchOnWindowFocus:true`; SW message `inspector-notice:received` invalidates `['inspector-notices']`.
- [ ] T009 [P] [US1] Red test `src/features/announcements/pages/__tests__/AnnouncementsPage.test.tsx` (list/empty/error/loading/pagination/open/a11y per spec).
- [ ] T010 [P] [US1] Red test `src/features/announcements/pages/__tests__/AnnouncementDetailPage.test.tsx` (open unread → one POST read + invalidate; already read → no POST; content; 404; error; read-fail retry on next mount).
- [ ] T011 [P] [US1] Red tests (modify) `src/features/profile/pages/__tests__/ProfilePage.test.tsx` (Announcements tile, full-width, last by DOM position, value + warning dot + aria-label + href) and `src/components/shell/__tests__/BottomNavBar.test.tsx` (badge "3"/"9+", aria-label, none at 0) and `src/features/profile/pages/__tests__/ProfileLayout.test.tsx` (`/profile/announcements/n1` counts as selection).
- [ ] T012 [US1] Implement `src/features/announcements/lib/format-relative.ts` — green T007.
- [ ] T013 [US1] Implement hooks `src/features/announcements/hooks/useMyNotices.ts`, `useUnreadNoticeCount.ts`, `useMarkNoticeRead.ts` — green T008.
- [ ] T014 [US1] Implement `src/features/announcements/components/AnnouncementListItem.tsx` and `pages/AnnouncementsPage.tsx` — green T009.
- [ ] T015 [US1] Implement `src/features/announcements/pages/AnnouncementDetailPage.tsx` (mark-read guarded per `noticeId`, StrictMode-safe) — green T010.
- [ ] T016 [US1] Wire routes in `src/app/router.tsx` (`announcements`, `announcements/:noticeId` under `profile`); update `ProfileLayout.tsx` (`useMatch('/profile/:section/*')`); add tile to `ProfilePage.tsx`; add Profile-tab badge to `BottomNavBar.tsx` — green T011.

## Phase 4: User Story 2 — Push control in /profile/settings (P1)

**Goal**: per-device push on/off with full state table. **Independent test**: toggle on → OS prompt → "on" (web shows Push On); toggle off → "off".

- [ ] T017 [P] [US2] Red test `src/features/push/hooks/__tests__/usePushSubscription.test.tsx` (all states, enable/disable paths, precedence L-F02-05, VAPID key-change L-F02-04, injected `serviceWorker`/`Notification`/`PushManager`/API).
- [ ] T018 [P] [US2] Red test `src/features/push/components/__tests__/PushPreferenceCard.test.tsx` (per-state text/controls; `role="switch"`, `aria-checked`, name; disabled no-action states; messages in `role="status"`/`alert`).
- [ ] T019 [P] [US2] Red test (modify) `src/features/profile/pages/__tests__/ProfileSettingsPage.test.tsx` (slot now holds the card; InstallAppCard + version footer stay; DOM order slot → InstallAppCard → footer).
- [ ] T020 [US2] Implement `src/features/push/hooks/usePushSubscription.ts` (fixed precedence D21; enable/disable; VAPID key check L-F02-04) — green T017.
- [ ] T021 [US2] Implement `src/features/push/components/PushPreferenceCard.tsx` — green T018.
- [ ] T022 [US2] Mount card inside `push-preference-slot` in `src/features/profile/pages/ProfileSettingsPage.tsx` — green T019.

## Phase 5: User Story 3 — Delivery, SW handlers, sync & logout (P2)

**Goal**: push delivery, click routing, resync on load/rotation, logout unsubscribe. **Independent test**: enable push, publish critical → notification app-closed; tap opens notice; web shows read.

- [ ] T023 [P] [US3] Red test `src/sw/__tests__/push-handlers.test.ts` (buildNotification valid/non-critical/invalid/external/non-allowlisted/system-allowed/near-valid; resolveClickTarget focus vs openWindow; handleSubscriptionChange with/without newSubscription and subscribe-throws).
- [ ] T024 [P] [US3] Red test `src/features/push/hooks/__tests__/usePushSubscriptionSync.test.tsx` (load with/without subscription; no permission/support; remount ≤1 POST/load/userId; userId change; SW message; POST fail silent; VAPID key change L-F02-04; push-config fail → legacy flow).
- [ ] T025 [P] [US3] Red test `src/app/__tests__/useNoticeOpenedFromPush.test.tsx` (`fromNotice` UUID → one POST read, invalidate, replace-navigate; non-UUID ignored+removed; 404 silent).
- [ ] T026 [P] [US3] Red tests (modify) `src/hooks/__tests__/useAuth.test.tsx` (logout unsubscribes fire-and-forget, token captured before clear, order before clearTokens, failures swallowed, synchronous; `keepPushSubscription:true` skips) and `src/features/profile/components/__tests__/ChangePasswordSection.test.tsx` (`logout({keepPushSubscription:true})`).
- [ ] T027 [US3] Implement `src/sw/push-handlers.ts` (`buildNotification`, `resolveClickTarget`, `handleSubscriptionChange`, `PushSubscriptionChangeEvent` type) using shared allowlist, no local normalization — green T023.
- [ ] T028 [US3] Create `src/sw.ts` (injectManifest glue: skipWaiting, clientsClaim, cleanupOutdatedCaches, precacheAndRoute, NavigationRoute, registerRuntimeCaching, push/notificationclick/pushsubscriptionchange).
- [ ] T029 [US3] Switch `apps/pwa/vite.config.ts` to `strategies:'injectManifest'`, `srcDir:'src'`, `filename:'sw.ts'`, `injectManifest.globPatterns`; remove the `workbox` block.
- [ ] T030 [US3] Implement `src/features/push/hooks/usePushSubscriptionSync.ts` and `src/app/useNoticeOpenedFromPush.ts`; mount both + SW message listener in `src/components/shell/PwaLayout.tsx` — green T024, T025.
- [ ] T031 [US3] Rework `src/hooks/useAuth.tsx` `logout(options?: { keepPushSubscription?: boolean })` (synchronous, fire-and-forget unsubscribe with captured token); `ChangePasswordSection.tsx` → `logout({keepPushSubscription:true})`; `ProfilePage.tsx` → `onClick={() => logout()}` — green T026.

## Phase 6: Polish & Cross-Cutting

- [ ] T032 [P] Add boot-call stubs to `BASELINE_STUBS` in `apps/pwa/tests/e2e/support/auth.ts` (`GET /unread-count` → `{data:{count:0}}`, `GET /push-config` → `{data:{vapidPublicKey:null}}`, `POST /push-subscriptions` → 204); list them in the PR.
- [ ] T033 [P] Update `apps/pwa/CLAUDE.md` §5 (`generateSW`→`injectManifest`, push, `pushsubscriptionchange`), block P08 (`cacheableResponse:[200]` on the 2 API caches; remove the N10 note), feature structure (announcements + push slices).
- [ ] T034 Full gate inside the worktree: `pnpm --filter @properfy/shared build && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && test -f apps/pwa/dist/sw.js && pnpm --filter pwa test:e2e` (CI=1); fix until green.
- [ ] T035 `git status --porcelain` empty after commit (no stray source outside the commit, nothing in `build/`); verify `dist/sw.js` has no zod/schema bloat.

## Dependencies & Order

- Setup (T001–T002) → Foundational (T003–T006) → US1 (T007–T016) → US2 (T017–T022) → US3 (T023–T031) → Polish (T032–T035).
- US1 and US2 are independent of each other; US3 depends on Foundational (vapid, runtime-caching), US2 (reuses subscription logic patterns) and the SW split. US1 is the MVP (inbox works with no push at all).
- `[P]` tasks within a phase touch different files and can run together (notably all red-test tasks).

## MVP

User Story 1 (T001–T016 minus push-specific setup) delivers a working inbox + badge with zero push dependency.
