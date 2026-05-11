# Feature Specification: Appointments Map UX — Lasso Flow + Bulk-Action Modal + Marker Detail Panel (025)

**Feature Branch**: `feat/appointments-map-ux` (NEW — branch off `develop @ 6035fc9`; NOT stacked on 022+023+024)
**Created**: 2026-05-11
**Feature Status**: NEW — single-cycle feature fixing 3 related user-smoke issues
**Source-of-truth design**: `docs/superpowers/specs/2026-05-11-appointments-lasso-flow-design.md` + 2 user screenshots (2026-05-11 clarification) showing filter panel + lasso polygon (peach/orange overlay) + suspended modal with checkbox list + footer (Close · Bulk actions · Add to group · Create group)
**Constitution alignment**: v1.4.0
**Predecessor**: PR #3 (BulkEditModal on list page; lasso button + `MapSelectionPanel` strip)

## Problem (4 issues from user smoke)

1. **BUG — zoom-out on lasso completion.** After drawing the polygon, the map zooms OUT instead of focusing on the selected markers.
2. **UX — lasso outline disappears.** Once `draw.create` fires, the polygon is no longer visible on the canvas; user wants it to persist as visual context.
3. **FEATURE — bulk-action modal with granular deselect.** The current bottom strip (`MapSelectionPanel`) only exposes Clear + Create Group. User wants a suspended modal with a per-row checkbox list AND a richer action footer (Close · Bulk actions [Cancel · Reschedule · Change Status · Assign Inspector · Re-send Reminder] · Add to group · Create group).
4. **FEATURE — marker click opens a rich detail panel** with sections (CLIENT, PROPERTIES) plus collapsible sub-sections (Properties details · Client details · Scheduled by · Tenant · Bonus and Authorization · Confirmation · Additional data · Meeting location) and a "MORE DETAILS" CTA navigating to the full page. The current `MapPopup` is too thin.

## Goals

- **No zoom-out during drawing or after completion.** Camera stays put unless the selection is outside the current viewport — in which case a single `fitBounds(selectedMarkers, padding 100)` runs once.
- **Lasso polygon persists on the canvas** (peach/orange fill, solid outline — matches user mockup) until user explicitly clears, re-draws, or successfully applies an action.
- **New suspended modal** (`MapBulkActionModal`) opens automatically after the polygon closes (auto-close on mouseup). Lists all appointments captured by the lasso with checkboxes (default: **all UNCHECKED — explicit opt-in**, matches user mockup). User checks the items they want to operate on. The lasso is the **visual filter** (which items appear in the modal); the checkboxes are the **action filter** (which items get the operation).
- **Footer**: `Close` (left) · action group (right): `Bulk actions` (Cancel · Reschedule · Change Status · Assign Inspector · Re-send Reminder — gated by RBAC + state-machine validity) + `Add to group` (existing service group picker) + `Create group` (new service group from checked items).
- All status transitions still go through the single state-machine use case (`ExecuteStatusTransitionUseCase`) per Constitution §State Machine Sovereignty.
- Frontend `getValidTransitions(currentStatus, role)` shared with backend via `packages/shared/src/lib/appointment-transitions.ts` — single source of truth for transition matrix.
- Backend gains four **dedicated** bulk endpoints (Cancel · Reschedule · Status-transition · Assign-inspector) instead of overloading the existing `bulk-edit`. Each has its own validation, audit signature, and RBAC gate.
- **Rich marker detail panel** opens on marker click — replaces the existing thin `MapPopup` with a structured side panel: header (service type · status chip · date · appointment code) → primary sections (CLIENT, PROPERTIES) → collapsible sections (default collapsed; lazy-fetch any data not in marker payload) → "MORE DETAILS" CTA to `/appointments/:id`.

## Non-Goals

- Replacing `BulkEditModal` in the list page (still useful — different UX).
- Rectangle / circle lasso geometry.
- Persisting lasso state across reloads.
- New state-machine transitions or audit events (bulk wrappers delegate to existing).
- Parallel-execution optimisation for the bulk loops (sequential for-of; cap 100/request).

