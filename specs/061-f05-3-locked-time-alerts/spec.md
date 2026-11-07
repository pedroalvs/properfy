# Feature Specification: Locked time and per-inspector alert limits (web)

**Feature Branch**: `061-f05-3-locked-time-alerts`
**Created**: 2026-11-06
**Status**: Draft
**Input**: User description: "F05-3 Locked time e limites de alerta por inspetor (web)"

## Overview

This is the **web-only** closing slice of F05 (Live Day). It consumes the already-merged
F05-1 backend contract (`GET /v1/dashboard/locked-time`, `GET`/`PUT /v1/inspectors/:id/alert-thresholds`,
and the `liveDayAlerts` key of `GET`/`PUT /v1/platform-settings/:key`) and the F05-2 Live Day
screen. It ships **no** backend, Prisma schema, or `packages/shared` change, and it does **not**
regenerate `api-types.ts` — every path and schema it needs is already on `develop`.

It delivers three things for Admin Master / Operator users:

1. A **"Locked time"** tab inside the Live Day panel (contract item **01.13**): the share of
   inspections that need the rental tenant to confirm and are already confirmed, broken down by
   agency and by region over a civil-date period (default: the next 14 days starting from today).
2. **Alert-limit configuration** (contract item **01.A5**): the platform default lives in the
   "Platform settings" page (a new "Live Day alerts" section), and an optional per-inspector
   override lives in a new section of the inspector detail drawer. A change is reflected on the
   Live Day within the next polling cycle.
3. A **navigation path** from the Live Day inspector view to that inspector's profile: an
   "Open inspector" link to `/inspectors?open=<id>`, plus `InspectorListPage` learning to open the
   detail drawer from the `?open=<id>` URL parameter (L-F05-14).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how much of the upcoming workload is confirmed ("Locked time", 01.13) (Priority: P1)

An Admin Master or Operator is watching the Live Day. They switch to the **"Locked time"** tab to
see, for a chosen upcoming period, what share of the inspections that require the rental tenant to
confirm are already confirmed ("locked") — overall, per agency, and per region — so they can chase
the agencies and regions that are lagging before the appointments reach T-1.

**Why this priority**: This is contract item 01.13, one of the two mandatory deliverables of this
task. It stands alone: the tab is viewable and useful without the alert-limit work.

**Independent Test**: Open `/live-day` as AM/OP, switch to the "Locked time" tab, change the period,
and verify the overall / by-agency / by-region figures and the period subtitle. No alert-limit
configuration is required.

**Acceptance Scenarios**:

1. **Given** an AM/OP on `/live-day`, **When** the panel renders, **Then** a tab strip offers
   "Inspectors" (default, active) and "Locked time".
2. **Given** the Live Day open on the "Inspectors" tab, **When** the user clicks "Locked time",
   **Then** the panel shows the locked-time content and the map keeps its pins and routes
   (only the panel body changes), and the "Route ETA accuracy" footer stays visible on both tabs.
3. **Given** a deep link `/live-day?tab=locked`, **When** the page loads, **Then** it opens on the
   "Locked time" tab.
4. **Given** the "Locked time" tab with data for 3 appointments where 2 are confirmed, **When** it
   renders, **Then** it shows the title "Locked time", the help text "Share of inspections that
   need the tenant to confirm and are already confirmed.", a summary "Overall: 66.7% locked
   (2 of 3)" with a horizontal `role="meter"` bar, a "By agency" table
   (columns Agency · Locked · Confirmed / Required) and a "By region" table
   (columns Region · Locked · Confirmed / Required).
5. **Given** a region row with `{ regionName: 'North', agencyName: 'Ray White' }`, **When** it
   renders, **Then** the Region cell reads "North · Ray White"; a row with `agencyName: null`
   (global region) reads "North · Platform"; and the "No region" row has no suffix and is always
   last, in any sort order (L-F05-13).
6. **Given** a row whose `percent` is `null` (because `required` is 0 for that group), **When** it
   renders, **Then** the Locked cell shows "—" with `aria-label` "No inspections need confirmation".
