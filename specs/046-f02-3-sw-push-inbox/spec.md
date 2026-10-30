# Feature Specification: PWA Service Worker, Web Push & Announcements Inbox (F02-3)

**Feature Branch**: `046-f02-3-sw-push-inbox`
**Created**: 2026-10-30
**Status**: Draft
**Input**: TASK-F02-3 (`fase2-etapa1/tarefas/F02-tarefas.md`) — PWA slice of contract items 00.6c and 00.9a, plus end-to-end QA. Contract acceptance codes: 00.A2, 00.A4.

## Overview

Properfy inspectors use the PWA (`apps/pwa`) in the field. The backend (TASK-F02-1, merged) already publishes operational notices to inspectors, delivers them by Web Push with an SMS fallback for critical notices, and exposes the inspector-facing routes (`/v1/inspectors/me/notices`, `/unread-count`, `/:noticeId`, `/:noticeId/read`, `/push-config`, `/push-subscriptions`, `/push-subscriptions/unsubscribe`). The web admin screen (TASK-F02-2) lets AM/OP publish notices and see reads.

This feature is the **inspector device side**: it swaps the service worker from Workbox `generateSW` to `injectManifest` (`src/sw.ts`) so the app can handle `push`, `notificationclick` and `pushsubscriptionchange`; adds a per-device "Push notifications" control in `/profile/settings`; and adds an "Announcements" inbox under `/profile` with an unread badge on the Profile tab and tile. It keeps push subscriptions in sync with the server on every app load and after the push service rotates a subscription, including re-subscribing when the server's VAPID key changes.

