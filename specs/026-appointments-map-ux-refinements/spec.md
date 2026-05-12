# Feature Specification: Appointments Map UX Refinements (026)

**Feature Branch**: `feat/026-appointments-map-ux-refinements` (NEW — created off `develop` AFTER 025 merges)
**Created**: 2026-05-11
**Feature Status**: NEW — 7-item refinement pass following 025 ship
**Predecessor**: 025 (`feat/appointments-map-ux` — lasso state machine + bulk modal + marker detail panel)
**Constitution**: v1.4.0
**Regras validation**: Items 3 + 5 carry literal Regras matrices (do NOT improvise — reuse `ServiceGroupValidator` and `ReopenForRescheduleUseCase` exactly as specified).

## Problem (7 user-smoke refinements)

After 025 cycle 3/2 confirmed the lasso/popup pan + banner work as intended, the user surfaced 7 follow-up refinements on the `/appointments` map UX:

1. **Bulk actions dropdown clipped by viewport** — when the modal sits near the screen edge, the dropdown opens beyond the visible area.
2. **Bulk modal too large, blocks the map** — user wants a smaller modal anchored to the top-right of the map (overlay), not centered.
3. **"Add to group" deserves its own dedicated affordance** (not buried in the Bulk actions dropdown), with full Regras-driven validation of which selected appointments are eligible and which existing groups can receive them.
4. **Bulk actions dropdown content** should be exactly: Cancel, Reschedule, Send confirmation email, Change status (drop Assign Inspector and Re-send Reminder from the dropdown; the latter becomes Send confirmation email — different label, same intent).
5. **Reschedule modal diverges from business rules** — user mockup shows numeric "Slot Size (minutes)" input, but Regras requires a dropdown of the effective time-slot catalog (`GET /v1/time-slots/effective`). Plus other Regras-mandated refactors (use `ReopenForRescheduleUseCase`, bulk limited to same-group, revoke portal tokens, audit `appointment.rescheduled`).
6. **Clicking the appointment code in the modal row** should open the marker detail popup — same handler the map marker click triggers.
7. **Filter panel should be collapsed by default** with a "Filters" toggle button in the top-left of the map. Map takes full canvas when filters are closed.

## Goals

- Viewport-aware dropdown that never clips.
- Compact, top-right-anchored Bulk Action Modal (≤ 500px width, top-right of map area).
- Dedicated "Add to group" footer button driven by `ServiceGroupValidator` reuse + per-group eligibility preview.
- Bulk actions dropdown reduced to 4 items per user mockup; "Re-send Reminder" relabelled to "Send confirmation email".
- Reschedule flow: dropdown picker from effective catalog + same-group bulk scope + portal-token revoke on reschedule + `ReopenForRescheduleUseCase` reuse.
- Row code click opens the same `AppointmentMapDetailPanel` the marker click opens.
- Filter panel collapsed by default with a top-left toggle button; state persisted in sessionStorage.
- All 025 invariants preserved: default-UNCHECKED, no raw UUIDs in DOM, lazy fetch on detail panel, polygon persistence, state-machine sovereignty, BUG-001 source-scan, 022/023/024 regression gates.

## Non-Goals

- Adding new bulk operations beyond the four listed (Cancel · Reschedule · Send confirmation email · Change status) + Add to group.
- Cross-group reschedule (Regras: limit to same-group bulk in this cycle — future enhancement out of scope).
- Replacing `MapGroupCreateModal` (kept for "Create group" flow; "Add to group" is a separate sub-modal).
- Map mode is still appointments OR groups — no new mode.
- Replacing the design-system Dialog primitive with a custom popover library (use viewport-aware positioning on top of existing primitives).

## User Scenarios & Testing

### User Story 1 — Dropdown never clips (Item 1)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11

An operator opens the modal near the screen edge and clicks "Bulk actions ▾". The dropdown always opens within the visible viewport: it flips up when there is more space above, flips left when there is more space to the left, etc.

**Acceptance Scenarios**:

1. **Given** the modal anchored top-right with the dropdown trigger near the bottom of the viewport, **When** the operator clicks the trigger, **Then** the dropdown opens upward (above the trigger).
2. **Given** the dropdown opens, **When** the viewport is resized so the dropdown would clip, **Then** the dropdown re-flips to the side with available space without losing the open state.
3. **Given** scroll happens inside the modal body, **When** the dropdown is open, **Then** the dropdown stays anchored to the trigger (closes on outside scroll if the trigger leaves the viewport).