7. **Given** the "By agency" or "By region" table, **When** the user clicks the "Locked" column
   header, **Then** the rows sort ascending/descending on the client with `aria-sort` reflecting the
   state, while "No region" stays at the bottom.
8. **Given** the Period selector ("Next 7 days" / "Next 14 days" (default) / "Next 30 days"),
   **When** the user picks a period, **Then** a new query runs and the subtitle shows the real civil
   range (e.g. "5 Nov – 18 Nov"), always starting from the Live Day server-side `today`, even when
   the "Inspectors" tab's selected date is a different (past) day (L-F05-09).
9. **Given** a period where every group has `required` 0, **When** the tab renders, **Then** an
   empty state reads "No inspections need tenant confirmation in this period.".
10. **Given** the locked-time query fails, **When** the tab renders, **Then** it shows
    "We couldn't load locked time." and a "Try again" action; **and** while loading it shows a
    two-table skeleton.

---

### User Story 2 - Configure Live Day alert limits (platform default + per-inspector override, 01.A5) (Priority: P1)

An Admin Master or Operator sets the platform-wide "delay" and "not-started" alert limits in
"Platform settings", and can override either limit for a specific inspector from that inspector's
detail drawer. The Live Day reflects the change on its next cycle.

**Why this priority**: This is contract item 01.A5, the second mandatory deliverable. It is the
control surface for the Live Day alerts that F05-1/F05-2 already compute and display.

**Independent Test**: In "Platform settings", change the delay default and save; in an inspector's
drawer, set a delay override and save; reload the Live Day and confirm the alert threshold the
Live Day uses matches (the `GET /v1/dashboard/live-day` response reflects the new effective limit).

**Acceptance Scenarios** — Platform default:

1. **Given** an AM/OP on `/platform-settings`, **When** the page renders, **Then** it has a
   "Live Day alerts" section with "Delay alert (min)" = 20 and "Not-started alert (min)" = 30 (the
   current platform defaults), plus the help "Applies to every inspector without a custom limit.
   Changes show on the Live Day within a minute.".
2. **Given** the "Live Day alerts" section, **When** the user enters a value outside 5–240 and
   saves, **Then** the field shows "Enter a value between 5 and 240 minutes." and nothing is sent.
3. **Given** valid values, **When** the user saves, **Then** a `PUT /v1/platform-settings/liveDayAlerts`
   is sent with `{ delayMinutes, notStartedMinutes }` and a "Settings saved." snackbar appears;
   last-write-wins (F03 D18).
4. **Given** the existing "Field events", "Route planning" and "Tenant arrival notices" sections,
   **When** this section is added, **Then** those sections are unchanged.

**Acceptance Scenarios** — Per-inspector override (inspector detail drawer, "Details" tab):

5. **Given** an AM/OP opening an inspector's drawer, **When** the "Details" tab renders, **Then** a
   "Live Day alerts" section appears after the existing sections showing two read rows,
   "Delay alert after: 20 min (platform default)" / "15 min (custom)" and "Not-started alert after:
   30 min (platform default)", with an "Edit" button.
6. **Given** a CL_ADMIN opening an inspector drawer, **When** it renders, **Then** the "Live Day
   alerts" section does not appear and no alert-thresholds request is made (the hook is disabled;
   no 403 in the console).
7. **Given** the user clicks "Edit", **When** the form opens, **Then** it has two numeric fields
   (min 5, max 240, step 1) each with a "Use platform default ({n} min)" checkbox that disables its
   field, and focus moves to the first field.
8. **Given** the override form, **When** the user enters 4, or leaves a field empty without checking
   its box, or enters a decimal, **Then** that field shows "Enter a value between 5 and 240 minutes.".
9. **Given** the user sets the delay to 15 and checks "Use platform default" for not-started,
   **When** they click "Save", **Then** a `PUT` is sent with `{ delayMinutes: 15, notStartedMinutes: null }`,
   a "Alert limits saved." snackbar appears, the form returns to the read view, and focus returns to
   "Edit".
10. **Given** the save fails with a 400/500, **When** the error returns, **Then** the server message
    shows in the form via `role="alert"` and the entered values are kept.
