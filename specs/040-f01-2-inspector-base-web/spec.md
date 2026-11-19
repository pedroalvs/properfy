# Feature Specification: Web — Inspector base address & app adoption

**Feature Branch**: `040-f01-2-inspector-base-web`
**Created**: 2026-10-30
**Status**: Draft
**Input**: TASK-F01-2 (`fase2-etapa1/tarefas/F01-tarefas.md`). Web consumer of the F01-1 backend contracts. Part of F01 · Inspector foundations (contract items 00.3, 00.4, 00.10; acceptance criterion **00.A5 partial**).

## Context & Scope

This feature is **web-only** (`apps/web`). It consumes contracts already shipped and merged by TASK-F01-1 (PR #1317, in `develop` @ `cff52a98`): the inspector `address` is a required, geocoded base address; the API returns base coordinates and app-adoption telemetry; and `GET /v1/inspectors` accepts a `missingBaseAddress` filter. No backend route, Zod schema, migration, or `api-types.ts` change originates here. The `/inspectors` area is AM/OP only (`apps/web/src/app/router.tsx:373-375`), so there is no per-role UI variation and no CL_ADMIN/CL_USER surface.

**Scope (confirmed 2026-10-30, see Clarifications):** F01-1 already shipped the inspector create/edit **drawer** Base Address section (manual structured AU fields, `AU_STATES` select, required-on-create, change-not-remove; `apps/web/src/features/inspectors/components/InspectorFormDrawer.tsx` + `useInspectorSave.ts`). F01-2 therefore delivers only the parts F01-1 left unbuilt:

1. **App-adoption columns** (App / Push / Last seen) and a **"No base address" badge + filter** in the inspectors table.
2. **"Base address"** (read-only location status) and **"App adoption"** sections in the inspector detail view.

The drawer is **out of scope** for F01-2 and is not modified (see "Out of scope").

## Clarifications

### Session 2026-10-30

- Q: The pre-F01-1 task file specifies reworking the drawer (autocomplete, hidden City, `AU_STATE_NAME_TO_CODE`, geocode-failure feedback), but merged F01-1 already shipped the drawer as manual structured fields. Does F01-2 rework the drawer or deliver only the columns + adoption UI? → A: **Columns + adoption only.** Leave F01-1's drawer as shipped; the stale task-file drawer section is superseded by F01-1's implementation. F01-2 = table columns + "No base address" badge + filter, and the detail "Base address" + "App adoption" sections.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See app adoption and spot inspectors missing a base (Priority: P1) 🎯 MVP

An operator (AM/OP) scanning the inspectors list needs to see, per inspector, whether they installed the app, whether push is on, and when they were last seen, and to quickly find inspectors with no usable base address.

**Why this priority**: Adoption visibility and the "no base" operational filter are the primary value F01-2 adds; they are the most-used operator surface. The base address itself is already captured by F01-1's drawer.

**Independent Test**: Render the table with fixture rows covering each adoption state and toggle the "No base address" filter; assert the columns, badge, tooltips and the `missingBaseAddress=true` query.

**Acceptance Scenarios**:

1. **Given** table rows, **When** rendered, **Then** after `status` there are three sortable columns (nulls sorted last): **App** ("Installed" with tooltip "Installed on {date} (any device)" / "—" with tooltip "Not installed"), **Push** ("On" / "Off" / "—" with tooltip "No data yet"; On/Off tooltip "Browser notification permission on the last device seen"), and **Last seen** (relative text e.g. "3 h ago" with tooltip "Last reported {date time} (Sydney) · reported at most every 6 h"; "Never" when null; "Just now" for a future date).
2. **Given** an inspector whose `baseLat` is null, **When** rendered, **Then** a warning badge "No base address" appears beside the name, with tooltip "Missing base address" when `address` is null or "Address could not be located" when `address` is present — decided from the `address` the list returns for AM/OP, with no per-row GET.
3. **Given** the filters, **When** the operator toggles "No base address", **Then** `onFiltersChange({ missingBaseAddress: true })` fires and the list query includes `?missingBaseAddress=true` (absent when false).
4. **Given** the filter is active and nothing matches, **When** the list resolves, **Then** the empty state reads "No inspectors without a base address."
5. **Given** the Last seen column, **When** the test TZ is pinned away from Sydney, **Then** the absolute tooltip is still rendered in `Australia/Sydney`.
6. **Given** a deactivated inspector with `pushEnabled:false`, **When** rendered, **Then** Push shows "Off".

### User Story 2 - Review base address and app adoption in the detail view (Priority: P2)

An operator opening an inspector's detail sees a "Base address" section (formatted address + location status, never raw coordinates) and an "App adoption" section (Installed / Push / Last seen / App version) with graceful fallbacks for an inspector who never opened the app.

**Why this priority**: Read-only detail presentation; lower-traffic than the list but completes the adoption picture per inspector.

**Independent Test**: Render `InspectorDetailSections` with fixtures covering located / not-located / not-set and full / empty adoption; assert labels, fallbacks and the absence of any coordinate in the DOM.

**Acceptance Scenarios**:

1. **Given** the detail view, **When** rendered after Personal Details, **Then** a "Base address" section shows the formatted address (or "Not set") and a "Location" line reading "Located · Updated {date}" (from `baseGeocodedAt`) or "Could not be located" (warning), with no raw latitude/longitude anywhere in the DOM.
2. **Given** the detail view, **When** rendered after Workload, **Then** an "App adoption" section shows "Installed" (date or "Not installed"), "Push notifications" ("On" / "Off" / "No data yet"), "Last seen" (relative + absolute, or "Never"; tooltip "Last reported {date time} (Sydney) · reported at most every 6 h"), and "App version" (value as received, e.g. `0.1.0+ab12cd3`, or "—"), with a "Last device seen" caption next to Push and App version.
3. **Given** an inspector who never opened the app, **When** the detail renders, **Then** the "App adoption" section is visible with every fallback.
4. **Given** a deactivated inspector with `pushEnabled:false`, **When** the detail renders, **Then** "Push notifications: Off".

### Edge Cases

- API missing the new fields (out-of-order deploy) → columns render "—" and nothing breaks (all new fields optional).
- List item with no `address` (older API) → badge tooltip falls back to "Missing base address".
- `appLastSeenAt` in the future (clock skew) → "Just now"; null → "Never".
- Inspector with a non-null `address` but null `baseLat` → "No base address" badge with "Address could not be located"; detail "Could not be located".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The inspectors table MUST add, after `status`, three client-side-sortable columns (nulls last): **App**, **Push**, **Last seen**, with the exact labels, states and tooltips in User Story 1 scenario 1.
- **FR-002**: The table MUST show a warning "No base address" badge beside the name when `baseLat` is null, with tooltip "Missing base address" (`address` null) or "Address could not be located" (`address` present), decided from the list item's `address` (returned for AM/OP by L-F01-07) with no per-row GET. Badges MUST convey state with text, not color alone.
- **FR-003**: `InspectorFilters` MUST add a "No base address" toggle that maps to `missingBaseAddress=true` in `useInspectorList`, absent when false; the active-filter empty state MUST read "No inspectors without a base address."
- **FR-004**: The detail view MUST add a "Base address" section after Personal Details (formatted address or "Not set"; "Located · Updated {date}" or "Could not be located"; never raw coordinates) and an "App adoption" section after Workload (Installed / Push / Last seen / App version with fallbacks and the "Last device seen" caption), as specified in User Story 2.
- **FR-005**: Last seen / absolute timestamps MUST be formatted in `Australia/Sydney` via the existing Sydney date helper in `apps/web/src/lib`, independent of the browser timezone, and tooltips MUST state "reported at most every 6 h" (L-F01-09) and attribute Push/App version to the "last device seen" and Installed to "any device" (L-F01-08).
- **FR-006**: All consumption MUST go through the typed client and `packages/shared/src/api-types.ts` with no `as any` (memory WEB-10). New API fields are optional; the UI MUST degrade to "—" when they are absent.
- **FR-007**: Accessibility MUST hold: badges convey state with text (not color alone), sortable `<th>` headers in the DataTable, and tooltips reachable per the existing tooltip primitive.

### Key Entities

- **App adoption** (read-only here): `appInstalledAt` (first install on any device), `pushEnabled` (browser permission on the last device seen), `appLastSeenAt` (last device seen, up to 6 h stale), `appVersion` (e.g. `0.1.0+ab12cd3`).
- **Inspector base location** (read-only here): `address` (structured or legacy), `baseLat`, `baseGeocodedAt` returned by the API. The web never sends coordinates and never renders them; it shows only "Located"/"Could not be located"/"Not set".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The table shows App / Push / Last seen and the "No base address" badge, and filters to inspectors without a base. (acceptance criterion 3)
- **SC-002**: The detail view shows "Base address" and "App adoption" with fallbacks for an inspector who never opened the app. (acceptance criterion 4)
- **SC-003 (00.A5 partial)**: An inspector whose base resolved shows "Located" in the detail view, evidencing that the saved base carries lat/lng. Full proof of **00.A5** (base address consumed as the routing origin) lands in F04; here it is partial. (acceptance criterion from `F01-tarefas.md:971`)
- **SC-004**: `pnpm --filter web lint` (`--max-warnings 0`), typecheck and unit tests are green; the new Playwright e2e spec is green; the flow is validated in the browser against a local backend. (acceptance criterion 5)
- **SC-005**: Tooltips state "last device seen" (Push), "any device" (App) and "reported at most every 6 h" (Last seen). (acceptance criterion 6; L-F01-08, L-F01-09)
- **SC-006**: No raw coordinate is ever rendered for any role. (CLAUDE.md §7.9 / §12.12)

## Assumptions

- **PREMISE (D14)**: TASK-F01-1 and TASK-F01-2 are promoted to staging/prod **together**; this PR merges to `develop` right after F01-1 (already merged at `cff52a98`).
- **PREMISE (L-F01-07)**: `GET /v1/inspectors` returns `address` in each list item for AM/OP, so the badge tooltip is decided without a per-row GET. Confirmed present in `api-types.ts`.
- **PREMISE (merge order with F05-3, L-F05-14)**: F05-3 will later add `?open=<id>` to `InspectorListPage` and a "This inspector no longer exists." state to the detail drawer. Whichever merges second rebases and keeps both changes; this spec does not remove either.
- The `/inspectors` area is AM/OP-only, so there is no CL_ADMIN/CL_USER UI path and no privacy branching in the web layer (privacy is enforced server-side in F01-1).
- Multi-tenant note: no platform-scoped entity is introduced; the inspector privacy exception is enforced server-side (F01-1). No `tenant_id` decision is made in the web layer.

## Out of scope

- **The inspector create/edit drawer Base Address section** — shipped by F01-1 (manual structured AU fields, `AU_STATES` select, required-on-create, change-not-remove, country `'AU'`). F01-2 does not modify `InspectorFormDrawer.tsx` or `useInspectorSave.ts`, does not add address autocomplete, does not add `AU_STATE_NAME_TO_CODE`, and does not hide the City field. (Clarification 2026-10-30.)
- Day base (F04), pinning the base on the map, an adoption dashboard, changing existing dashboard screens, and displaying coordinates.