## UX States diagram (per user clarification)

```
idle (hand/pan mode — top-right hand icon active)
  │ user clicks lasso icon
  ▼
draw_mode (lasso cursor; map pan disabled)
  │ mousedown + drag
  ▼
drawing (polygon being drawn — camera FROZEN, no zoom/pan)
  │ mouseup → polygon auto-closes last segment
  ▼
selected_with_modal
  │ polygon stays visible (peach/orange fill, solid outline)
  │ modal opens automatically with ALL items pre-checked
  │ camera: stays put UNLESS selection outside viewport → fitBounds(selected, padding 100) once
  ├─→ user toggles checkboxes (deselect granular)
  │       │ footer counters/labels update ("Cancel (N)", "Create group (N)")
  ├─→ user clicks "Close" → modal closes BUT polygon + selection state preserved (user can re-open)
  ├─→ user clicks bulk action button → step 2 form → Apply → applying → result summary
  │       │ on success summary close → idle (polygon cleared, query invalidated)
  ├─→ user presses ESC OR clicks "Clear lasso" button → idle (polygon cleared, modal closed)
  └─→ user clicks lasso icon again to start new → polygon cleared → draw_mode
```

## User Scenarios & Testing

### User Story 1 — Operator draws lasso; map stays put unless selection is off-viewport

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11 + clarification

An operator opens `/appointments` map, clicks the lasso icon (top-right), draws a polygon over a cluster of markers, releases (`mouseup` auto-closes the polygon). The camera DOES NOT zoom out. If the selected markers are entirely visible in the current viewport, the camera stays put. If any selected marker is outside the viewport, the camera calls `fitBounds(selectedMarkers, padding 100)` exactly once.

**Acceptance Scenarios**:

1. **Given** the user draws a polygon enclosing markers all visible in the current viewport, **When** the polygon closes, **Then** the camera does NOT move (no `fitBounds`, no `flyTo`).
2. **Given** the user draws a polygon enclosing markers where at least one is outside the current viewport, **When** the polygon closes, **Then** `map.fitBounds(selectedMarkersBounds, { padding: 100, maxZoom: 16, duration: 700 })` is called exactly once.
3. **Given** the polygon encloses zero markers, **When** released, **Then** no `fitBounds` is called; a toast "No appointments in selected area" appears; lasso state returns to idle; polygon is cleared.
4. **Given** the auto-fit useEffect (which fits the whole data set on data load) exists, **When** `lassoState !== 'idle'`, **Then** auto-fit is skipped so the user's deliberate lasso interaction is not overridden.
5. **Given** the user is in `drawing` state, **When** they move the cursor across the canvas, **Then** the map does NOT pan with the cursor (pan disabled during draw).

### User Story 2 — Operator sees the lasso polygon persist after selection

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11

After releasing the polygon, the lasso outline stays visible on the canvas with the MapboxDraw default styling. The user can see exactly which area they selected while the modal is open. The polygon clears only when:
- User clicks "Clear" in the modal header (or the `×` close button), OR
- User presses `ESC` while in review state, OR
- User clicks "Re-draw" — polygon clears AND lasso state returns to drawing (selection set is empty in the new polygon), OR
- A bulk action completes successfully — polygon clears as part of `lassoState → idle`.

**Acceptance Scenarios**:

1. **Given** `draw.create` fired, **When** the modal opens, **Then** the polygon is still rendered on the canvas.
2. **Given** the modal is open, **When** user presses ESC, **Then** the polygon clears and the modal closes.
3. **Given** the modal is open, **When** user clicks "Re-draw", **Then** the polygon clears and the lasso state returns to `drawing` (user can draw a new polygon).
4. **Given** a bulk action succeeded, **When** user closes the result summary, **Then** the polygon clears and the modal closes.

### User Story 3 — Operator selects items granularly and applies a bulk action

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11

After drawing a lasso enclosing 30 appointments, the modal lists them with per-row checkboxes (ALL UNCHECKED by default). The operator checks 15 and applies a bulk action (e.g. Cancel with reason). Only the 15 checked items are sent to the backend. Per-item results are surfaced (e.g. 14 SUCCESS, 1 INVALID_TRANSITION because the appointment was already CANCELLED).