11. **Given** the override form, **When** the user clicks "Cancel" or presses Escape, **Then** edits
    are discarded, the read view returns, and focus returns to "Edit".
12. **Given** a saved override, **When** the override `PUT` succeeds, **Then** both the inspector's
    own alert-thresholds query and the `['live-day']` query are invalidated so the next Live Day poll
    uses the new limit.

---

### User Story 3 - Jump from a Live Day inspector to their profile to set limits (L-F05-14) (Priority: P2)

From the Live Day inspector detail view, an AM/OP follows an "Open inspector" link to the inspector's
profile (same tab) where the alert-limit override lives, and the inspector list opens that
inspector's drawer directly from the URL.

**Why this priority**: It is the glue that makes US2's override discoverable from the Live Day, and
it makes the inspector drawer linkable. It is valuable but depends on US2 existing to be meaningful.

**Independent Test**: In the Live Day inspector view, click "Open inspector"; confirm the browser
lands on `/inspectors?open=<that id>` with the drawer open; close the drawer and confirm `open` is
removed from the URL; load `/inspectors?open=<unknown uuid>` and confirm the "no longer exists" state.

**Acceptance Scenarios**:

1. **Given** the Live Day inspector view for inspector "Jane", **When** it renders, **Then** below
   the heading there is an "Open inspector" link with `href="/inspectors?open=<Jane's id>"` and the
   helper text "Alert limits for this inspector are set in their profile".
2. **Given** a navigation to `/inspectors?open=<existing id>`, **When** the list page loads,
   **Then** the inspector detail drawer opens for that `inspectorId`.
3. **Given** the drawer opened from `?open=<id>`, **When** the user closes it, **Then** `open` is
   removed from the URL using `replace` (no extra history entry).
4. **Given** `/inspectors?open=<unknown uuid>` where the detail GET returns 404, **When** it loads,
   **Then** the drawer shows "This inspector no longer exists." (a new drawer state) with no console
   error.
5. **Given** `/inspectors?open=abc` (not a uuid), **When** it loads, **Then** the parameter is
   ignored and no drawer opens.
6. **Given** the existing row-click path to open the drawer, **When** this feature ships, **Then**
   that path still works unchanged.

---

### Edge Cases

- **Agency with `required` 0 in the period**: it does not appear as a row (the query only aggregates
  groups that exist). When every group is 0, the whole tab shows the empty state.
- **Long agency name**: truncated with a `title`, full name in `aria-label`.
- **Override equal to the default** (e.g. 15 when the default is 15): it is stored as a custom
  override and shown as "(custom)"; later changing the default does not affect that inspector.
- **Override on one field only**: the other field stays "(platform default)" and follows later
  default changes.
- **Both fields set to "Use platform default"**: the `PUT` sends `{ null, null }` and the stored
  override becomes empty for both fields.
- **Default changed while the Live Day is open**: the platform-setting cache (30 s) plus the 30 s
  poll make the new value appear within roughly 60 s (as the help text states).
- **Inspector drawer opened by CL_ADMIN**: the alert-limits section is not rendered and its hook is
  disabled (no 403 noise).
- **Inspector deleted between opening and saving the override**: the 404 surfaces as
  "This inspector no longer exists." in the form.
- **"Inspectors" tab on another date**: "Locked time" still shows "Next N days" starting from today
  (L-F05-09).
- **Two regions with the same name in different agencies**: two distinct rows, told apart by the
  agency suffix (L-F05-13).
- **"Open inspector" for a deleted/inactive inspector**: `?open=` opens the drawer with
  "This inspector no longer exists." (404) or shows the inactive inspector normally; CL never reaches
  this because the Live Day is AM/OP-only (L-F05-14).
- **Switching the Live Day tab**: does not stop the Live Day polling and does not clear the selected
  inspector (returning to "Inspectors" shows the same selection).

## Requirements *(mandatory)*

### Functional Requirements

#### Locked time tab (01.13)

- **FR-001**: The Live Day panel MUST present a tab strip with "Inspectors" (default) and
  "Locked time", with the active tab reflected in the URL as `?tab=locked` (written with `replace`).