**Multi-tenant exception (CLAUDE.md §7.1):** `InspectorNotice`, `InspectorNoticeRecipient` and inspector push subscriptions have **no `tenant_id`** — the inspector is cross-tenant (precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`). Access scope is by role (AM/OP = platform) and by the JWT `inspectorId` (INSP = own rows only). This slice is entirely client-side in the PWA and only consumes the INSP-scoped routes; it introduces no new persisted entity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspector reads announcements in the app (Priority: P1)

An inspector opens Properfy and finds an "Announcements" inbox under their Profile. Unread notices are visibly marked (dot, bold title, "Critical" chip when critical); an unread badge shows on the Profile tab and the Announcements tile. Opening a notice shows its full content and marks it read, which clears its unread state and decrements the badge.

**Why this priority**: The inbox is the always-available channel and the baseline of value — it works even without push (iOS Safari in-browser, push blocked/unavailable). It is the home that `notificationclick` and the badge point at.

**Independent Test**: With push disabled entirely, publish a notice for the inspector (web admin or curl); it appears in `/profile/announcements`, the badge shows the count, opening it marks it read and the badge decrements.

**Acceptance Scenarios**:

1. **Given** the inspector has 2 notices (1 unread, critical), **When** they open `/profile/announcements`, **Then** notices appear in backend order; the unread one shows a dot, bold title and a "Critical" chip; a 2-line body preview and a relative date are shown.
2. **Given** the inbox is empty, **When** it loads, **Then** "No announcements yet" and the helper line are shown.
3. **Given** a notice list request fails, **When** the page loads, **Then** "Couldn't load announcements." and a "Retry" action are shown.
4. **Given** an unread notice, **When** the inspector opens its detail, **Then** exactly one `POST /read` fires (StrictMode-safe), the content shows with full date in the inspector's effective timezone, and the list + unread count are invalidated.
5. **Given** a notice the inspector is not a recipient of or that is archived, **When** its detail is opened, **Then** "This announcement is no longer available." + "Back to announcements" are shown (404, existence not leaked).
6. **Given** unread count > 0, **When** the inspector views the Profile tab and the Announcements tile, **Then** both show the number (tile value "{n} unread", warning dot; tab badge 1–9 then "9+") with accessible names; at 0, neither shows a badge.

### User Story 2 - Inspector turns push on/off for this device (Priority: P1)

In `/profile/settings`, the inspector sees a "Push notifications" control that enables or disables push for **this device only**. Turning it on requests OS permission inside the click gesture, subscribes via the browser `PushManager` with the server VAPID key, and registers the subscription with the server. Turning it off unregisters on the server then unsubscribes locally. The control shows a precise state for every environment (iOS-needs-install, unsupported, blocked, unavailable, on, off, transitional, error).

**Why this priority**: Push is the contractual delivery channel (00.A2) and the trigger that keeps `push_enabled` true server-side, which gates the critical-notice SMS fallback.

**Independent Test**: On a supported device, toggle the control on → OS prompt → "on"; the web admin shows the inspector's Push as "On". Toggle off → "off"; web shows "Off".

**Acceptance Scenarios**:

1. **Given** a supported device with no local subscription, **When** the inspector enables push and grants permission, **Then** the app subscribes with the VAPID key, POSTs the subscription, and shows "on".
2. **Given** the inspector denies the OS permission, **When** they try to enable, **Then** the state becomes "blocked" and no POST is sent.
3. **Given** enabling and the POST fails (5xx), **When** the error returns, **Then** the local subscription is rolled back, the state is "off", and a "Couldn't turn on push notifications. Try again." alert shows.
4. **Given** push is on, **When** the inspector disables it, **Then** `POST /unsubscribe` runs and then the local `subscription.unsubscribe()`, ending in "off".
5. **Given** the control states, **When** the environment matches, **Then** the fixed precedence `ios-needs-install → unsupported → blocked → unavailable → on/off` resolves the state (L-F02-05).

### User Story 3 - Notices are delivered and synced via push (Priority: P2)

With push enabled, a published notice shows an OS notification even when the app is closed; tapping it opens the notice (or the allowed system target) and marks it read. On every app load and whenever the push service rotates the subscription or the server VAPID key changes, the device subscription is re-synced to the server so the inspector keeps receiving push without revisiting Settings.

**Why this priority**: Delivery and resilience fulfil 00.A2 (push path) and prevent silent subscription death; it builds on US2 which must exist first.

**Independent Test**: Enable push, publish a critical notice from the web admin → notification arrives app-closed; tapping opens `/profile/announcements/<id>`; web shows "Read by 1 of 1".

**Acceptance Scenarios**:

1. **Given** a valid push payload, **When** `push` fires, **Then** a notification shows (title, body; `requireInteraction` when critical) and open windows get an `inspector-notice:received` message that invalidates the inbox.
2. **Given** a notification with an allowlisted system `url` (`/schedule/<uuid>`), **When** tapped, **Then** the app focuses/navigates the existing client (or opens a window) to `/schedule/<uuid>?fromNotice=<id>` and the `fromNotice` handler marks the notice read and strips the param.
3. **Given** a notification with a non-allowlisted or external `url`, **When** tapped, **Then** it opens `/profile/announcements` (no local normalization; uses the shared allowlist).
4. **Given** the server VAPID key differs from the local subscription key and permission is granted, **When** the app loads, **Then** it unsubscribes, re-subscribes with the new key, and POSTs the new subscription — no user gesture (L-F02-04).
5. **Given** a `pushsubscriptionchange` event, **When** it fires, **Then** the SW re-subscribes locally (using `newSubscription` or `oldSubscription` key) and messages open windows to re-sync; failures only message the windows.

### Edge Cases

- Push arrives with the app open on another screen: the OS notification shows and the badge updates via the SW message.
- Tapping a notification for an archived/non-recipient notice: friendly 404 screen.
- Unreadable/empty/non-JSON push payload: generic "You have a new announcement." opening the inbox.
- Permission revoked in OS settings after enabling: hook reads `denied` → "blocked"; server revokes on the next 404/410 and switches critical notices to SMS.
- Logout on a device with push on, then another inspector logs in: the first stops receiving push on that device (default logout unsubscribes fire-and-forget with the captured token); password change keeps the subscription (`logout({ keepPushSubscription: true })`).
- Server revoked the subscription (`REJECTED`/`FAILED`/`DEACTIVATED`): next app load re-syncs (re-registers) if a local subscription still exists.
- VAPID key rotated in the backend: the control showed a stale "on"; next load detects the different key, re-subscribes, returns to a real "on"; without granted permission it only unsubscribes and shows "off"/"blocked".
- StrictMode / double mount: mark-read fires at most once per notice per mount.
- Two devices: each toggles only itself.
- Old schedule cache of a previous inspector: cache names are unchanged, so logout's `clearInspectorCachedData` still clears them.

## Requirements *(mandatory)*

### Functional Requirements

**Service worker (00.6c infra)**
- **FR-001**: The build MUST produce `dist/sw.js` via Workbox `injectManifest` from `src/sw.ts`, preserving precache, navigation fallback (`index.html`), the 5 existing `runtimeCaching` routes (same patterns, strategies, cache names, limits and timeouts) and `autoUpdate` (`skipWaiting` + `clientsClaim`).
- **FR-002**: The two API caches (`api-schedule-cache`, `api-appointment-cache`) MUST set `cacheableResponse: { statuses: [200] }` (L-X00-10); font caches and the offers `NetworkOnly` route MUST NOT.
- **FR-003**: The runtime-caching cache names MUST stay equal to `INSPECTOR_API_CACHES` exported from `useAuth.tsx` (now exported for the test and logout cache-clear).
- **FR-004**: On `push`, the SW MUST build a notification from the payload and always call `showNotification` (iOS revokes the subscription otherwise), and MUST post `inspector-notice:received` to open windows.
- **FR-005**: On `notificationclick`, the SW MUST resolve the click target through the shared `isAllowedInspectorNoticeTargetPath` (no local normalization); non-allowlisted/external URLs fall back to `/profile/announcements`; when the target is not the notice's own page it appends `?fromNotice=<noticeId>`.
- **FR-006**: On `pushsubscriptionchange`, the SW MUST re-subscribe locally (from `event.newSubscription`, else `pushManager.subscribe` with `oldSubscription` key) and message open windows `push-subscription-changed`; a subscribe failure only messages the windows.

**Push control (00.6c)**
- **FR-007**: `/profile/settings` MUST render a "Push notifications" control inside the F01-3 `push-preference-slot` (above `InstallAppCard`, version footer last), with an accessible switch (`role="switch"`, `aria-checked`, name "Push notifications") and a per-state description/message.
- **FR-008**: The control state MUST follow the fixed precedence `ios-needs-install → unsupported → blocked → unavailable → on/off` (L-F02-05).
- **FR-009**: Enabling MUST request permission only inside the click gesture, subscribe with `userVisibleOnly: true` and the VAPID `applicationServerKey`, then POST the subscription; denial → "blocked" (no POST); POST failure → local rollback, "off", "save-failed".
- **FR-010**: Disabling MUST POST `/unsubscribe` then `subscription.unsubscribe()` locally; offline disable still unsubscribes locally.
- **FR-011**: When the local subscription's `applicationServerKey` differs from the server VAPID key and permission is `granted`, the control MUST unsubscribe and re-subscribe with the new key and POST; without granted permission it only unsubscribes locally (L-F02-04). A null local `applicationServerKey` skips the comparison.
- **FR-012**: The control MUST never mention SMS (D5).

**Announcements inbox (00.9a client)**
- **FR-013**: `/profile/announcements` MUST list only the inspector's non-archived notices in backend order (no pins, filters or search), with unread marking, "Critical" chip, 2-line preview, relative date, "Load more" pagination (pageSize 20), and loading/empty/error states.
- **FR-014**: `/profile/announcements/:noticeId` MUST show title, "Critical" chip, full date in the inspector's effective timezone, and the body with preserved whitespace; on first load with `readAt == null` it MUST `POST /read` once and invalidate the list and count; 404 and error states as specified.
- **FR-015**: A full-width "Announcements" tile MUST be the last item of the Profile grid (ordered after "My account" by DOM position, not index, so F08 Challenges does not break it), value "{n} unread"/"No new announcements", warning dot and `aria-label` when n > 0, linking to `/profile/announcements`.
- **FR-016**: The Profile tab in `BottomNavBar` MUST show a numeric unread badge (1–9, "9+") with `aria-label="Profile, {n} unread announcements"` when n > 0, sourced from `useUnreadNoticeCount` (`/unread-count` only; staleTime 30s, `refetchOnWindowFocus: true`, invalidated by the SW message and after mark-read).
- **FR-017**: `ProfileLayout` MUST treat `/profile/announcements/:noticeId` as a selection (detail pane open in the wide layout); routes `announcements` and `announcements/:noticeId` live under `profile`.

**Sync & lifecycle**
- **FR-018**: On every authenticated app load (`PwaLayout`), with support, `Notification.permission === 'granted'` and a non-null local subscription, the app MUST POST the subscription (idempotent upsert); it MUST NOT subscribe from scratch on its own. At most one POST per load per `userId`; a new `userId` re-POSTs; an SW `push-subscription-changed` message triggers a new POST; failures are silent.
- **FR-019**: The app MUST read `fromNotice` (UUID) from the URL, fire `POST /:id/read` without awaiting, invalidate the inbox and strip the param via `navigate(pathname, { replace: true })`; non-UUID `fromNotice` is ignored and removed; a 404 is silent.
- **FR-020**: Default logout MUST unsubscribe this device fire-and-forget: capture the access token synchronously before clearing it, POST `/unsubscribe` with an explicit `Authorization: Bearer <token>`, then `subscription.unsubscribe()`; all errors swallowed; `logout` stays synchronous (`() => void`). `logout({ keepPushSubscription: true })` (password change) MUST NOT unsubscribe. `ProfilePage` logout button uses `onClick={() => logout()}`.

**E2E baseline (L-X03-05)**
- **FR-021**: `BASELINE_STUBS` in `tests/e2e/support/auth.ts` MUST stub the new boot calls so `test-pwa-e2e` stays green: `GET /unread-count` → `{data:{count:0}}`, `GET /push-config` → `{data:{vapidPublicKey:null}}`, `POST /push-subscriptions` → 204. No `[E2E_UNMOCKED]` for these routes.

**Documentation (X00/N11)**
- **FR-022**: This PR MUST update `apps/pwa/CLAUDE.md` §5 (`generateSW` → `injectManifest` with `src/sw.ts`, push, `pushsubscriptionchange`), block P08 (the two API caches now set `cacheableResponse: [200]`; remove the N10 "do not set cacheableResponse today" note) and the feature structure (announcements inbox, push feature).

### Key Entities

No new persisted entity. Client consumes:
- **InspectorNotice (read model)**: `{ id, title, body, critical, publishedAt, readAt }` in the inbox list; detail adds effective-timezone date rendering.
- **Push subscription (browser)**: the `PushSubscription` from `pushManager`, serialized via `toJSON()` for the server; compared by `applicationServerKey` bytes for VAPID rotation.
- **Push payload**: `{ v:1, noticeId, title, body, critical, url }` (`url` resolved by the backend).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (00.A2)**: An inspector with push enabled receives the OS notification of a **critical manual** notice with the app closed; an inspector without push receives the SMS fallback (QA 1 and 3).
- **SC-002 (00.A4)**: A published notice appears in the recipient inbox and the web admin panel shows the read (QA 1).
- **SC-003**: `pnpm --filter pwa lint typecheck test build` are green; `dist/sw.js` exists and contains `index.html` in its precache manifest.
- **SC-004**: `test-pwa-e2e` stays green with the new boot calls stubbed in `BASELINE_STUBS` (no `[E2E_UNMOCKED]`).
- **SC-005**: With the server VAPID key different from the local subscription and permission granted, the app re-subscribes with the new key and POSTs, with no user gesture (QA 11).
- **SC-006**: The push control resolves to the correct state under the fixed precedence for every environment combination (unit tests + QA 12).
- **SC-007**: The SW opens only shared-allowlisted targets, rejecting near-valid URLs (trailing slash, uppercase UUID, encoded segment) without local normalization.

## Assumptions

- **Premise L-F02-04 (D20) — accepted (plan recommendation):** the client re-subscribes when the server VAPID key changes (compare `subscription.options.applicationServerKey` with `push-config.vapidPublicKey` via `keysEqual`; re-subscribe without gesture when permission is already granted). The backend already revokes the stale subscription as `REJECTED` on 401/403.
- **Premise L-F02-05 (D21) — accepted (plan recommendation):** the push control state is resolved by the fixed precedence `ios-needs-install → unsupported → blocked → unavailable → on/off`.
- **Premise L-F02-08 (D24) — accepted:** the SW uses the shared `isAllowedInspectorNoticeTargetPath` (exact segment-by-segment match, lowercase UUID, no trailing slash, no `%`/`?`/`#`/`//`/`\`, ≤ 200 chars) with no local normalization.
- TASK-F02-1 (backend routes, push payload, `api-types.ts`) and TASK-F01-3 (slot, `getIsStandalone()`, `__APP_VERSION__`) are merged into `develop` (verified).
- TASK-F02-2 (web publish UI) gates **only** the end-to-end QA slice; the rest is built in parallel. If F02-2 is not yet merged, QA publishes via `curl`.
- Workbox direct deps (`workbox-core/precaching/routing/strategies/expiration`) match the version bundled by `vite-plugin-pwa@0.21` (~`^7.3.0`) to avoid two Workbox copies in the SW bundle.
- iOS push requires an installed PWA (iOS 16.4+) and permission inside a user gesture; every `push` must show a notification.
- jsdom lacks `PushManager`/`Notification`/`navigator.serviceWorker` and has unreliable `localStorage`; hooks take injectable dependencies and avoid `localStorage`.
- No PWA env vars are added; the VAPID key comes from the backend `push-config`.