**Acceptance Scenarios**:

1. **Given** 30 appointments listed in the modal with 0 checked, **When** the operator views the footer, **Then** `Add to group` and `Create group` are DISABLED; `Bulk actions ▾` is NOT rendered (only appears when ≥1 checked).
2. **Given** the operator checks 15 of 30, **When** the footer updates, **Then** the active counter reads "15 selected", `Add to group` and `Create group` become ENABLED, and `Bulk actions ▾` button appears with label "Bulk actions (15) ▾".
3. **Given** the operator clicks the column-header checkbox (select-all), **When** the click fires, **Then** all 30 rows are checked (or unchecked if all were checked). Indeterminate state (`-`) when partially checked.
4. **Given** the operator clicks "Bulk actions ▾" → "Cancel", **When** the action form opens, **Then** a reason textarea is required (min 3 chars); Back returns to the list preserving check state.
5. **Given** the operator confirms with reason, **When** the backend returns mixed results, **Then** the modal shows "14 cancelled · 1 failed" with expandable error details.
6. **Given** an action that requires homogeneous tenant/branch (Inspector, Time slot), **When** the checked set spans multiple tenants/branches, **Then** the action item in the dropdown is disabled with a tooltip explaining why.
7. **Given** the checked set contains an item already in a terminal state (DONE/CANCELLED/REJECTED), **When** the operator opens the bulk-actions dropdown, **Then** Cancel + Change Status are disabled with the tooltip "Some items in terminal state — cannot transition".

### Modal column structure (exact, per mockup)

| # | Column | Header | Render | Notes |
|---|--------|--------|--------|-------|
| 1 | Checkbox | ☑ (select-all + indeterminate) | `<input type="checkbox">` controlled by `checkedIds: Set<string>` | Default state: ALL UNCHECKED |
| 2 | Service | "Service" | `{serviceTypeName}` + `<AppointmentCodePill code={appointmentCode}>` to the right | Pill = small chip rendering the `appointmentCode` (readable, NOT UUID) per `feedback_no_raw_ids_in_ui.md` |
| 3 | Date | "Date" | `formatDate(scheduledDate)` + ` ` + start of `timeSlot` (e.g. "14/05/2026 08:00") | Single time (start) for column-width economy |
| 4 | Status | "Status" | `<StatusChip>` per `APPOINTMENT_STATUS_MAP` | Mockup showed plain text but baseline `feedback_production_ready_ux_baseline.md` mandates chip — use chip |
| 5 | Confirmations | "Confirmations" | Two icons inline: SMS status + Email status — red=failed, green=sent/delivered, gray=pending/not-sent. Source: appointment's `tenantConfirmationStatus` + per-channel notification attempt history (sub-query or eager-load) | New small subcomponent `<ConfirmationChannelIcons>` — reuses existing colour palette |
| 6 | Group | "Group" | `serviceGroupName ?? '—'` | "—" placeholder when not grouped |
| 7 | Actions | "" (no header text) | `<RowActionsMenu>` (3-dots vertical kebab) — items: "Open detail" (new tab), "Edit", "Cancel" (gated by RBAC + state-machine like list page) | Reuses existing `<RowActions>` primitive; items mirror list page row actions |

### Modal footer (state matrix)

| Checked count | Left | Right (left→right) |
|---------------|------|-------------------|
| 0 | `[Close]` | `[Add to group]` (disabled) · `[Create group]` (disabled) |
| ≥1 | `[Close]` | `[Bulk actions ({N}) ▾]` (visible) · `[Add to group]` · `[Create group ({N})]` (enabled, CTA colour) |

`Bulk actions ▾` is a **dropdown** (single button, opens menu) with items: Cancel · Reschedule · Change Status · Assign Inspector · Re-send Reminder — each gated by RBAC + state-machine validity (US4 + edge cases below). When an item is disabled, the dropdown still shows it greyed-out with the explaining tooltip on hover (do not hide — hiding would surprise operators looking for the action).