- **FR-002**: Switching tabs MUST NOT stop the Live Day polling and MUST NOT clear the selected
  inspector; the map pins and routes MUST remain, and the "Route ETA accuracy" footer MUST stay
  visible on both tabs.
- **FR-003**: The "Locked time" tab MUST read `GET /v1/dashboard/locked-time?from&to`, where `from`
  is the Live Day server-side `today` and `to` is `from` + (period − 1) civil days, computed with
  the shared civil-date helpers, independent of the date selected on the "Inspectors" tab (L-F05-09).
- **FR-004**: The tab MUST offer a Period selector with "Next 7 days", "Next 14 days" (default) and
  "Next 30 days"; changing it MUST issue a new query and update the subtitle to the real civil range
  formatted without a timezone (e.g. "5 Nov – 18 Nov"), because these are civil dates.
- **FR-005**: The tab MUST show an overall summary "Overall: {percent}% locked ({confirmed} of
  {required})" with a `role="meter"` bar (`aria-valuenow`, `aria-valuemin` 0, `aria-valuemax` 100),
  a "By agency" table (Agency · Locked · Confirmed / Required) and a "By region" table
  (Region · Locked · Confirmed / Required), both compact.
- **FR-006**: Percentages MUST render to one decimal place (e.g. "66.7%"); a `null` percent (group
  with `required` 0) MUST render as "—" with `aria-label` "No inspections need confirmation".
- **FR-007**: The Region cell MUST read "{regionName} · {agencyName}" for an agency-owned region,
  "{regionName} · Platform" for a global region (`agencyName` null), and "{regionName}" with no
  suffix for "No region"; the "No region" row MUST always sort last (L-F05-13).
- **FR-008**: The "Locked" column MUST be client-side sortable (ascending/descending) with `aria-sort`
  on the header; "No region" stays last regardless of sort direction.