### User Story 2 — Compact modal at top-right (Item 2)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11

The bulk-action modal renders as a compact overlay anchored to the top-right of the map area (not the centre of the screen). Width ~480px. The map remains visible behind/around it.

**Acceptance Scenarios**:

1. **Given** the user finishes drawing a lasso, **When** the modal opens, **Then** it is positioned at the top-right of the map area (within the map container, not the page), with `top: 16px, right: 16px` offset.
2. **Given** the modal is open, **When** the user pans the map below the modal, **Then** the map underneath continues to respond to mouse events that fall outside the modal's box.
3. **Given** the modal height exceeds the viewport, **When** rendered, **Then** the body scrolls within the modal; header and footer remain fixed.
4. **Given** a small viewport (mobile <600px width), **When** the modal opens, **Then** it falls back to the existing `Dialog` centred behaviour (full-width overlay) — top-right anchoring only applies to ≥ tablet breakpoints.

### User Story 3 — "Add to group" dedicated affordance with Regras validation (Item 3)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11 + Regras matriz (spec 005)

The footer has a dedicated `[Add to group]` button (NOT inside the Bulk actions dropdown). Clicking it opens a sub-modal listing the existing service groups that can receive the currently-checked appointments. The Validator runs:

- **Appointment eligibility**: status MUST be `DRAFT` or `AWAITING_INSPECTOR` (per Regras matriz). Appointments NOT in this set are flagged with a per-row warning and excluded from the add operation; the operator can deselect them or click "Continue with N eligible".
- **Group eligibility** (filtering existing groups): each group MUST be non-terminal · same tenant as the appointment set · same serviceType as the appointment set · capacity ≤ 30 after adding · same scheduled date + timeWindow as the appointments. Groups that do NOT pass are hidden from the picker (with a helper "X groups hidden — failed eligibility checks. Try a different selection.").
- **Side effect**: appointments transitioning DRAFT → AWAITING_INSPECTOR auto-transition as part of the add operation (Regras consistency US1 of spec 005).
- **RBAC**: AM and OP (cross-tenant per Constitution v1.4.0).

**Acceptance Scenarios**:

1. **Given** 5 appointments checked, all `DRAFT`, **When** operator clicks "Add to group", **Then** the picker shows only existing groups that pass the validator; selecting one and confirming adds the 5 appointments and auto-transitions the `DRAFT` ones to `AWAITING_INSPECTOR`.
2. **Given** 5 appointments checked, 3 `DRAFT` + 2 `DONE`, **When** operator clicks "Add to group", **Then** the sub-modal shows a banner "2 appointments are not eligible (must be DRAFT or AWAITING_INSPECTOR). They will be skipped."; the operator can continue with 3 or cancel.
3. **Given** 5 appointments span 2 tenants, **When** operator clicks "Add to group", **Then** the picker shows zero groups; helper text explains "Selection spans multiple tenants — all appointments must share a tenant".
4. **Given** a CL_ADMIN, **When** they open the bulk modal, **Then** the "Add to group" button is NOT rendered (AM/OP only).

### User Story 4 — Bulk actions dropdown is exactly 4 items (Item 4)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-mockup-2026-05-11