### Modal anatomy (per mockup)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Bulk Actions ({N total in lasso})                       [Re-draw] [Clear] [×] │
│ Lasso area drawn at 12:00. Polygon preserved on map.                          │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──┬─────────────────────┬─────────────┬──────────┬──────────────┬───────┬─┐ │
│ │☑ │ Service             │ Date        │ Status   │ Confirmations │ Group │⋮│ │
│ ├──┼─────────────────────┼─────────────┼──────────┼──────────────┼───────┼─┤ │
│ │☐ │ Routine inspection  │ 14/05/2026  │ Rejected │  📧 📱        │  —    │⋮│ │
│ │  │ [442303]            │ 08:00       │          │  ❌ ✅        │       │ │ │
│ ├──┼─────────────────────┼─────────────┼──────────┼──────────────┼───────┼─┤ │
│ │☐ │ Routine inspection  │ 14/05/2026  │ Done     │  📧 📱        │ Grp-A │⋮│ │
│ │  │ [471090]            │ 14:00       │          │  ✅ ✅        │       │ │ │
│ └──┴─────────────────────┴─────────────┴──────────┴──────────────┴───────┴─┘ │
│ ... (scroll)                                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ {N} selected                                                                  │
│ [Close]                  [Bulk actions ({N}) ▾]  [Add to group]  [Create group ({N})] │
└─────────────────────────────────────────────────────────────────────┘
```

### Empty / 0-check states

- Lasso encloses zero markers → modal does NOT open; toast "No appointments in selected area"; polygon cleared (FR-404 already covered).
- Modal open with 0 items checked → footer disables Add to group + Create group; Bulk actions button NOT rendered. Empty body if lasso captured 0 (handled above) — never reached.

### User Story 4 — RBAC + state-machine gating

- **Priority**: P1
- **Status**: NEW
- **Source**: CLAUDE.md §5/§6

Action buttons in the modal footer (and items inside `Bulk actions ▾` dropdown) are visible per role:

| Action | AM | OP | CL_ADMIN | CL_USER |
|--------|----|----|----------|---------|
| Cancel (dropdown) | ✓ | ✓ | ✓ | flag `cancel_appointments` |
| Reschedule (dropdown) | ✓ | ✓ | ✓ | ✓ |
| Change Status (dropdown) | ✓ | ✓ | — | — |
| Assign Inspector (dropdown) | ✓ | ✓ | — | — |
| Re-send Reminder (dropdown) | ✓ | ✓ | — | — |
| Add to group (footer) | ✓ | ✓ | — | — |
| Create group (footer) | ✓ | ✓ | — | — |

**Acceptance Scenarios**:

1. **Given** a CL_USER without `cancel_appointments` flag, **When** they open the modal and the dropdown, **Then** the Cancel item is NOT rendered.
2. **Given** a CL_ADMIN, **When** they open the modal, **Then** the Bulk actions dropdown contains only Cancel + Reschedule; Add to group + Create group footer buttons are NOT rendered.
3. **Given** an AM, **When** they open the modal, **Then** all five Bulk actions items + Add to group + Create group are rendered (subject to state-machine validity per US3 AC4-7).

### User Story 5 — Operator clicks a marker and sees a rich detail panel

- **Priority**: P1
- **Status**: NEW
- **Source**: user-clarification-2026-05-11 (mockup)

Clicking a marker on `/appointments` map opens a side panel anchored to the right of the map (overlays the map; does not push layout). The header shows: service type name · status chip · scheduled date + time slot · appointment code (`#442303`). Primary sections (expanded by default): **CLIENT** (tenant/agency name) and **PROPERTIES** (property code chip + full address). Below: collapsible sections that lazy-fetch the heavier fields only when opened: Properties details · Client details · Scheduled by · Tenant · Bonus and Authorization · Confirmation · Additional data · Meeting location. Footer CTA "MORE DETAILS" (outline, full width) → opens `/appointments/:id` in a new tab (per `feedback_new_tab_detail.md`).

**Acceptance Scenarios**:

