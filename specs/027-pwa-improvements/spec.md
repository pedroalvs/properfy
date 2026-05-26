# Feature Specification: PWA Improvements (Inspector App)

**Feature Branch**: `pwa-fix-1` (working on existing branch, per Guia handoff; spec folder uses `027-pwa-improvements` for catalogue continuity)
**Created**: 2026-05-24
**Status**: Draft — Round 1 of Crítico returned REPROVADA (2 BLOCKERs, 3 MAJORs, 1 MINOR); spec refined for Round 2. All Crítico items addressed; Pedro still to confirm clarifications at human review gate before `/speckit.plan`. See `historico-2` for resolutions log.
**Input**: Brainstorm with Pedro (Guia) on 2026-05-24, six PWA upgrade areas + one backend invoice fix

## Clarifications

### Session 2026-05-24

> **Note**: Pipeline was blocked awaiting Pedro's input. Guia authorised the Arquiteto to apply its recommended Option A for all three critical questions; Pedro will confirm or override at the human review gate before `/speckit.plan` is executed. Each answer below is a *recommended default*, not yet a confirmed product decision.

- **Q1 — Location privacy and map precision (drives Stories 1 & 2)** → A: **Suburb-only everywhere pre-accept.** Offer detail bottom sheet shows region/suburb name (e.g., "Bondi NSW") with no street; map pins are positioned at suburb centroids; full property addresses become visible only after the inspector accepts the group. Rationale: balances enough geographic context for the accept/decline decision with tenant privacy; matches Regras MEDIUM-confidence guidance; same precision policy in both stories simplifies UX and implementation.
- **Q2 — Invoice REJECTED interpretation (drives Story 4)** → A: **No new status; the fix targets the existing `InspectorInvoiceStatus` value that actually blocks the draft, which is to be identified by live reproduction.** Story 4 is delivered in two phases by the same engineer: Phase 4a is diagnostic (reproduce and identify the blocking status), Phase 4b is corrective (extend the exclusion list of `draft-inspector-invoice.use-case.ts` to include that status, plus regression test). The shape and scope of 4b are intentionally not committed at spec time — they follow from what 4a finds. If Phase 4a cannot reproduce the bug with any existing status, Story 4 is suspended and re-clarified (potentially escalating to introducing a new `REJECTED` workflow as a separate spec).
- **Q3 — Inspector availability model reconciliation (drives Story 6)** → A: **Weekly grid is a recurring template that auto-generates per-date `InspectorAvailabilitySlot` rows N weeks forward (default proposal: 8 weeks).** Operators retain the ability to create per-date overrides. Rationale: gives inspectors the simple coarse-grained UX they need for self-service, and lets the per-date system serve as an informational view.
  - **Decision (pwa-fix-1, 2026-05-26):** Inspector availability slots are **informational only** — they do NOT block offer acceptance or manual inspector assignment. `accept-offer` and `assign-inspector-manually` use cases must NOT check slot availability, throw `AvailabilitySlotNotMatchedError`, or decrement slot capacity. Slot data may still be displayed to operators for scheduling visibility, but the accept/assign flow is non-blocking regardless of slot state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Offer Group Detail without Leaving the Offers Screen (Priority: P1)

When an inspector sees a marketplace offer for a service group, they want to inspect every appointment inside that group before committing to accept the whole group — without navigating to a different screen and losing their place in the offers list.