The Bulk actions dropdown contains: Cancel · Reschedule · Send confirmation email · Change status. Drop "Assign Inspector" (kept for the list page's BulkEditModal — out of map scope) and rename "Re-send Reminder" → "Send confirmation email".

**Acceptance Scenarios**:

1. **Given** an AM, **When** they open the dropdown, **Then** exactly 4 items are visible: Cancel · Reschedule · Send confirmation email · Change status.
2. **Given** a CL_ADMIN, **When** they open the dropdown, **Then** only Cancel + Reschedule are visible (the other two are AM/OP only — same RBAC as 025 FR-440).
3. **Given** a CL_USER without `cancel_appointments` flag, **When** they open the dropdown, **Then** Cancel is hidden; the dropdown shows only Reschedule.
4. **Given** the selection contains items in terminal state, **When** the dropdown opens, **Then** Cancel + Change status are disabled with tooltip "Some items in terminal state".

### User Story 5 — Reschedule modal aligned with Regras (Item 5)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-clarification + Regras matriz (spec 006 GAP-003)

The Reschedule action opens a form with:
- **Date picker** (single date input).
- **Time slot dropdown** populated from `GET /v1/time-slots/effective?branchId=...` (uses the existing `useTimeSlotOptions` hook). NOT a numeric "Slot Size (minutes)" input — the user mockup diverged here; Regras prevails.
- **Reason** (optional textarea).

**Bulk scope is limited to appointments within the same service group** in this cycle. If the checked set spans multiple groups (or mixes grouped/non-grouped), the Reschedule action is disabled with tooltip "Bulk reschedule limited to appointments within the same group in this cycle".

**Backend**: uses the existing `ReopenForRescheduleUseCase` per Regras (NOT a new use case). Audit emits `appointment.rescheduled` with before/after `{ scheduledDate, timeSlot }`. **Portal tokens for the appointment are revoked** (consistency with 007 portal flow — Regras-mandated refactor).

**Date window**: backend enforces ≤ 30 days from the original `scheduledDate` (existing `ReopenForRescheduleUseCase` validation).

**RBAC** (matriz 2.2): AM, OP, CL_ADMIN (within own tenant). CL_USER excluded.

**Acceptance Scenarios**:

1. **Given** 3 checked appointments in the same service group, **When** operator opens Reschedule, **Then** the form shows date picker + time slot dropdown populated from `/v1/time-slots/effective`; the operator picks a new date + slot + optional reason and confirms; backend processes via `ReopenForRescheduleUseCase` per item.
2. **Given** the checked set spans 2 different service groups, **When** operator opens the dropdown, **Then** Reschedule is disabled with the same-group tooltip.
3. **Given** a successful reschedule, **When** backend processes, **Then** portal tokens for each appointment are revoked (`tokenRepo.revokeAllForAppointment(appointmentId)`); the audit log shows `appointment.rescheduled` with before/after.
4. **Given** the operator picks a date > 30 days from the original, **When** the backend validates, **Then** the per-item result returns `INVALID_DATE_WINDOW`; modal surfaces the error.
5. **Given** no numeric "Slot Size" input is shown, **When** operator inspects the form, **Then** only the dropdown picker is present — the design system is honoured.

### User Story 6 — Click appointment code opens marker detail panel (Item 6)

- **Priority**: P2
- **Status**: NEW
- **Source**: user-smoke-2026-05-11

Clicking the `<AppointmentCodePill>` in a modal row opens the same `AppointmentMapDetailPanel` that a map marker click opens — providing context without leaving the modal.

**Acceptance Scenarios**:

1. **Given** the bulk modal is open with rows, **When** operator clicks the `AppointmentCodePill` of a row (e.g. `#442303`), **Then** the `AppointmentMapDetailPanel` opens for that appointment (right-side; same handler as marker click).
2. **Given** the panel is open from a code click, **When** operator closes the panel, **Then** the bulk modal remains open with the same checked state.
3. **Given** the appointment is not present in the current map data (edge case — would not happen since lasso captured it), **When** the click fires, **Then** the panel opens with the lazy-fetch path (no crash).

### User Story 7 — Filter panel collapsed by default with top-left toggle (Item 7)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-smoke-2026-05-11

`/appointments` map opens with the filter panel CLOSED by default. A "Filters" pill-style button sits in the top-left of the map area. Clicking it toggles the panel open (slide-in from the left, overlay style — does NOT push map content). The map fills the whole screen when filters are closed. State persists in `sessionStorage` keyed by `appointments-map.filters.open` so navigation within the session remembers the choice.

**Acceptance Scenarios**:

1. **Given** the user lands on `/appointments` map for the first time in the session, **When** the page mounts, **Then** the filter panel is closed; the map fills the full canvas; a "Filters" button is visible at top-left.
2. **Given** the operator clicks "Filters", **When** the toggle fires, **Then** the panel slides in from the left as an overlay (does NOT push the map); `sessionStorage.appointments-map.filters.open = 'true'`.
3. **Given** the operator clicks the X (or the Filters button again), **When** the toggle fires, **Then** the panel closes; sessionStorage updated to `'false'`.
4. **Given** the operator navigates away and returns within the same session, **When** the map mounts, **Then** the panel state is restored from sessionStorage.
5. **Given** the panel is open, **When** the operator interacts with a filter, **Then** the data reloads immediately (per `feedback_no_unnecessary_gates.md` — no "apply" button gate).

### Edge Cases

- **Add to group with mixed serviceType**: validator filters out groups whose serviceType doesn't match; if NO group passes, picker shows the empty state and a "Try a different selection" hint.
- **Reschedule across service groups**: action disabled with explanatory tooltip (per US5 AC2). Future enhancement out of scope.
- **Send confirmation email with NO_PRIMARY_CONTACT** per 023: existing bulk-resend-reminder behaviour preserved; per-item result `NO_PRIMARY_CONTACT` surfaces in the result summary.
- **Filter panel state on first load** (no sessionStorage entry): defaults to CLOSED.
- **Dropdown viewport-aware on extreme small windows**: fallback to bottom-anchored if neither flip direction has room (max-height with internal scroll).
- **Top-right modal collision with map controls** (e.g. zoom +/− buttons): the modal stacks above; map controls are still clickable when modal is closed.

## Requirements

### Functional Requirements

#### Dropdown viewport-aware (Item 1)

- **FR-501**: The Bulk actions dropdown (and any other dropdown in the new modal) MUST detect viewport edges on open and choose the flip direction with the most space (top/bottom/left/right priorities). Algorithm: measure trigger rect + viewport; if dropdown height fits below trigger, open downward; else if it fits above, open upward; otherwise apply `max-height: <available>` with internal scroll.
- **FR-502**: On viewport resize while the dropdown is open, recompute flip direction; if the trigger leaves the viewport (scroll), close the dropdown.

#### Modal positioning + size (Item 2)

- **FR-510**: The bulk modal MUST render as an overlay anchored to the top-right of the map container at `top: 16px, right: 16px`, width `min(480px, calc(100vw - 32px))`, max-height `calc(100vh - 32px)`. On viewports ≤ 600px, fall back to centered full-width Dialog (mobile).
- **FR-511**: The map MUST remain interactive in the area NOT covered by the modal. Pointer events on the modal stop propagation; map handles events outside the modal box.
- **FR-512**: The modal MUST NOT block the map controls (zoom, lasso button, layer toggle). Stacking context: modal `z-index: 30`; map controls `z-index: 35` if collision occurs (verify during impl).

#### Add to group dedicated (Item 3)

- **FR-520**: The bulk modal footer MUST expose a dedicated `[Add to group]` button (next to `[Create group]`), gated by `canPerform('appointment.add_to_group')` — AM, OP only.
- **FR-521**: Clicking `[Add to group]` opens a sub-modal `MapAddToGroupSubModal` listing existing service groups in the active tenant set. The list is filtered by the `ServiceGroupValidator` (reuse `apps/backend/src/modules/service-group/domain/service-group.validator.ts` — exposed via a new use case + endpoint for the eligibility check).
- **FR-522**: Sub-modal MUST validate per-appointment eligibility (status ∈ {DRAFT, AWAITING_INSPECTOR}); ineligible appointments show a warning banner + are excluded from the operation on confirm.
- **FR-523**: New endpoint `POST /v1/service-groups/:groupId/appointments` (preferred over PATCH `/v1/appointments/:id { serviceGroupId }` because the operation is fundamentally group-centric — the validator lives in the group module, the audit subject is the group). Body: `{ appointmentIds: string[].min(1).max(30) }`. Response: per-item envelope `{ data: { results: [{ appointmentId, status: 'OK' | 'INVALID_STATUS' | 'INVALID_TENANT' | 'INVALID_SERVICE_TYPE' | 'GROUP_FULL' | 'INVALID_DATE_WINDOW' | 'ALREADY_IN_GROUP' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR', error?: { code, message } }] } }`.
- **FR-524**: Side effect: appointments transitioning DRAFT → AWAITING_INSPECTOR auto-transition on add (Regras US1 of spec 005 consistency). Audit emits `appointment.added_to_group` + the resulting `appointment.released` if status changed.
- **FR-525**: New endpoint `POST /v1/service-groups/:groupId/eligibility-check` (read-only) returning per-appointment + per-group eligibility hints for the sub-modal preview. Body: `{ appointmentIds: string[] }`. Response: `{ data: { eligibleAppointmentIds: string[], ineligibleAppointmentIds: Array<{ id, reasonCode }>, groupAccepts: boolean, groupReasons: string[] } }`. The sub-modal uses this to pre-flag before confirm.

#### Bulk actions dropdown items (Item 4)

- **FR-530**: The Bulk actions dropdown MUST show exactly four items: Cancel · Reschedule · Send confirmation email · Change status. Order: alphabetical for predictability.
- **FR-531**: "Re-send Reminder" (025 label) is RENAMED to "Send confirmation email" (no backend change — same endpoint `POST /v1/appointments/bulk-resend-reminder`; the modal hook renames the user-facing label only).
- **FR-532**: Assign Inspector is REMOVED from the map bulk dropdown (still available in the list-page BulkEditModal — out of scope).

#### Reschedule refactor (Item 5)

- **FR-540**: The map bulk Reschedule action MUST delegate to the existing `ReopenForRescheduleUseCase` (NOT a new use case). New endpoint `POST /v1/appointments/bulk-reopen-for-reschedule` wraps per-item delegation (mirrors 025 bulk-cancel pattern). RBAC matriz 2.2: AM, OP, CL_ADMIN.
- **FR-541**: The Reschedule form MUST use a dropdown picker populated from `useTimeSlotOptions(branchId, tenantId)` (existing hook against `/v1/time-slots/effective`). NO numeric "Slot Size (minutes)" input.
- **FR-542**: Bulk reschedule is LIMITED to appointments within the same service group in this cycle. Frontend pre-check: if the checked set spans groups (or mixes grouped/non-grouped), the Reschedule menu item is disabled with a tooltip "Bulk reschedule limited to appointments within the same group in this cycle". Backend ALSO validates and returns `INVALID_SCOPE` for items breaching the constraint.
- **FR-543**: On successful reschedule, the backend MUST revoke active portal tokens for the appointment via `tokenRepo.revokeAllForAppointment(appointmentId)` — consistency with 007 portal reschedule flow. Audit emits `appointment.rescheduled` with `before/after: { scheduledDate, timeSlot }` + a separate `tenant_portal.tokens_revoked` event per appointment.
- **FR-544**: Date window validation MAX 30 days from original `scheduledDate` (existing `ReopenForRescheduleUseCase` rule). Per-item result `INVALID_DATE_WINDOW` if breached.
- **FR-545**: Reason is OPTIONAL.

#### Code click → marker detail panel (Item 6)

- **FR-550**: The `<AppointmentCodePill>` in the bulk modal row MUST be clickable: `onClick` opens the `AppointmentMapDetailPanel` for that appointment id (reuses the same handler the map marker click uses).
- **FR-551**: The pill MUST visually indicate clickability (cursor pointer, hover background change). Accessibility: `role="button"`, `aria-label="Open details for appointment {code}"`.
- **FR-552**: The detail panel opening from a code click MUST NOT close the bulk modal — both can be visible simultaneously.

#### Filter panel collapse + toggle (Item 7)

- **FR-560**: `AppointmentMapPage` MUST default the filter panel to CLOSED on first session load. The state is read from / written to `sessionStorage.appointments-map.filters.open` (a string `'true'` or `'false'`). On absence, default `'false'`.
- **FR-561**: A "Filters" pill-style toggle button MUST be rendered at top-left of the map container (analogous to the existing top-right `MapFloatingAction` actions but positioned top-left). Button label: "Filters" with a filter icon (`mdi-filter-variant`).
- **FR-562**: The panel MUST slide in as an OVERLAY (NOT push) when toggled open. CSS approach: position absolute over the map; `transform: translateX` animation.
- **FR-563**: When the panel is open, an X close button MUST be visible inside the panel header (separate from the Filters button). Either control toggles the state.
- **FR-564**: Filter interactions inside the panel MUST trigger data reload immediately (no "apply" gate — per `feedback_no_unnecessary_gates.md`).

#### Permissions

- **FR-570**: Add to `packages/shared/src/permissions/role-matrix.ts`:
  - `appointment.add_to_group`: roles `['AM', 'OP']`
  - `appointment.bulk_reopen_for_reschedule`: roles `['AM', 'OP', 'CL_ADMIN']` (matches existing `ReopenForRescheduleUseCase` RBAC per Regras matriz 2.2)
- **FR-571**: Existing `appointment.bulk_cancel`, `appointment.bulk_status_transition` from 025 unchanged. `appointment.bulk_assign_inspector` REMOVED from the map dropdown UI but kept in the role-matrix (still used by list page BulkEditModal).

### Non-Functional Requirements

- **NFR-501**: Dropdown flip recompute completes within 16 ms (1 frame) of trigger click — no visible jitter.
- **NFR-502**: Top-right modal mount + map continues to receive pointer events outside its box within 1 frame.
- **NFR-503**: `POST /v1/service-groups/:groupId/eligibility-check` p95 < 200 ms for batches up to 30 appointments — read-only query joining `appointments + service_groups + service_types`.
- **NFR-504**: `POST /v1/service-groups/:groupId/appointments` p95 < 500 ms for batches up to 30 (validator + per-item transition).
- **NFR-505**: Filter panel toggle animation 200ms ease-out; no layout shift on the map.

### Key Entities

No new entities. Reuses `service_groups`, `appointments`, existing `ServiceGroupValidator`, existing `ReopenForRescheduleUseCase`, existing `TenantPortalTokenRepository.revokeAllForAppointment`.

## Success Criteria

- **SC-501**: Dropdown opens without clipping regardless of modal position; verified with a Playwright resize step.
- **SC-502**: Modal rendered at top-right with map interactive in the surrounding area.
- **SC-503**: AM/OP using "Add to group" sees only eligible existing groups; ineligible appointments excluded with a banner; DRAFT → AWAITING_INSPECTOR auto-transition fires.
- **SC-504**: Bulk dropdown shows exactly Cancel · Reschedule · Send confirmation email · Change status (per role).
- **SC-505**: Reschedule uses dropdown picker from `/v1/time-slots/effective`; bulk same-group only; portal tokens revoked; audit `appointment.rescheduled` emitted.
- **SC-506**: Clicking the code pill opens the detail panel; modal stays open.
- **SC-507**: Filter panel closed on first load; toggle slides in overlay; sessionStorage round-trip works.
- **SC-508**: All 025 invariants still green (default-UNCHECKED, no raw UUIDs, polygon persistence, lazy fetch). 022/023/024 regression gates still green.

## Assumptions

- `ServiceGroupValidator` (spec 005 line 244) is the authoritative validation logic — DO NOT duplicate the rule set in 026; expose it via a new use case OR thin wrapper.
- `ReopenForRescheduleUseCase` (spec 006 GAP-003) already exists with the 30-day window + audit emit. 026 adds the portal-token revoke step (a small additive change to the use case OR a sibling event handler — Executor's call, but must NOT regress the existing single-item endpoint).
- `useTimeSlotOptions` hook already hits `/v1/time-slots/effective` — 026 just adopts it in the Reschedule form.
- The bulk modal stays positioned top-right on desktop; mobile fallback to centered Dialog (current behaviour) preserves a11y.
- "Re-send Reminder" 025 endpoint (`POST /v1/appointments/bulk-resend-reminder`) reused unchanged; only the label changes.

## Known Gaps (carried + new)

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-405 | Per-channel SMS/Email statuses | L | Carried from 025 — `ConfirmationChannelIcons` still derives both icons from `tenantConfirmationStatus`. Out of scope. |
| GAP-501 | Cross-group bulk reschedule | M | Regras-mandated same-group limit in 026. Future enhancement: a coordination service across groups + idempotent transitions per-group sub-batch. |
| GAP-502 | Per-appointment ineligibility merge UI in Add to group | L | The sub-modal lists groups that pass; per-row ineligible-appointment is a banner, not a "merge ineligibles into a new group" flow. Out of scope. |
| GAP-503 | Mobile-first redesign of the bulk modal | L | Mobile falls back to centered Dialog (current behaviour). A native mobile sheet pattern is a future enhancement. |
| GAP-504 | Filter URL-state sync | L | sessionStorage only (not URL params). Bookmarkable filter URLs out of scope. |

## Cross-References

- **025**: `MapBulkActionModal`, `AppointmentMapDetailPanel`, `MapLassoSelect` — 026 refines layout, content, behaviour.
- **005**: `service-group.validator.ts` — reused.
- **006**: `ReopenForRescheduleUseCase` GAP-003 — reused + extended with portal-token revoke.
- **007**: portal token revoke pattern — `tokenRepo.revokeAllForAppointment` reused for consistency.
- **023**: `bulk-resend-reminder` endpoint — relabelled in UI as "Send confirmation email".
- **`feedback_no_raw_ids_in_ui.md`**: `AppointmentCodePill` reused (now clickable per FR-550).
- **`feedback_no_unnecessary_gates.md`**: filter panel collapse defers visibility, NOT data loading — FR-564 enforces.
- **Constitution v1.4.0**: AM/OP cross-tenant; CL_* tenant-pinned; per-tenant visibility on cross-tenant entities (Contact).

## Reference label for PR

`feat.appointments.map_ux_refinements`