1. **Given** a marker on the map, **When** operator clicks it, **Then** the side panel slides in from the right with header + CLIENT + PROPERTIES sections populated from the existing marker payload (no extra fetch yet); the collapsible sections render closed.
2. **Given** the panel is open with a collapsible section closed, **When** operator clicks the section header (chevron), **Then** the section expands; if the data is not in the marker payload, a single fetch to `GET /v1/appointments/:id` populates ALL remaining sections in one go (the response already carries everything per `get-appointment.use-case.ts:100-160`).
3. **Given** the panel is open, **When** operator clicks the X close button OR clicks anywhere outside the panel, **Then** the panel slides out; map remains unchanged.
4. **Given** the panel is open, **When** operator clicks "MORE DETAILS", **Then** `/appointments/:id` opens in a new tab; current map panel stays open until the user closes it.
5. **Given** the marker click handler from PR #3 already runs `flyTo(marker, max(currentZoom, 14))`, **When** this feature lands, **Then** the existing flyTo is preserved — the panel layers on top.
6. **Given** raw UUIDs MUST NOT appear in UI (per `feedback_no_raw_ids_in_ui.md`), **When** any section renders an entity reference, **Then** the readable identifier (appointment code, property code, client name) is shown — never a UUID.
7. **Given** the panel is open and the user clicks a DIFFERENT marker, **When** the click fires, **Then** the panel content updates to the new appointment (re-fetch on demand for expanded sections; collapsed sections do not re-fetch until expanded again).

### Edge Cases

- **Empty polygon** (lasso over empty area): no modal, toast "No appointments in selected area", return to idle.
- **All items deselected** (active count = 0): all footer buttons disabled until user re-checks ≥1.
- **Mixed-tenant selection** (AM only — CL is JWT-pinned): Inspector + Time slot disabled; Cancel + Change Status + Re-send Reminder still allowed (per-tenant audit OK).
- **Concurrent modification**: another user transitions an appointment between lasso draw and bulk apply → backend returns INVALID_TRANSITION for that item; modal surfaces it in the result summary.
- **>100 items selected**: action buttons disabled with tooltip "Maximum 100 appointments per bulk action. Please reduce selection." (Zod `.max(100)` server-side; client mirrors).
- **Reschedule to a past date**: backend rejects; per-item ERROR with friendly message; modal shows it.
- **Map mode is `groups`**: lasso button hidden (existing behaviour preserved); no impact from 025.

## Requirements

### Functional Requirements

#### Lasso state + camera

- **FR-401**: `AppointmentMapPage` introduces `lassoState: 'idle' | 'drawing' | 'review' | 'applying'` replacing the boolean `lassoActive`. `lassoActive` becomes a derived value.
- **FR-402**: The auto-fit `useEffect` (`AppointmentMapPage.tsx:223-239`) MUST skip its `fitBounds` call when `lassoState !== 'idle'`.
- **FR-403**: When the lasso fires `onSelectionChange` with ≥1 ids, the page MUST call `map.fitBounds(selectedMarkersBounds, { padding: { top: 80, bottom: 320, left: 80, right: 80 }, maxZoom: 16, duration: 700 })`.
- **FR-404**: When the lasso fires `onSelectionChange` with zero ids, the page MUST show a toast "No appointments in selected area", clear the polygon, and return `lassoState` to `idle`.
- **FR-405**: Pressing `ESC` while `lassoState === 'review'` MUST clear the polygon and set `lassoState = 'idle'`.

#### MapLassoSelect lifecycle

- **FR-410**: `MapLassoSelect` prop API: replace `active: boolean` with `lassoState: LassoState`. New optional callback `onPolygonCleared?: () => void`.
- **FR-411**: MapboxDraw control is added when entering `drawing` and KEPT ALIVE through `review` and `applying`. It is removed (and `deleteAll()` called) only on transition to `idle`.
- **FR-412**: After `draw.create`, the control is switched to `simple_select` mode so the polygon persists visually but is no longer being drawn.
- **FR-413**: The polygon's style is the MapboxDraw default (no custom paint layers in 025).

#### MapBulkActionModal