- **FR-009**: The tab MUST implement loading (two-table skeleton), empty ("No inspections need tenant
  confirmation in this period."), and error ("We couldn't load locked time." + "Try again") states.
- **FR-010**: The locked-time query MUST NOT poll and MUST use a `staleTime` of 60 s; its query key
  MUST be `['locked-time', from, to]`.

#### Alert limits — platform default (01.A5)

- **FR-011**: The "Platform settings" page MUST gain a "Live Day alerts" section driven by the
  existing `usePlatformSetting('liveDayAlerts')` plumbing, with "Delay alert (min)" and
  "Not-started alert (min)" numeric fields (5–240) and the help "Applies to every inspector without
  a custom limit. Changes show on the Live Day within a minute.".
- **FR-012**: The section MUST validate 5–240 with the message "Enter a value between 5 and 240
  minutes." and, on save, MUST `PUT /v1/platform-settings/liveDayAlerts` with
  `{ delayMinutes, notStartedMinutes }`, showing "Settings saved." on success (last-write-wins).
- **FR-013**: Adding this section MUST NOT change the existing "Field events", "Route planning" and
  "Tenant arrival notices" sections, and MUST participate in the page's combined unsaved-changes
  back-guard the same way the other sections do.

#### Alert limits — per-inspector override (01.A5)

- **FR-014**: The inspector detail drawer's "Details" tab MUST show a "Live Day alerts" section
  (after the existing sections) **only for AM/OP**; for CL roles the section MUST NOT render and the
  underlying `GET /v1/inspectors/:id/alert-thresholds` hook MUST be disabled.
- **FR-015**: The read view MUST show two rows — "Delay alert after" and "Not-started alert after" —
  each with the effective value and the suffix "(platform default)" or "(custom)" depending on
  whether an override exists for that field, plus an "Edit" button and the help "Live Day flags this
  inspector when they're later than this. Leave on the platform default unless this inspector needs a
  different limit.".
- **FR-016**: The edit form MUST have two numeric fields (5–240, step 1) labelled "Delay alert after
  (min)" and "Not-started alert after (min)", each with a "Use platform default ({n} min)" checkbox
  that disables and blanks its field; opening the form moves focus to the first field.
- **FR-017**: Validation MUST reject out-of-range (4), empty-without-the-box, and decimal values with
  "Enter a value between 5 and 240 minutes."; a checked box means that field sends `null`.
- **FR-018**: Saving MUST `PUT /v1/inspectors/:id/alert-thresholds` with the strict body
  `{ delayMinutes, notStartedMinutes }` (each an integer 5–240 or `null`), show "Alert limits saved.",
  return to the read view, and move focus back to "Edit"; on 400/500 the server message shows via
  `role="alert"` and the entered values are kept; "Cancel"/Escape discards and returns to read.
- **FR-019**: A successful override `PUT` MUST invalidate both the inspector's own alert-thresholds
  query and the `['live-day']` query so the next Live Day poll uses the new limit.
- **FR-020**: An inspector deleted between opening and saving (404 on GET/PUT) MUST surface as
  "This inspector no longer exists." in the form.

#### Navigation path (L-F05-14)

- **FR-021**: The Live Day inspector detail view MUST show, below the inspector heading, an
  "Open inspector" link (same tab) to `/inspectors?open=<inspectorId>` with the helper text
  "Alert limits for this inspector are set in their profile".
- **FR-022**: `InspectorListPage` MUST read `?open=<uuid>` from the URL and initialise the detail
  drawer open for that inspector; closing the drawer MUST remove `open` from the URL with `replace`.
- **FR-023**: `?open=<unknown uuid>` (GET 404) MUST render a new drawer state "This inspector no
  longer exists." with no console error; `?open=<non-uuid>` MUST be ignored (no drawer).
- **FR-024**: The existing row-click path to open the drawer MUST continue to work unchanged.

#### Cross-cutting

- **FR-025**: Every surface in this feature (the "Locked time" tab, the drawer section, the settings
  section, the "Open inspector" link) is AM/OP-only and fully keyboard-operable, with 0 axe
  violations. The `apps/web` workspace has no axe engine (apps/web/CLAUDE.md §12.14; F05-2
  precedent), so this is verified through explicit ARIA/keyboard invariants in the component tests
  (roles, `aria-sort`, `role="meter"`, focus management, Escape handling) plus the manual QA pass —
  the same way prior F05/F09 web features met it.
- **FR-026**: The feature MUST NOT change any backend code, Prisma schema, `packages/shared`, or the
  generated `api-types.ts`; every endpoint and type it uses is already on `develop`.
- **FR-027**: The feature MUST NOT change `/analytics`, the `ConfirmationMeter`, or any existing
  dashboard screen (D9, D12), and MUST NOT reuse the `/analytics` hooks or `ConfirmationMeter`.
- **FR-028**: All civil dates and labels MUST be formatted with the shared timezone/date helpers in
  `PLATFORM_TIMEZONE` terms (no browser timezone in business logic); the locked-time range is civil
  dates and is formatted without a timezone.

### Key Entities *(include if feature involves data)*

- **Locked-time breakdown** (`GET /v1/dashboard/locked-time`): `from`, `to`, `generatedAt`,
  `overall` (`confirmed`, `required`, `percent` nullable), `byAgency[]` (`tenantId`, `agencyName`,
  `confirmed`, `required`, `percent`), `byRegion[]` (`regionId` nullable where null = "No region",
  `regionName`, `agencyName` nullable where null = global region or "No region", `confirmed`,
  `required`, `percent`). "Locked" = numerator ÷ denominator defined by D21 on the backend; the web
  only displays it.
- **Inspector alert thresholds** (`GET`/`PUT /v1/inspectors/:id/alert-thresholds`): response
  `inspectorId`, `platformDefaults` (`delayMinutes`, `notStartedMinutes`), `override` (each nullable),
  `effective` (resolved per field). The `PUT` body is strict: `{ delayMinutes, notStartedMinutes }`,
  each an integer 5–240 or `null` (null = use the platform default for that field).
- **Live Day alerts platform setting** (`liveDayAlerts` key of `/v1/platform-settings/:key`):
  `{ delayMinutes, notStartedMinutes }`, each an integer 5–240, defaults `{ 20, 30 }`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (01.13)**: Contract item **01.13** is visible in the Live Day — share of locked
  inspections by agency and by region (with the owning agency on the region), using the exact F05-1
  definition and the 14-days-from-today default (L-F05-09, L-F05-13). Verified end-to-end in QA with
  all three periods, including with the "Inspectors" tab set to a past day.
- **SC-002 (01.A5)**: Contract item **01.A5** holds end-to-end — the platform default is editable in
  "Platform settings", an override is editable in the inspector drawer, and the Live Day reflects the
  change on the next cycle (e.g. lower the default to 15 and see a delay alert appear on the next
  poll; override an inspector to 40 and see their delay alert disappear). This is the manual QA check
  of 01.A5.
- **SC-003 (L-F05-14)**: From the Live Day inspector view, "Open inspector" opens that inspector's
  drawer at `/inspectors?open=<id>`, and the browser Back button returns to the Live Day with the
  previous `?date`/`?inspector` selection restored.
- **SC-004 (accessibility)**: The "Locked time" tab, the drawer alert-limits section, and the
  settings section are fully operable by keyboard with the correct ARIA (0 axe violations by
  construction), and AM/OP-only is enforced. Verified via the component tests' ARIA/keyboard
  invariants + manual QA, since the web workspace has no axe engine (FR-025).
- **SC-005 (no contract drift)**: The merged diff changes no file under `apps/backend/`,
  `apps/backend/prisma/`, or `packages/shared/` (including `api-types.ts`); it is web-only.
- **SC-006 (reviewable size)**: The PR stays under the 150-changed-files limit
  (`git diff --stat origin/develop... | tail -1`).

## Assumptions

- **Dependencies merged**: TASK-X00-1, TASK-F05-1 (endpoints, `liveDayAlerts` key, regenerated
  `api-types.ts`), TASK-F05-2 (`LiveDayPanel`, `LiveDayInspectorDetail`, `/live-day` route), and
  TASK-F03-4 (`/platform-settings` page + `usePlatformSetting`) are already on `develop`. (Confirmed:
  the four api-types paths — `/v1/dashboard/locked-time`, `/v1/inspectors/{inspectorId}/alert-thresholds`,
  `/v1/platform-settings/{key}`, `/v1/dashboard/live-day` — are present; `LiveDayPanel` has no tabs
  yet; `PlatformSettingsPage` has the Field events / Route planning / Tenant arrival notices sections.)
- **Period presets are F05 constants** (7 / 14 / 30), unrelated to the per-agency `mapWindowDays`
  (F00); each "by agency" row uses the same single period (L-F05-09).
- **Multi-tenant scope (root §7 exception, D14)**: `locked-time` and `alert-thresholds` are
  cross-tenant **AM/OP-only** reads/writes, and `inspectors.alert_overrides_json` lives on a table
  with no `tenant_id` (the inspector is cross-tenant). This exception is owned and enforced by the
  merged F05-1 backend; the web enforces AM/OP via the route `AuthGuard`, conditional rendering, and
  disabling the alert-thresholds hook for non-AM/OP. This task adds no new persisted entity, so it
  introduces no new `tenant_id` decision.
- **Timezone**: "today", the period range, and all labels use `PLATFORM_TIMEZONE` (Sydney) via the
  shared helpers; the locked-time range is civil dates formatted without a timezone; times elsewhere
  on the Live Day follow the F04-5 12h convention owned by F05-2.
- **No new primitives expected**: the tab uses the existing `TabsNav`, `SelectInput`, `DataTable`,
  `EmptyState`, `Tooltip`, and `cn`; the drawer section follows the existing `FormSection`/`DetailRow`
  pattern; the settings section follows the existing per-key section pattern. A new primitive is added
  only if none fits (and would go in `components/`, not the feature).
- **Out of scope**: history/trend of locked time, export, charts; an arbitrary free `from/to` period
  (the endpoint accepts it, but the UI only offers 7/14/30); alert limits for the event-driven alert
  types (they have no limit; geofence/reminder belong to F03); any change to `/analytics` or
  `ConfirmationMeter`.