**Why this priority**: Acceptance is irreversible (the group becomes the inspector's commitment). Inspectors today either accept blind or reject offers they could have taken, because they cannot see the per-appointment breakdown. Reducing that friction is the single highest-leverage offers improvement.

**Independent Test**: Open the Offers screen as an authenticated inspector, tap any offer card with at least one appointment, and confirm a panel slides up from the bottom showing every appointment in that group with at least: service type, suburb/region name (street withheld pre-accept), individual payout in AUD, time slot, scheduled date, and branch name. Closing the panel returns to the offers list with scroll position preserved. An "Accept group" action is present at the bottom of the panel and behaves identically to the existing card-level accept.

**Acceptance Scenarios**:

1. **Given** the inspector is viewing the offers list, **When** they tap an offer card, **Then** a bottom sheet opens showing all appointments in the group with the fields listed above and an "Accept group" action.
2. **Given** the bottom sheet is open, **When** the inspector taps outside the sheet or swipes it down, **Then** the sheet closes and the offers list is restored at the same scroll position.
3. **Given** the bottom sheet is open and the inspector taps "Accept group", **Then** the same acceptance flow as the existing card-level action runs (idempotency, capacity check, error states).
4. **Given** an offer with zero remaining appointments (race condition with another inspector), **When** the inspector taps the card, **Then** the sheet shows an empty state with an explanation and the "Accept group" action is disabled.

---

### User Story 2 — Browse Offers on a Map (Priority: P2)

Inspectors prefer to plan their day around proximity. They want to switch the offers view to a geographic map showing where each service group is located, then tap a pin to see the same group detail bottom sheet from Story 1.

**Why this priority**: Most inspectors evaluate offers by location first (commute, fuel, time-of-day routing). A map view is the natural primitive for that decision; today the list-only view forces inspectors to mentally geocode each offer one by one.

**Independent Test**: With at least three active offers across different suburbs, open the Offers screen, tap the "Map" segment of a "List | Map" toggle below the TopBar, and confirm a map renders with one pin per service group positioned at the centroid of its suburb. Tapping a pin opens the Story 1 bottom sheet. Toggling back to "List" restores the list view.

**Acceptance Scenarios**:

1. **Given** the inspector is on the Offers screen, **When** they tap the "Map" segment, **Then** a map view replaces the list with one pin per offer positioned at the centroid of the offer's suburb (street-level precision withheld pre-accept).
2. **Given** the map view is active with at least one offer, **When** the inspector taps a pin, **Then** the same bottom sheet from Story 1 opens for that offer.
3. **Given** the map view is active and zero offers exist, **When** the map loads, **Then** an empty state is shown over the map (e.g., centered card or banner).
4. **Given** the map fails to load (network failure, missing map token, library load error), **When** the user is on the Map tab, **Then** the UI falls back gracefully — either to the list view with an inline warning, or to a clearly labelled error state with a "Retry" affordance.

---

### User Story 3 — Schedule History Tab (Priority: P2)

Inspectors want to look back at appointments they have **completed** (status `DONE`) for reference: confirming payouts, recalling addresses, checking dates of past inspections. Today the Schedule screen only shows upcoming work.

**Why this priority**: Past-work review is needed regularly (weekly invoice reconciliation, customer follow-up, tax records). It is not as urgent as the offers and availability improvements, but the absence of it forces inspectors to ask the operator for records.

**Scope note**: This iteration delivers `DONE`-only history. Cancelled and rejected appointments are explicitly out of scope and will not appear in the History tab. A future iteration may revisit this once `DONE`-only history is in production and validated.

**Independent Test**: As an inspector with at least one `DONE` appointment, open the Schedule screen, switch to a "History" tab, and confirm completed appointments appear newest-first with sticky date headers grouping them by day. Each card shows the appointment code with an inline `Done` status badge.

**Acceptance Scenarios**:

1. **Given** the Schedule screen is open, **When** the inspector taps the "History" tab, **Then** the upcoming view is replaced by a chronological list of `DONE` appointments ordered newest-first.
2. **Given** the History tab is open, **When** appointments span multiple dates, **Then** each date acts as a sticky section header as the user scrolls.
3. **Given** any `DONE` appointment is rendered in History, **When** the inspector views the card, **Then** the appointment code is shown with a `Done` status badge inline next to it.
4. **Given** the inspector has zero `DONE` history, **When** the History tab is opened, **Then** an empty state is shown with an explanatory message.
5. **Given** the History tab is the active view, **When** the inspector switches back to the upcoming view (default tab), **Then** the existing DaySelectorStrip + day-list UX is preserved unchanged.
6. **Given** the inspector has appointments in `CANCELLED` or `REJECTED` status, **When** they open the History tab, **Then** those appointments MUST NOT appear (out of scope for this iteration).

---

### User Story 4 — Invoice Drafting Unblocked After Prior-Period Issue (Priority: P1)

When an inspector tries to draft a new invoice for a billing period, they should not be blocked by a prior invoice for the same period whose lifecycle has terminated in a way that should not preclude a fresh draft.

**Why this priority**: This is a current blocker preventing inspectors from completing month-end invoicing in scenarios reported by Pedro. It directly affects payment cycles and inspector trust.

**Delivery shape**: This story is delivered in two phases by the same implementation engineer, with a hard gate between them. Phase 4a is *diagnostic* (reproduce the reported bug end-to-end on a representative environment and identify exactly which `InspectorInvoiceStatus` value of the prior invoice triggers `INVOICE_PERIOD_OVERLAP`). Phase 4b is *corrective* (extend the exclusion list of `draft-inspector-invoice.use-case.ts` to include the status identified in 4a, and add a regression test that reproduces the bug). The shape of 4b (one-line list change vs. larger refactor) is intentionally **not** committed at spec time; it follows from what 4a discovers. If 4a fails to reproduce the bug with any existing status, the story is suspended and re-clarified before any code change is made.

**Independent Test**: After 4a closes with a confirmed reproducing status `S`, repeat the reproduction: create a prior invoice for period P in status `S` for the inspector, attempt to draft a new invoice for period P, and confirm the new draft is created without `INVOICE_PERIOD_OVERLAP`. Run all existing billing tests + a new regression test that covers the reproduction.

**Acceptance Scenarios**:

1. **Given** the diagnostic Phase 4a is complete, **When** the engineer reports back which status `S` reproduces the bug, **Then** that status is captured in the implementation plan and the corrective Phase 4b targets exactly that status.
2. **Given** a prior invoice for billing period P is in status `S` for an inspector, **When** the inspector starts a new invoice draft for the overlapping period after Phase 4b is deployed, **Then** the draft is created successfully.
3. **Given** a prior invoice for billing period P is in any status *not* identified by Phase 4a as a stale-block (e.g., `OPEN`, `CLOSED`, `PAID`, and any other still-active status), **When** the inspector attempts to draft another invoice for the overlapping period, **Then** the system continues to reject the attempt with `INVOICE_PERIOD_OVERLAP`.
4. **Given** the inspector has no overlapping invoice, **When** they draft a new invoice, **Then** behavior is unchanged from today.
5. **Given** Phase 4a cannot reproduce the bug with any existing status, **When** the engineer reports inconclusive findings, **Then** Story 4 is suspended (no code change applied) and re-clarified before further work.

---

### User Story 5 — Make the App Easier to Install (Priority: P3)

Inspectors are more productive when the PWA is installed to their home screen (full-screen, no browser chrome, offline-ready). Today, install is buried in the Profile screen; many inspectors never discover it. They should encounter a discoverable, dismissible prompt while doing their normal work — **including iOS users**, who do not get a native install event from Safari and need explicit guidance to perform the manual Share → Add to Home Screen flow.

**Why this priority**: A nice-to-have that compounds over time — every install reduces friction for that inspector forever. Lower priority than Stories 1/4/6 because it is not a blocker for any current workflow.

**Independent Test**:
- On an Android Chrome session, open the Schedule screen as an inspector who has never installed the PWA — a dismissible install banner is visible. Tap "Install" and the native browser install prompt appears. Dismiss the banner and confirm it does not reappear within the dismiss cooldown period.
- On an **iOS Safari** session as an inspector who has never installed the PWA, open the Schedule screen — a dismissible iOS-specific install banner is visible explaining the manual step ("Tap the Share button, then Add to Home Screen") with a short visual cue (icon or arrow pointing to the Share affordance). Dismiss it and confirm it does not reappear within the cooldown.
- After completing the manual flow on iOS, open the installed app from the Home Screen icon — it renders in standalone mode with a correctly-sized icon and an appropriate status-bar style.

**Acceptance Scenarios**:

1. **Given** the inspector is on the Schedule screen in a browser that supports the native install prompt (e.g., Android Chrome) and has not yet installed the app, **When** the screen renders, **Then** a dismissible install banner with an "Install" call-to-action is shown.
2. **Given** the install banner is visible on a native-prompt-capable browser, **When** the inspector taps "Install", **Then** the native install prompt is triggered.
3. **Given** the inspector is on the Schedule screen in **iOS Safari** (not running in standalone mode) and has not yet installed the app, **When** the screen renders, **Then** an iOS-specific dismissible install banner is shown that explicitly instructs "Tap the Share icon, then choose **Add to Home Screen**" with a visual cue pointing at the location of the Share affordance in the iOS UI.
4. **Given** the install banner is visible (either flavour), **When** the inspector dismisses it, **Then** the banner does not reappear until the cooldown elapses (default 30 days; see Assumptions).
5. **Given** the browser does not support installation and is not iOS Safari (e.g., desktop Firefox), **When** the Schedule screen renders, **Then** no install banner is shown.
6. **Given** the app is already installed (running in standalone mode on Android, iOS, or other platforms), **When** the Schedule screen renders, **Then** no install banner is shown.
7. **Given** an iOS user adds the app to their Home Screen, **When** they open it from the icon, **Then** the app loads in standalone mode with a properly sized icon and a status-bar style appropriate to the brand theme.

---

### User Story 6 — Inspector Sets Their Weekly Availability (Priority: P1)

Inspectors should be able to express their general weekly availability with a coarse, fast-to-edit UI (one tap per cell on a 7-day × AM/PM grid) so the system can match them with marketplace offers that fit their pattern, without requiring them to manage per-date slot calendars by hand.

**Why this priority**: Availability is the gate for marketplace matching — inaccurate availability means missed offers (lost income) or accepting work the inspector cannot perform (broken commitments). The current per-date slot management is operator-oriented and not suited for inspector self-service. Giving inspectors a coarse weekly grid in Profile is the missing piece.

**Independent Test**: Open Profile as an inspector, see a new "Availability" section showing a 7×2 grid of cells (days of the week × AM/PM). Tap any cell to toggle it on/off. Reload the screen and confirm the toggles persist. Trigger a marketplace match for a day/period that the inspector previously toggled off and confirm no per-date slot is generated for that window in the rolling 8-week horizon and that no offer is routed for it.

**Acceptance Scenarios**:

1. **Given** the Profile screen is open, **When** the inspector scrolls to the Availability section, **Then** a 7×2 grid is rendered with one cell per day-of-week × AM/PM combination.
2. **Given** a cell is in its inactive state, **When** the inspector taps it, **Then** the cell becomes active and the change is persisted to the backend.
3. **Given** a cell is in its active state, **When** the inspector taps it, **Then** the cell becomes inactive and the change is persisted.
4. **Given** the inspector reloads the app or signs back in, **When** they revisit the Availability section, **Then** the grid reflects their last saved state.
5. **Given** the inspector toggles all cells off, **When** marketplace matching runs, **Then** no new offers are routed to them (with optional UI warning at toggle time).
6. **Given** the inspector turns a cell OFF, **When** at least one operator-created per-date slot still keeps that day-of-week × AM/PM window bookable in the 8-week horizon, **Then** the grid cell displays a secondary visual state (e.g., a small badge with text such as "Externally scheduled") so the inspector understands they may still be matched against that window through an operator override.
7. **Given** the inspector turns a cell OFF and an operator-created per-date slot in the window has zero remaining capacity (already exhausted by accepted offers), **When** the grid renders, **Then** the cell shows no secondary indicator — the override has no future scheduling impact and the OFF state is effectively complete for new matching.

---

### Edge Cases

- **Offers bottom sheet — empty group**: A previously listed group has had every appointment accepted by other inspectors by the time the inspector opens the detail sheet. The sheet must render a clear empty state and disable acceptance.
- **Map view — zero offers**: The map must render with a sensible default centre/zoom and an empty-state overlay.
- **Map view — missing Mapbox token or library load failure**: The Map tab must not white-screen; it must either fall back to the list view with an inline warning, or surface a labelled error with a retry affordance.
- **Schedule History — empty**: A newly onboarded inspector with no `DONE` appointments must see a friendly empty state, not a perpetual loader.
- **Schedule History — only non-DONE history**: An inspector whose entire past consists of `CANCELLED` or `REJECTED` appointments must see the same empty state as an inspector with no past at all (those statuses are out of scope for this iteration).
- **Invoice draft — no eligible appointments in period**: A separate empty/blocked state already exists for this scenario; Story 4 must not change it.
- **PWA install banner — unsupported browser**: The banner must not appear on desktop browsers that cannot install and are not iOS Safari (e.g., desktop Firefox in default config).
- **PWA install — iOS standalone**: When the app is opened from the iOS Home Screen, the manifest meta tags must produce standalone behaviour (no Safari chrome) and a correctly sized icon.
- **PWA install — iOS Safari in non-standalone**: The iOS-specific install banner (Story 5 acceptance #3) must appear and instruct the manual flow; once installed (standalone), no banner.
- **Availability grid — all cells off**: The system must allow this state (e.g., inspector on holiday) without throwing errors; matching simply yields nothing for inspector-driven availability. Operator overrides (if any) still apply per the merge rules below.
- **Availability — template regeneration vs. existing per-date slot (the merge rule)**: On every save of the weekly grid, the backend regenerates the next 8 weeks of per-date slots for the inspector. When the regeneration encounters an existing slot in a window the inspector has now toggled ON, OFF, or kept unchanged, the following rules MUST apply, in this priority order:
  1. **Slot with capacity already consumed by an accepted offer** (`capacity_remaining < capacity_total`): the regeneration MUST leave the slot untouched (neither updated nor removed). Accepted offers are commitments and cannot be disrupted by an availability edit.
  2. **Slot with operator override** (operator-created slot or a slot flagged as `override = true`): the regeneration MUST treat the slot as **immutable** — neither updated nor removed. Only an operator action can change it. The inspector's grid cell shows the secondary "Externally scheduled" indicator (Story 6 acceptance #6) when such a slot exists and the inspector cell is OFF.
  3. **Slot with no override and no consumed capacity, in a cell the inspector currently has ON**: the regeneration MUST keep the slot, optionally refreshing fields that depend on the template (e.g., default capacity = 1) but never reducing capacity below `capacity_remaining`.
  4. **Slot with no override and no consumed capacity, in a cell the inspector currently has OFF**: the regeneration MUST delete the slot (the inspector has retracted that availability and no operator override or commitment opposes the deletion).
  5. **No slot exists in a window the inspector has ON**: the regeneration MUST create a slot with the default capacity (see Assumptions).
  6. **No slot exists in a window the inspector has OFF**: no action; nothing is created.
- **Availability — model never silently destroys data**: The regeneration MUST be implemented such that no operator-created slot, no slot with consumed capacity, and no slot with override is ever overwritten or deleted by an inspector grid edit. The merge rules above are the contract.

## Requirements *(mandatory)*

### Functional Requirements

**Offers — Group Detail Bottom Sheet (Story 1)**

- **FR-001**: System MUST display every appointment of a service group when an inspector taps an offer card, showing at minimum: service type, location (per FR-002), individual payout in AUD with the project's standard currency formatting, time slot, scheduled date, and branch name.
- **FR-002**: System MUST present location at the suburb/region granularity before acceptance — the suburb name (and state) but not the street address. The full street address only becomes visible to the inspector after they have accepted the group.
- **FR-003**: System MUST provide an "Accept group" action in the detail view that triggers the same acceptance flow currently available from the offer card.
- **FR-004**: System MUST preserve the inspector's scroll position in the offers list when the detail panel is dismissed.
- **FR-005**: System MUST handle the case of a group with zero remaining appointments by showing an empty state and disabling the accept action.

**Offers — Map View (Story 2)**

- **FR-010**: System MUST provide a toggle between list and map views of the offers screen, with both views derived from the same source of offers.
- **FR-011**: System MUST render one geographic marker per active service group on the map at the centroid of the group's suburb (street-level precision withheld pre-accept; same privacy policy as FR-002).
- **FR-012**: System MUST open the same Story 1 detail panel when the inspector taps a marker.
- **FR-013**: System MUST provide an empty-state presentation when zero offers exist in map view.
- **FR-014**: System MUST degrade gracefully when the map cannot render (missing configuration, network failure, library load error), without crashing the screen.

**Schedule — History Tab (Story 3)**

- **FR-020**: System MUST present a History tab on the Schedule screen alongside the existing upcoming view.
- **FR-021**: System MUST list past appointments in newest-first order in the History tab with sticky date headers as the user scrolls.
- **FR-022**: System MUST display the appointment code with an inline status badge for each item in History.
- **FR-023**: System MUST allow the inspector to access at least their most recent 24 months of history (UI default window: 90 days; older entries paginated/loaded on demand).
- **FR-024**: System MUST include in History only appointments in `DONE` status by default. Including `CANCELLED` and `REJECTED` history is out of scope for this iteration.
- **FR-025**: System MUST scope History strictly to appointments associated with the requesting inspector (no cross-inspector visibility).
- **FR-026**: System MUST preserve the existing upcoming-view behaviour (DaySelectorStrip + 7-day past lookback + 60-day forward) when the inspector is on the default tab.

**Earnings — Invoice Period Overlap Fix (Story 4)**

- **FR-030**: System MUST allow an inspector to draft a new invoice for a billing period when the only overlapping prior invoice is in a status the project considers non-blocking for redraft. The specific status(es) added to the exclusion list MUST be confirmed by a live bug reproduction during planning/implementation. The current hypothesis is that `PENDING_REVIEW` is the missing exclusion; if reproduction confirms a different status, that status is added instead. No new invoice status is introduced by this spec.
- **FR-031**: System MUST continue to reject overlapping drafts when an active prior invoice exists for the same period in any status not in the exclusion list (e.g., `OPEN`, `CLOSED`, `PAID`).
- **FR-032**: System MUST record an audit log entry whenever an invoice transition triggers the unblock path (using the existing audit infrastructure).

**PWA Install — Discoverability + iOS polish (Story 5)**

- **FR-040**: System MUST display a dismissible native-prompt install banner on the Schedule screen for sessions that meet ALL of: not already installed, on a browser supporting the `beforeinstallprompt` event (e.g., Android Chrome, desktop Chromium), and not within an active native-banner dismiss cooldown.
- **FR-041**: System MUST persist the dismiss state across sessions for the cooldown duration (default 30 days; see Assumptions). The persisted dismiss state MUST distinguish the native-prompt banner (Story 5 scenario #1) from the iOS-specific banner (Story 5 scenario #3) so dismissing one does not silently suppress the other if the inspector later switches browser/device.
- **FR-042**: System MUST trigger the native install prompt when the inspector confirms installation from the native-prompt banner.
- **FR-043**: System MUST not display either banner when the app is already installed (running in standalone display mode on the platform).
- **FR-044**: System MUST display an iOS-specific dismissible install banner on the Schedule screen for sessions in iOS Safari that are NOT running in standalone mode and NOT within an active iOS-banner dismiss cooldown. The banner MUST include the textual instruction "Tap the Share icon, then choose Add to Home Screen" and a visual cue identifying the location of the Share affordance in the iOS browser UI. The banner MUST NOT attempt to trigger any native install prompt (none exists on iOS Safari).
- **FR-045**: System MUST not display any install banner on browsers that neither support installation nor are iOS Safari (e.g., desktop Firefox).
- **FR-046**: System MUST include the meta tags and icon assets required for a polished iOS Home Screen installation experience: an `apple-mobile-web-app-capable` meta tag, an appropriate `apple-mobile-web-app-status-bar-style`, and `apple-touch-icon` assets sized to current iOS recommendations.
- **FR-047**: System MUST provide the icon assets declared in the web app manifest (sizes consistent with the manifest declarations) so that installed instances render a correct icon on Android and Chromium platforms.

**Inspector Availability (Story 6)**

- **FR-050**: System MUST present a 7×2 weekly availability grid (days of the week × AM/PM) in the inspector's Profile screen.
- **FR-051**: System MUST persist each cell toggle to the backend per inspector.
- **FR-052**: System MUST restore the grid state on subsequent sessions from the backend.
- **FR-053**: System MUST treat the inspector's weekly grid as a **recurring template** that regenerates the next 8 weeks of per-date `InspectorAvailabilitySlot` rows for the inspector on every save. The merge rules between the regenerated template and existing per-date slots are normative and MUST be implemented exactly as specified in the **Edge Cases** section under "Availability — template regeneration vs. existing per-date slot (the merge rule)". No slot with consumed capacity or operator override is ever overwritten by inspector-driven regeneration. **Decision (pwa-fix-1, 2026-05-26):** Availability slots are informational only — `accept-offer`, `assign-inspector-manually`, and `cancel-service-group` MUST NOT modify slot capacity (no decrement on accept/assign, no increment on cancel). Slot data is for operator visibility only.
- **FR-056**: System MUST surface to the inspector — on the grid cell UI — a secondary indicator when an OFF cell is still effectively bookable through an operator-created per-date slot with remaining capacity. The indicator MUST be visually distinct from both the ON and OFF default states and MUST include explanatory text (e.g., "Externally scheduled") accessible to screen readers.
- **FR-054**: System MUST treat the AM and PM cells as time windows per the mapping resolved in planning (default proposal in Assumptions).
- **FR-055**: System MUST allow the all-cells-off state without errors; matching simply yields no new offers for that inspector.

**Cross-cutting**

- **FR-060**: System MUST render every monetary value introduced by this feature in AUD using the project's existing currency formatting utility (locale `en-AU`, A$ prefix).
- **FR-061**: System MUST preserve existing multi-tenant safety: every backend query introduced or modified MUST scope by tenant and inspector identity per existing RBAC.
- **FR-062**: System MUST validate every new or modified API payload with Zod schemas, per project convention.

### Key Entities *(include if feature involves data)*

- **Marketplace Offer Detail**: An existing read model that already surfaces a service group with its list of appointments. This feature consumes it from the PWA for the first time and may extend its response (e.g., to include geographic information for map pins) based on the geocoding decision in clarification Q1.
- **Inspector Schedule History**: The read view of past appointments for the requesting inspector. May be served by extending the existing single-date inspector schedule endpoint or by a sibling endpoint dedicated to range/history queries.
- **Inspector Invoice**: The existing draftable financial entity whose lifecycle gates redrafting; the lifecycle is being amended in scope per clarification Q2.
- **Inspector Weekly Availability**: A new representation of inspector availability at the day-of-week × half-day level. Its persistence shape and relationship to the existing per-date `InspectorAvailabilitySlot` table are pending clarification Q3.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Inspectors can review every appointment in a marketplace offer without leaving the Offers screen (no full-page navigation between list and detail).
- **SC-002**: Inspectors can switch between list and map presentations of offers in one tap, with the second presentation rendering within 1 second on a typical mid-tier mobile device on a 4G connection.
- **SC-003**: An inspector with at least one completed appointment can see their most recent history page in under 2 seconds from tapping the History tab on a typical mobile device.
- **SC-004**: Zero invoice-draft attempts blocked by the `INVOICE_PERIOD_OVERLAP` error in the resolved unblock scenario, measured across a 30-day window after release.
- **SC-005**: At least 80% of inspectors using a browser that supports installation see the install banner at least once.
- **SC-006**: An inspector's change to their weekly availability propagates to marketplace matching within 1 minute of saving.
- **SC-007**: All AUD currency values introduced by this feature render consistently with the "A$" prefix and en-AU decimal formatting.
- **SC-008**: The installed iOS instance renders the brand icon at the correct size on the Home Screen with no browser chrome visible inside the app.

## Assumptions

- **Audience**: Inspectors are using iOS Safari, Chrome on Android, or a Chromium-derived browser that supports the `beforeinstallprompt` event.
- **Auth and RBAC**: The existing JWT auth and tenant scoping remain in place; no changes to the auth model are in scope.
- **Schedule endpoint extensibility**: The existing `GET /v1/inspector/schedule` endpoint can be extended (or a sibling endpoint added) without breaking the current upcoming-view consumer.
- **Marketplace detail extensibility**: The existing `GET /v1/marketplace/offers/:groupId` response can be extended with optional fields (e.g., geographic information) without breaking any current consumer.
- **Currency formatter**: The existing `apps/pwa/src/lib/format-currency.ts` is the single source of truth for monetary display; all new monetary UI uses it.
- **Status-badge component**: The existing `StatusChip` component with `APPOINTMENT_STATUS_MAP` is reused for inline status badges in History.
- **Install hook**: The existing `useInstallPrompt` hook is reused; only new UI surfaces are introduced.
- **Profile InstallAppCard**: The existing Profile-screen install card is unchanged in scope; only a new Schedule banner is added.
- **Mapbox token**: `VITE_MAPBOX_TOKEN` is already configured in the PWA build; the `mapbox-gl` library is not yet installed and must be added during planning.
- **AM/PM mapping**: AM = 08:00–13:00, PM = 13:00–18:00, in the inspector's local timezone. (Default applied by Arquiteto; Pedro may revise at the human gate.)
- **Default availability cell capacity**: 1 per active cell. (Default applied by Arquiteto.)
- **Install banner cooldown**: Dismissing the banner suppresses it for 30 days; reappears after that interval if still eligible. (Default applied by Arquiteto.)
- **History default window**: UI loads the most recent 90 days first; older entries paginate up to a 24-month retention horizon. (Default applied by Arquiteto.)
- **Address granularity pre-accept**: Suburb/region centroid only, no street address, per Clarifications Q1. Aligns with Regras MEDIUM-confidence read.
- **Map pin precision**: Suburb-level centroid, per Clarifications Q1 (same policy as the bottom sheet).
- **Availability template horizon**: Weekly grid auto-generates per-date slots for the next 8 weeks on every save, per Clarifications Q3. Planning may revise the horizon if cron/refresh trade-offs require it.
- **Invoice status under exclusion**: The exact `InspectorInvoiceStatus` value to add to the exclusion list in `draft-inspector-invoice.use-case.ts` is intentionally not pre-committed; it is the output of Story 4 Phase 4a (diagnostic reproduction). The shape of the corrective change (one-line list change vs. larger refactor) follows from what 4a discovers. If 4a cannot reproduce the bug with any existing status, Story 4 is suspended and re-clarified.
- **No web app changes**: This feature is PWA + minimal backend only. Operator/admin web app is out of scope.
- **No notification template changes**: The notification rules in CLAUDE.md remain untouched.

## Out of Scope

- Pricing or split changes to service groups or appointments.
- Notification template edits or new notification events.
- Adding a new `REJECTED` invoice status or any operator-side rejection workflow (Story 4 explicitly does not introduce a new status; if business intent later requires one, it becomes a separate spec).
- `CANCELLED` and `REJECTED` appointments in Schedule History (DONE-only for this iteration).
- Master Admin or Imobiliária web app changes.
- Multi-language UI (the PWA remains English-only).
- Native mobile apps (the inspector experience remains a PWA).