- **FR-420**: New component `apps/web/src/features/appointments/components/MapBulkActionModal.tsx` using the existing `Dialog` primitive at width `880px`.
- **FR-421**: Modal renders when `lassoState === 'review' || lassoState === 'applying'`.
- **FR-422**: Modal header: title "Bulk Actions ({N} appointments)" where N is post-deselect count; subtitle with polygon-drawn timestamp; buttons: `Re-draw`, `Clear`, `×` (close).
- **FR-423**: Modal body (step 1 — review): DataTable with columns: ☑ Checkbox (select-all toggle in header) · Code · Property · Status (`<StatusChip>`) · Scheduled (`formatDate` + time slot) · Inspector · Confirmation (`<TenantConfirmationChip>`). Per-row checkbox toggles membership in a `deselectedIds: Set<string>`.
- **FR-424**: Modal footer (step 1): left side counter "{active} of {total} selected"; right side six action buttons (Cancel, Reschedule, Change Status, Assign Inspector, Re-send Reminder, Create Group) — alphabetical order — gated by RBAC + state-machine validity (FR-440/441).
- **FR-425**: Step 2 (action-specific form): swaps body to a single action's input. Cancel = reason textarea (required, 3-500 chars). Reschedule = date picker + optional time slot. Change Status = target-status select (intersection of valid transitions across selection) + optional reason. Assign Inspector = inspector select (requires homogeneous tenant). Re-send Reminder = confirmation prompt (no form). Create Group = inline `MapGroupCreateModal` shape.
- **FR-426**: Step 2 has Back (returns to step 1 preserving deselect) and Apply (fires endpoint). On `applying`, footer shows spinner; on response, body swaps to result summary (success count + expandable error details).
- **FR-427**: Closing the modal (success, Clear, or ×) transitions `lassoState → idle`, which triggers MapLassoSelect cleanup and a `queryClient.invalidateQueries(['appointments-map'])`.

#### Backend bulk endpoints (4 dedicated, per user clarification — no overload of bulk-edit)

