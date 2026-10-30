# Feature Specification: Inspector base address, banner, heartbeat & push slot (PWA)

**Feature Branch**: `041-f01-3-inspector-base-app`  
**Created**: 2026-10-30  
**Status**: Draft  
**Input**: User description: "PWA inspector base address card, fixed banner, app-state heartbeat, push preference slot, and version footer for the inspector app"
**Task source**: `fase2-etapa1/tarefas/F01-tarefas.md` → TASK-F01-3 (contract 00.3, 00.4, 00.10; criterion 00.A5 partial)
**Depends on (merged)**: TASK-X00, TASK-X03 (#1312, PWA E2E suite recovered — `apps/pwa/tests/e2e/support/`), TASK-F01-1 (#1317, backend `POST /v1/inspectors/me/app-state`, geocoded base, privacy)

## Overview

This is the **PWA (inspector app) slice** of F01 "Inspector foundations". The backend contracts and schemas already exist on `develop` (TASK-F01-1). This feature wires the inspector-facing UI and client behaviour onto them:

- an editable **base address** on the profile, validated with the shared Australian address schema and geocoded server-side in permanent mode;
- a **fixed, non-dismissable banner** (two variants) shown while the base has no coordinates;
- an **app-state heartbeat** that reports installation, push permission, last-seen and app version, throttled to at most once per 6 h per device;
- a **reserved push-preference slot** (filled by F02) and a **version footer** on app settings;
- the **E2E baseline stub** for `POST /v1/inspectors/me/app-state`, required because this is the first PWA task that issues an authenticated-boot heartbeat.

This feature adds **no backend, schema, or API-contract changes**. It consumes TASK-F01-1 contracts only.

## Clarifications

No open product decisions. F01 decisions D1–D19 (`fase2-etapa1/tarefas/F01-tarefas.md`) are closed (README: "F01 ✅ decisões fechadas"). The assumptions below record the decisions this PWA slice depends on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspector sets and edits their base address (Priority: P1)

An inspector opens their profile account screen and enters the address their working day starts from (street, number, unit, suburb, state, postcode; country is Australia). On save, the address is validated and sent to the backend, which geocodes it in permanent mode. The inspector sees confirmation when it succeeds, a warning when the address could not be located, and can edit it any time. This is the core of contract **00.4** and the PWA proof of **00.A5** (a saved base address carries lat/lng).

**Why this priority**: Without a base address the inspector cannot be routed; everything downstream in F04/F06 consumes it. It is the primary value of this slice.

**Independent Test**: Load the profile account screen as an inspector with and without a saved base, fill the card, save, and confirm the correct success/warning state and that the payload carries `city = suburb` and no client coordinates.

**Acceptance Scenarios**:

1. **Given** an inspector with a valid saved base address and coordinates, **When** they open `/profile/account`, **Then** the Base address card is pre-filled from the saved address and shows no warning.
2. **Given** an inspector editing the card, **When** they clear a required field (Street) and press Save, **Then** inline error "Street is required" is shown and no PATCH request is sent.
3. **Given** an inspector editing the card, **When** they enter a postcode that is not 4 digits and press Save, **Then** inline error "Postcode must be 4 digits" is shown.
4. **Given** an inspector editing the card, **When** they type only spaces into Street and press Save, **Then** the field is treated as empty ("Street is required") and no PATCH is sent.
5. **Given** a valid address, **When** the inspector presses Save, **Then** the request body is `{address:{street,number?,complement?,suburb,city:suburb,state,postcode,country:'AU'}}` with no latitude/longitude.
6. **Given** a successful save that returns coordinates, **When** the response arrives, **Then** "Saved successfully" is announced in a `role="status"` region.
7. **Given** a successful save where the backend returns `baseGeocodeFailed:true`, **When** the response arrives, **Then** a warning "Saved, but we couldn't locate this address. Please check it." is shown.
8. **Given** the backend returns 400 with `details:[{path:['address','state'],message:'Select a state'}]`, **When** the response arrives, **Then** the error is mapped to the State field.
9. **Given** a saved address that does not parse with the shared schema (legacy, e.g. `state:'New South Wales'` or `{foo:1}`), **When** the card loads, **Then** the fields are empty, the message "Your saved address is incomplete. Please enter it again." is shown, and the raw value is shown as reference.
10. **Given** the profile account screen opened with hash `#base-address`, **When** it loads, **Then** the page scrolls to the Base address card and focuses the first empty field.

---

### User Story 2 - Inspector is prompted to add or fix a missing base (Priority: P1)

An inspector whose base has no coordinates sees a fixed, non-dismissable banner on both the home (`/schedule`) and the profile (`/profile`). Variant 1 prompts them to add a base address they never entered; variant 2 tells them their saved address could not be located. The banner does not block the app and disappears on its own after a successful save with coordinates. This is decision D2.

**Why this priority**: The banner is how the inspector discovers they must act; without it the empty base from US1 would go unnoticed. It ships with US1.

**Independent Test**: Render Schedule and Profile with `useInspectorMe` returning (a) `address:null,baseLat:null`, (b) `address:{…},baseLat:null`, (c) `baseLat` set, and (d) loading/error, and assert the banner text/visibility for each.

**Acceptance Scenarios**:

1. **Given** `useInspectorMe` loaded with `address:null` and `baseLat:null`, **When** Schedule or Profile renders, **Then** the banner shows "Add your base address" with a link "Add address" to `/profile/account#base-address`.
2. **Given** `useInspectorMe` loaded with `address` present and `baseLat:null`, **When** Schedule or Profile renders, **Then** the banner shows "We couldn't locate your base address — please check it" with a link "Check address" to the same destination.
3. **Given** `useInspectorMe` loaded with a non-null `baseLat`, **When** the screen renders, **Then** no banner is shown.
4. **Given** `useInspectorMe` is loading or errored, **When** the screen renders, **Then** no banner is shown.
5. **Given** the banner is visible, **When** the inspector inspects it, **Then** it has no dismiss/close control and is exposed as `role="status"`.
6. **Given** the banner on Schedule, **When** it renders, **Then** it appears below the TopBar and above the install banners, scrolls with content (not sticky), and does not break per-pane scroll on the wide layout.
7. **Given** a successful save with coordinates, **When** the `['inspector']` query is invalidated and refetched, **Then** the banner disappears without a reload.

---

### User Story 3 - App reports its adoption state via heartbeat (Priority: P2)

The installed app reports, at most once every 6 hours per device, whether it is running standalone, the browser push permission, its last-seen time and its version. The operator-facing web tables (TASK-F01-2) reflect this. This is contract **00.10** (app adoption without a per-device table — latest heartbeat wins).

**Why this priority**: Adoption telemetry is valuable but not blocking for the inspector's day; it can ship after US1/US2.

**Independent Test**: Drive `useAppStateHeartbeat` with injected storage and API, fake timers, and simulated `visibilitychange`/`displayMode` changes, asserting when a POST is and is not sent and the exact payload.

**Acceptance Scenarios**:

1. **Given** empty throttle storage, **When** the layout mounts, **Then** one POST `/v1/inspectors/me/app-state` is sent with `{displayMode,pushPermission,appVersion}`.
2. **Given** a last send recorded 1 h ago in the same `displayMode`, **When** a heartbeat trigger fires, **Then** no POST is sent.
3. **Given** a last send recorded 6 h + 1 ms ago, **When** a trigger fires, **Then** a POST is sent.
4. **Given** a last send in `browser` 1 h ago, **When** the app is now `standalone`, **Then** a POST is sent immediately with `standalone` (display-mode-change bypass).
5. **Given** the tab becomes visible 7 h after the last send, **When** `visibilitychange` fires, **Then** a POST is sent.
6. **Given** a network error or 5xx, **When** the POST fails, **Then** the throttle storage is NOT written and the next trigger retries.
7. **Given** a 429 response, **When** it is received, **Then** the throttle storage IS written (to stop insisting).
8. **Given** `Notification` is absent from `window`, **When** a heartbeat is built, **Then** `pushPermission` is `'unsupported'`.
9. **Given** `localStorage` is unavailable (accessor throws), **When** the app loads, **Then** at most one POST per app load is sent and no exception escapes.
10. **Given** the inspector logs out, **When** the throttle key is removed, **Then** the next authenticated mount sends a heartbeat immediately.
11. **Given** shared storage across tab and installed app (Android), **When** `displayMode` toggles standalone → browser → standalone within 6 h, **Then** three POSTs are sent, one per mode change (expected, L-F01-08).
12. **Given** the heartbeat ever fails, **When** it fails, **Then** there is no visible UI effect (errors are silent).

---

### User Story 4 - App settings has a push slot and a version footer (Priority: P3)

The app-settings screen reserves an empty slot (filled by F02 with the push control) as its first content child, followed by the install card, with a version footer last. This is the F01 share of contract **00.3** (only the reserved slot) plus the build version readout.

**Why this priority**: It is layout plumbing that unblocks F02; it carries the least standalone user value.

**Independent Test**: Render `/profile/settings` and assert the DOM order slot → `InstallAppCard` → footer and the footer text.

**Acceptance Scenarios**:

1. **Given** `/profile/settings` renders, **When** inspected, **Then** an empty `[data-testid="push-preference-slot"]` is the first content child, with no title or visible content.
2. **Given** `/profile/settings` renders, **When** the DOM order is checked, **Then** it is slot → `InstallAppCard` → version footer.
3. **Given** a build with version `0.1.0` and SHA `ab12cd3`, **When** the footer renders, **Then** it shows `Properfy Inspector v0.1.0+ab12cd3`.
4. **Given** a local build with no `APP_BUILD_SHA`, **When** the footer renders, **Then** it shows `Properfy Inspector v0.1.0+dev`.

---

### User Story 5 - PWA E2E suite stays green with the heartbeat (Priority: P1)

Because the heartbeat is the first authenticated-boot API call added by a PWA feature after X03, its default stub must be registered in the shared E2E baseline so every spec stays hermetic. This is acceptance criterion from the delegation (L-X03-05) and a CI gate (`test-pwa-e2e`).

**Why this priority**: Without it the `blockUnmockedApi` guard fails every authenticated E2E test, breaking the CI gate — it must land in the same PR as the heartbeat.

**Dependency note**: Although P1, this story is only *necessary* once US3's heartbeat is wired into `PwaLayout` (before that, no authenticated boot calls the endpoint and the X03 suite is already green). It therefore ships together with US3 in the same PR and is scheduled alongside it, not before US1/US2.

**Independent Test**: Run the PWA E2E suite (`test-pwa-e2e`, Chromium + WebKit); every authenticated spec boots without hitting an unmocked `POST /v1/inspectors/me/app-state`.

**Acceptance Scenarios**:

1. **Given** `loginAsInspector` with the default baseline, **When** an authenticated screen boots and the heartbeat fires, **Then** `POST /v1/inspectors/me/app-state` is served from `BASELINE_STUBS` with 204 and no request escapes `blockUnmockedApi`.
2. **Given** the full PWA E2E suite, **When** it runs on Chromium and WebKit, **Then** it passes (remains a real gate, not vacuous).

### Edge Cases

- Base has coordinates → no banner anywhere.
- Address saved but not located → card warning + banner variant 2.
- Legacy incompatible address (`state:'New South Wales'`, country ≠ AU, or `{foo:1}`) → banner variant 2; card empty with the "incomplete" message and the raw value as reference.
- Offline on save → "Failed to update profile"; form values are kept.
- iOS Safari outside standalone → `displayMode:'browser'`, `pushPermission:'unsupported'`.
- Installed app opened 1 h after a `browser` heartbeat → immediate send (mode change).
- `localStorage` unavailable → at most one POST per app load.
- Inspector switch on the device (logout/login) → immediate heartbeat.
- Deep link `#base-address` → scroll + focus first empty field.
- Android Chrome toggling browser tab ↔ installed app → one POST per `displayMode` change (shared storage; expected, L-F01-08).
- iOS home-screen app vs Safari have isolated storage; logout in one does not clear the other; iOS < 16.4 installed → `unsupported`; in-app browsers (Gmail/Instagram) → `browser` (L-F01-08).
- Chrome desktop installed or Safari macOS "Add to Dock" → `standalone`; web shows "Installed" on any device (L-F01-08, D16).
- Local build without `APP_BUILD_SHA` → footer `v0.1.0+dev`.

## Requirements *(mandatory)*

### Functional Requirements

**Base address card (`/profile/account`, inline, `id="base-address"`)**

- **FR-001**: The system MUST render a "Base address" card on `/profile/account`, placed after Phone + Timezone and before Security, with header "BASE ADDRESS" and subtext "Where your day starts. Used to plan your route."
- **FR-002**: The card MUST validate input with the shared `inspectorBaseAddressSchema` and the shared `AU_STATES` list (TASK-F01-1), with fields Street (required), Number, Unit (`complement`), Suburb (required), State (required select NSW/VIC/QLD/WA/SA/TAS/ACT/NT), Postcode (required, numeric input mode), and a hidden Country `"AU"` that is still sent.
- **FR-003**: The card MUST derive `city` from `suburb` in the payload and MUST NOT send any client-side latitude/longitude.
- **FR-004**: Text fields that contain only whitespace MUST be treated as empty (trim), with the same rules applied in the shared schema and the API (L-F01-01).
- **FR-005**: The card MUST pre-fill from a saved `address` that parses with the schema; when it does not parse (legacy), the fields MUST be empty, the message "Your saved address is incomplete. Please enter it again." MUST be shown, and the raw value MUST be shown as reference.
- **FR-006**: The "Save address" action MUST appear only when the form is dirty (matching the Phone pattern) and MUST surface states: saving ("Saving…", disabled), success with coordinates ("Saved successfully"), geocode-failed ("Saved, but we couldn't locate this address. Please check it."), API error (API message or "Failed to update profile"), loading skeleton, and load error ("Couldn't load your address." + "Retry").
- **FR-007**: Validation messages MUST be exactly "Street is required", "Suburb is required", "Select a state", "Postcode is required", "Postcode must be 4 digits"; a 400 with `details` MUST map issues to the matching fields.
- **FR-008**: The card MUST be accessible: visible labels, `aria-describedby` on errors, results in `role="status"`/`aria-live="polite"`, tap targets ≥ 44 px, and on hash `#base-address` MUST scroll to the card and focus the first empty field.

**Base address banner**

- **FR-009**: The system MUST render a `BaseAddressBanner` on `/schedule` (home) and `/profile` when `useInspectorMe` is loaded and `baseLat == null`; it MUST NOT render during loading or error.
- **FR-010**: With `address == null` the banner MUST show variant 1 ("Add your base address" / body "We use it as the starting point for your day." / link "Add address"); with `address != null` and `baseLat == null` it MUST show variant 2 ("We couldn't locate your base address — please check it" / link "Check address"). Both links target `/profile/account#base-address`.
- **FR-011**: The banner MUST be non-dismissable (no close control), MUST NOT block anything, and MUST disappear after a save with coordinates via `['inspector']` query invalidation.
- **FR-012**: The banner MUST be placed below the TopBar and above the install banners on Schedule and at the top of the grid on Profile, scroll with content (not sticky), use the `warning` token with a pin icon at AA contrast, be exposed as `role="status"`, and not break per-pane scroll on the wide layout.

**App-state heartbeat (client)**

- **FR-013**: The system MUST provide `useAppStateHeartbeat()` called from `PwaLayout` for an authenticated inspector only, triggered on mount and on `visibilitychange` → visible, both passing through the throttle.
- **FR-014**: The throttle MUST be 6 h per device, keyed in `localStorage` as `properfy.pwa.appStateHeartbeat = { at: epochMs, displayMode }` recorded only on a 204; it MUST send when `now - at ≥ 6h` OR the current `displayMode` differs from the stored one.
- **FR-015**: On network error or 5xx the system MUST NOT write the throttle key and MUST retry on the next trigger; on 429 it MUST write the key; all storage access MUST be wrapped in try/catch, and with no storage it MUST send at most one POST per app load; logout MUST remove the key.
- **FR-016**: The heartbeat payload MUST be `displayMode` (`'standalone'` when `getIsStandalone()`, else `'browser'`), `pushPermission` (`'unsupported'` when `!('Notification' in window)`, else `Notification.permission`), and `appVersion` (`__APP_VERSION__`).
- **FR-017**: Heartbeat failures MUST be silent (dev `console.debug` only) with no UI effect; the heartbeat MUST NOT be audited and the client MUST NOT log in production.
- **FR-018**: `getIsStandalone()` MUST be exported from `useInstallPrompt.tsx` (`matchMedia('(display-mode: standalone)')` or `navigator.standalone`) without changing its behaviour.

**App version**

- **FR-019**: `__APP_VERSION__` MUST be injected by a Vite `define` as `` `${pkg.version}+${(APP_BUILD_SHA ?? 'dev').slice(0,7)}` `` via a pure helper `buildAppVersion(pkgVersion, sha?)` in `apps/pwa/src/lib/app-version.ts`, used by both `vite.config.ts` and the Vitest config, with `declare const __APP_VERSION__: string;` in `vite-env.d.ts`.
- **FR-020**: `.github/workflows/frontend-deploy.yml` MUST set `APP_BUILD_SHA: ${{ github.sha }}` in the `env` of the three PWA build steps (dev/staging/prod); `APP_BUILD_SHA` MUST be read in the Node build (no `VITE_` prefix, never exposed via `import.meta.env`). The resulting version MUST fit within 40 characters.

**App settings slot + footer (`/profile/settings`)**

- **FR-021**: `/profile/settings` MUST order its content as (1) an empty `<div data-testid="push-preference-slot" />` as the first content child with no visible content (F02 fills it), (2) `InstallAppCard`, (3) a version footer last (L-F01-12).
- **FR-022**: The footer MUST read `Properfy Inspector v{__APP_VERSION__}` (e.g. `Properfy Inspector v0.1.0+ab12cd3`), replacing the fixed "v1.0" text.

**Consumed contracts (TASK-F01-1, unchanged here)**

- **FR-023**: The PWA MUST consume `GET /v1/inspectors/me` (→ `address, baseLat, baseLng, baseGeocodedAt`), `PATCH /v1/inspectors/me {address}` (→ `{inspectorId, baseGeocodeFailed?}`; 400 `VALIDATION_ERROR` with `details`), and `POST /v1/inspectors/me/app-state {displayMode, pushPermission, appVersion}` (→ 204; 429 on excess). The PWA MUST NOT read the base from `/v1/me` (its `meResponseSchema` strips undeclared fields).
- **FR-024**: `useInspectorMe` and `useUpdateInspectorSelf` types MUST be extended to carry the base-address fields and the save return (`baseGeocodeFailed`); `useUpdateInspectorSelf` MUST invalidate `['inspector']` and propagate the API message.

**E2E baseline (cross-cutting)**

- **FR-025**: `apps/pwa/tests/e2e/support/auth.ts` `BASELINE_STUBS` MUST register, in the same PR, a default stub for `POST /v1/inspectors/me/app-state` (204) AND for `GET /v1/inspectors/me` (a located-base body, so the banner is hidden by default), so every authenticated E2E spec stays hermetic under `blockUnmockedApi`. Because this feature mounts `BaseAddressBanner` on the Schedule home — not only on Profile — `GET /v1/inspectors/me` now runs on every authenticated boot, so it joins the baseline (superseding the pre-F01-3 note that treated it as a profile-only query). Specs exercising the missing/legacy-base states override it (last-route-wins).

### Non-functional / scope guards

- **FR-026**: This feature MUST NOT change the backend, the Prisma schema, or any API contract; `api-types.ts` is regenerated only if a route schema changed (none is expected here).
- **FR-027**: Out of scope (MUST NOT be built): push control/subscription (F02), install tour/guide and "More" tab (F04), PWA autocomplete, day base (F04), changes to `InstallBanner*`/`InstallAppCard`, and fixing unrelated parts of the E2E suite beyond FR-025.

### Key Entities

- **No new entity.** The app-state fields (`app_installed_at`, `app_last_seen_at`, `push_enabled`, `app_version`) and base coordinates (`base_lat`, `base_lng`, `base_geocoded_at`) live on the existing `Inspector`, added by TASK-F01-1. `Inspector` is a **platform-scoped entity with no `tenant_id`** (inspectors are cross-tenant; precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`). This PWA slice reads/writes only the authenticated inspector's own row via `/v1/inspectors/me*`, scoped by the INSP token — consistent with CLAUDE.md §7.1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An inspector can create and edit a valid base address from the PWA; the payload carries `city = suburb` and no client coordinates, and a saved valid address comes back with coordinates (PWA proof of **00.A5** partial; contract **00.4**).
- **SC-002**: The banner shows the exact text for the correct variant, is non-dismissable, does not block the app, and disappears after a save with coordinates — in 100% of the rendered states.
- **SC-003**: The heartbeat is sent at most once per 6 h per device, with an immediate send on `displayMode` change, correct payload values, and reflected in the web adoption columns (contract **00.10**).
- **SC-004**: `/profile/settings` has the empty push slot as its first content child, then `InstallAppCard`, then a version footer reading `v{pkg.version}+{sha7}` (contract **00.3** slot; L-F01-04, L-F01-12).
- **SC-005**: The manual smoke covers all 6 steps with evidence attached to the PR, and PWA lint, typecheck and unit tests are green.
- **SC-006**: The multi-device cases (Android shared storage, iOS isolated, desktop installed) behave as described and are documented as expected (L-F01-08).
- **SC-007**: The PWA E2E gate (`test-pwa-e2e`, Chromium + WebKit) stays green with the heartbeat, via the new `BASELINE_STUBS` entry (L-X03-05).

## Assumptions

- **A-1 (D1, D2)**: The base address is mandatory at operator creation but nothing blocks the inspector's use of the app; the banner is fixed and non-dismissable with exactly two variants.
- **A-2 (D4, D6)**: Geocoding is performed server-side (TASK-F01-1) in permanent mode with a 4 s timeout; client-sent coordinates are silently stripped by Zod; the PWA never sends or reads raw coordinates it did not get from the backend.
- **A-3 (D8, D9)**: Only push preference exists (no SMS); F01 reserves the slot only, and `push_enabled` before F02 reflects browser permission, not a real subscription.
- **A-4 (D11)**: The PWA uses structured address fields with no autocomplete.
- **A-5 (D12/L-F01-04)**: `pkg.version` only bumps on release; the SHA suffix comes from `APP_BUILD_SHA` (CI `github.sha`, `dev` locally).
- **A-6 (D16/L-F01-08)**: Latest heartbeat wins for `push_enabled`, `app_version`, `app_last_seen_at`; `app_installed_at` is the first standalone from any device; there is no per-device table.
- **A-7 (L-X03-05)**: X03 is merged first, so this PR owns adding the `POST /v1/inspectors/me/app-state` default stub to `BASELINE_STUBS`; the E2E suite is a real gate, not "broken 56/56".
- **A-8**: `/v1/inspectors/me` has no response schema, so the PWA receives exactly what the use case returns, with field visibility already applied server-side; the PWA types it manually.
- **A-9**: The shared package (`@properfy/shared`) is built to `dist/` before PWA typecheck/lint/test (it exports `inspectorBaseAddressSchema` and `AU_STATES` from TASK-F01-1).
- **A-10**: `localStorage` is unreliable under jsdom, so the heartbeat hook takes injected storage and API for testability (repo convention).