- **FR-430**: New endpoint `POST /v1/appointments/bulk-cancel`. Body: `{ appointmentIds: string[].min(1).max(100), reason: string.min(3).max(500) }`. Response envelope `{ data: { results: Array<{ appointmentId, status: 'OK' | 'INVALID_TRANSITION' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR' | 'IDEMPOTENT_REPLAY', error?: { code, message } }> } }`. Auth gated by `appointment.bulk_cancel` permission key. Per-item delegates to `ExecuteStatusTransitionUseCase` with `targetStatus: CANCELLED, reason`. Idempotency per `(appointmentId, day-in-actor-tz)` using `IIdempotencyService`.
- **FR-431**: New endpoint `POST /v1/appointments/bulk-reschedule`. Body: `{ appointmentIds: string[].min(1).max(100), newDate: string.datetime() | string.date(), newTimeSlot?: string }`. Response: same shape. Auth gated by `appointment.bulk_reschedule` permission key (AM, OP, CL_ADMIN, CL_USER). Per-item delegates to `UpdateAppointmentUseCase` (date + optional time slot fields only). Audit: `appointment.rescheduled` per item.
- **FR-432**: New endpoint `POST /v1/appointments/bulk-status-transition`. Body: `{ appointmentIds: string[].min(1).max(100), targetStatus: AppointmentStatus, reason?: string.min(3).max(500) }`. Response: same shape. Auth gated by `appointment.bulk_status_transition` (AM, OP). Per-item delegates to `ExecuteStatusTransitionUseCase`; reason required iff the transition demands one (state machine knows).
- **FR-433**: New endpoint `POST /v1/appointments/bulk-assign-inspector`. Body: `{ appointmentIds: string[].min(1).max(100), inspectorId: string.uuid() }`. Response: same shape. Auth gated by `appointment.bulk_assign_inspector` (AM, OP). Per-item delegates to `UpdateAppointmentUseCase` (assigned inspector field only); validates inspector is active and (when CL roles ever get this) eligible for the appointment's tenant.
- **FR-434**: Reused endpoints: `POST /v1/appointments/bulk-resend-reminder` (Re-send Reminder — EXISTS from 023, unchanged). `POST /v1/appointments/bulk-edit` (NOT used by 025 modal — kept for the list page's multi-field UX).
- **FR-435**: All four new endpoints register Fastify `schema: { body, response }`. `pnpm generate:api` updates `api-types.ts`. All emit per-item audit events identical to single-item operations — no batch-level audit row. State-machine sovereignty preserved.

#### Service group footer actions

- **FR-436**: `Add to group` opens a new sub-modal `MapAddToGroupModal` with a searchable `<SelectInput>` listing existing service groups (only groups within the active selection's tenant set; if selection spans tenants, the option is disabled per US3 AC6). On confirm: `POST /v1/service-groups/{groupId}/appointments` (NEW endpoint OR reuse existing if present — verify during implementation). Response: per-item result identical envelope.
- **FR-437**: `Create group` opens the existing `MapGroupCreateModal` pre-populated with the checked appointment IDs. No new backend endpoint; reuses existing service-group create flow.

#### Permissions + transition matrix

- **FR-440**: Add to `packages/shared/src/permissions/role-matrix.ts`:
  - `appointment.bulk_cancel`: roles `['AM', 'OP', 'CL_ADMIN', 'CL_USER']` with condition `cl_user_flag` / `cancel_appointments`.
  - `appointment.bulk_reschedule`: roles `['AM', 'OP', 'CL_ADMIN', 'CL_USER']`.
  - `appointment.bulk_status_transition`: roles `['AM', 'OP']`.
  - `appointment.bulk_assign_inspector`: roles `['AM', 'OP']`.
- **FR-441**: New module `packages/shared/src/lib/appointment-transitions.ts` exporting `getValidTransitions(currentStatus: AppointmentStatus, role: UserRole, clUserFlags?: ...): AppointmentStatus[]`. The matrix mirrors `CLAUDE.md` §5. The frontend uses this for footer gating; the backend optionally validates against it for early rejection (the state-machine domain remains the authoritative gate).

#### Marker click detail panel

- **FR-450**: Marker click MUST open a new component `AppointmentMapDetailPanel` (right-anchored side panel; overlays the map; does NOT push layout). Existing thin `MapPopup` is replaced for the appointments mode (groups mode keeps its current popup unchanged).
- **FR-451**: Header MUST render: `serviceTypeName` (h2) · `<StatusChip>` (status) · `formatDate(scheduledDate)` + time slot (start–end) · `#{appointmentCode}` (small mono). Plus a close `×` button (top-right).
- **FR-452**: Primary sections (always expanded): **CLIENT** (uppercase label) + `{tenantName}` (bold); **PROPERTIES** (uppercase label) + `<AppointmentCodePill>{propertyCode}` + `{propertyAddress}` full.
- **FR-453**: Collapsible sections (default closed, chevron-down): Properties details · Client details · Scheduled by · Tenant (inquilino) · Bonus and Authorization · Confirmation · Additional data · Meeting location. Each section uses `aria-expanded` + `aria-controls` for a11y.
- **FR-454**: When a collapsible section is FIRST opened, the panel triggers `GET /v1/appointments/:id` once (if not already loaded for this appointment) and hydrates ALL collapsible sections from the single response (the backend's `get-appointment.use-case.ts:100-160` already returns everything needed: `meetingLocation`, `tenantConfirmationStatus`, `notes`, `tenantNote`, `customFieldsJson`, `reason`, `inspectorName`, `branchName`, `contact`, etc.). Subsequent expand actions on the same appointment do NOT re-fetch.
- **FR-455**: "MORE DETAILS" footer CTA: outline button, full-width, label uppercase, opens `/appointments/:id` in a new browser tab (`target=_blank` + `rel="noopener noreferrer"`) per `feedback_new_tab_detail.md`.
- **FR-456**: Click outside the panel OR pressing ESC OR clicking the `×` button closes the panel; the map state (selected marker, lasso polygon if any) is preserved.
- **FR-457**: Clicking a DIFFERENT marker while the panel is open MUST update the panel content to the new appointment. Previously-expanded sections close (collapsed state resets per appointment); the new appointment's collapsible data is fetched on first expand.
- **FR-458**: `tenantName` (the agency/client name) MAY not be in the existing `GET /v1/appointments/:id` response. If absent, extend the response shape additively with `clientName: tenant.name` (single field; no migration). Verify during implementation; add only if missing.
- **FR-459**: New small subcomponent `<AppointmentCodePill code="442303" />` (mono-font, rounded chip, peach background) renders the readable `appointmentCode` per `feedback_no_raw_ids_in_ui.md`. Reused by the modal column 2 (next to service type) and by the marker panel header.
- **FR-460**: UUIDs MUST NOT appear in any rendered text of the detail panel or the modal. Lint-style assertion in component tests: render the panel with seeded data containing a UUID; assert the UUID string is NOT present in the rendered DOM.

### Non-Functional Requirements

- **NFR-401**: Modal renders in < 200 ms for a selection of 100 items (DataTable virtualization not required at this scale, but verify with profiler).
- **NFR-402**: Bulk Cancel for 100 items completes within 10 s p95 (sequential for-of; ~50-100 ms per item via `ExecuteStatusTransitionUseCase`). If slower, document; do not parallelize in this PR.
- **NFR-403**: Lasso polygon stays visually within 16 ms of frame after `draw.create` (no flicker / no disappear). Visual regression captured via Playwright screenshot.

### Key Entities

No new database entities. Reuses `appointments` + existing `audit_logs`. New shared library `appointment-transitions.ts` is a pure-function table.

## Success Criteria

- **SC-401**: Drawing a polygon enclosing 5 markers causes the map to fit the selection (verified by mocking `mapInstance.fitBounds` in the page test).
- **SC-402**: The polygon stays visually rendered until user clears, re-draws, or successfully applies an action.
- **SC-403**: `MapBulkActionModal` lists the selected appointments with checkboxes; deselect updates the count; footer actions respect RBAC + state-machine validity.
- **SC-404**: An OP can bulk-cancel 25 appointments with a reason; mixed-result body surfaces in the modal.
- **SC-405**: A CL_USER without `cancel_appointments` flag does NOT see the Cancel button.
- **SC-406**: All 022/023/024 regression guards remain green (no Postgres / Contact / lasso interaction).

## Assumptions

- The lasso polygon's MapboxDraw default styling is acceptable visually (light blue fill, dashed outline). If QA pushes back, custom paint layer added in a follow-up.
- "Maximum 100 appointments per bulk action" is the right cap — matches existing bulk endpoints (023 bulk-resend uses 100; bulk-edit uses 100). User has not asked for higher.
- ESC key handling does not conflict with other ESC consumers on the map page (verify during implementation; if it does, route ESC through a key dispatcher).
- `getValidTransitions` table is small and fits in a static `Record<AppointmentStatus, AppointmentStatus[]>` per role — no DB lookup needed.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-401 | Custom lasso styling | L | Defer to MapboxDraw default; revisit if QA pushes back. |
| GAP-402 | Parallel bulk execution | L | Sequential for-of is acceptable at 100/request. Future spec if batch sizes grow. |
| GAP-403 | Lasso state persistence | L | No sessionStorage / no reload survival. Out of scope. |
| GAP-404 | Rectangle / circle lasso | L | Polygon only. Different geometry would be a future affordance. |

## Cross-References

- **CLAUDE.md §5**: Appointment state machine — transitions feed `getValidTransitions`.
- **CLAUDE.md §6**: User roles RBAC — feeds `getValidTransitions` and footer gating.
- **PR #3**: BulkEditModal (kept in list page; not modified by 025).
- **022/023/024**: Contacts work — independent. `<TenantConfirmationChip>` reused in modal body.
- **Constitution v1.4.0**: AM/OP cross-tenant; CL roles tenant-pinned; visibility filter applies to the underlying `/v1/appointments` list query the map page already consumes.

## Reference label for PR

`feat.appointments.map_lasso_bulk_modal` (new feature on develop; not stacked).
