# Design: Appointments Map Lasso Flow + Bulk-Action Modal

> ⚠️ **PARTIALLY SUPERSEDED — design rationale only.**
> This document captures the initial design rationale. After 4 user-mockup clarification rounds the implementation contract diverged:
>
> - **Canonical artifacts (use these for implementation)**: `specs/025-appointments-lasso-bulk-flow/{spec,plan,tasks}.md`.
> - Branch is `feat/appointments-map-ux` (NOT `fix/appointments-map-lasso-flow`).
> - Modal default is **all UNCHECKED** (NOT pre-checked as drafted here).
> - Backend uses **4 dedicated bulk endpoints** (Cancel · Reschedule · Status-Transition · Assign-Inspector) — NOT bulk-edit reuse.
> - Scope expanded to include a 4th feature: **AppointmentMapDetailPanel** (marker click → side panel) — not in this draft.
>
> Keep reading for the design reasoning; trust the canonical artifacts for what to build.

---

**Date**: 2026-05-11
**Status**: Design rationale — see canonical artifacts in `specs/025-appointments-lasso-bulk-flow/`
**Predecessors**: PR #3 merged (BulkEditModal in list page + 022+023+024 contacts work)
**Branch**: `feat/appointments-map-ux` (NEW — branch off `develop @ 6035fc9`)
**Cycle**: 1 of this feature
**Related Constitution**: v1.4.0 (AM/OP cross-tenant; per-tenant visibility on cross-tenant entities)

## Problem (from user smoke)

Three related issues hit on the `/appointments` map page after PR #3 merged:

1. **BUG — zoom-out on lasso completion.** User clicks the lasso button, draws a polygon enclosing several markers; on release, the map zooms OUT instead of focusing on the selected markers. Likely cause: an auto-fit `useEffect` (`AppointmentMapPage.tsx:223-239`) recomputes bounds across the whole data set whenever something downstream changes; the lasso polygon's drawing operation may trigger a transient redraw that runs the auto-fit again.
2. **UX — lasso outline disappears.** Once the polygon is drawn (`draw.create` fires), the MapboxDraw control isn't visually preserved — when the user deactivates lasso (or it teardown-cleans on selection finish), the outline is gone. User wants the outline to persist as visual context until they explicitly clear it.
3. **FEATURE — bulk-action modal with granular deselect.** The current `MapSelectionPanel` is a thin bottom strip with `Clear selection` + `Create Group` only. User wants a suspended modal listing all selected appointments with per-row checkboxes (so they can deselect granular: e.g. selected 30, want to apply bulk to 15), plus a richer action footer beyond "Create Group".

## Goals

- Lasso completion focuses the map on the selected markers (or the polygon bounds), with padding — not on the whole data set.
- Lasso outline persists on the canvas after selection until user explicitly clears it (button in modal OR `ESC` key).
- New `MapBulkActionModal` (suspended dialog) replaces inline `MapSelectionPanel` for the lasso flow. The "Create Group" affordance moves into the modal as one of the bulk actions, keeping discoverability.
- Modal supports per-row deselect via checkbox column; bulk action footer covers Cancel, Reschedule, Change Status, Assign Inspector, Re-send Reminder, Create Group.
- All bulk actions go through canonical use cases (state machine sovereignty for status transitions; existing `bulk-edit` for field changes; existing `bulk-resend-reminder` for portal dispatch).

## Non-Goals

- Replacing `BulkEditModal` in the list page (still useful — multi-field tick-and-set UX).
- Changing the lasso geometry to anything other than polygon (no rectangle, no circle).
- Persisting lasso state across page reloads (sessionStorage out of scope).
- Adding new state-machine transitions or audit events (the bulk wrappers delegate to existing transition use case).

## Design

### 1. Lasso state machine

Five visual states, owned by the page-level lasso state:

```
idle ── click lasso button ──▶ drawing
drawing ── polygon released (draw.create) ──▶ review
review ── deselect items ──▶ review (in-place)
review ── apply action ──▶ applying
applying ── success ──▶ done (returns to idle, clears polygon)
applying ── error ──▶ review (modal stays open with error)
review ── Clear / ESC / close modal ──▶ idle (clears polygon)
review ── re-enter drawing (Re-draw button) ──▶ drawing (clears previous polygon)
```

Implementation: a `lassoState: 'idle' | 'drawing' | 'review' | 'applying'` enum in `AppointmentMapPage`. The current `lassoActive: boolean` becomes a derived value (`lassoState !== 'idle'`).

### 2. Camera behaviour (Issue 1)

Two corrections in `AppointmentMapPage`:

**2a. Suppress auto-fit during lasso lifecycle.** Wrap the existing auto-fit `useEffect` so it skips when `lassoState !== 'idle'`. The auto-fit is only useful on initial data load; once the user is interacting with lasso, the camera is theirs.

**2b. Focus on selection at `draw.create` time.** When MapLassoSelect fires `onSelectionChange` with a non-empty array, compute bounds from the selected markers (or — equivalently — from the polygon's coordinates), then `map.fitBounds(selectedBounds, { padding: { top: 80, bottom: 320, left: 80, right: 80 }, maxZoom: 16, duration: 700 })`. The asymmetric padding (`bottom: 320`) leaves room for the modal to appear without obscuring the selection.

Edge case: empty selection (polygon over empty area) → no `fitBounds`, no modal; show a small toast "No appointments in selected area" and return to `idle`. The lasso polygon is cleared.

### 3. Lasso outline persistence (Issue 2)

`MapLassoSelect` is restructured:

- Lifecycle of MapboxDraw is decoupled from `active` boolean. The control is **added once** when the page first enters `drawing` and **kept alive** while `lassoState !== 'idle'`.
- On `draw.create`: instead of leaving the control in `draw_polygon` mode, switch to `simple_select` so the polygon stays visible but is no longer being drawn. The user cannot start a second polygon.
- On `lassoState === 'idle'`: call `draw.deleteAll()` and `map.removeControl(draw)`. The page-level state transition is the trigger, not internal MapLassoSelect logic.
- New prop: `lassoState: LassoState` (replaces `active: boolean`).
- New callback: `onPolygonCleared?: () => void` (fires when the polygon is removed for any reason — used by the page to reset selection).

Visual: the persisted polygon uses MapboxDraw's default styling (semi-transparent fill, dashed outline). No custom paint layers in this design — defer to the library's default.

`ESC` key handler at the page level: while `lassoState === 'review'`, pressing ESC triggers "Clear lasso" → `setLassoState('idle')`.

### 4. `MapBulkActionModal` (Issue 3)

New component at `apps/web/src/features/appointments/components/MapBulkActionModal.tsx`. Replaces the bottom `MapSelectionPanel` strip for the lasso flow.

**Wrapper**: existing `Dialog` primitive (used by `BulkEditModal`). Width: `880px` (wider than BulkEditModal's `560px` because the body is a DataTable).

**Header**:
- Title: `"Bulk Actions ({N} appointments)"` where N is post-deselect count.
- Subtitle: `"Lasso area drawn at {timestamp HH:MM}. Polygon preserved on map."`
- `[Re-draw]` button (small text-link) — clears polygon, returns to `drawing` state, closes modal.
- `[Clear]` button (small text-link) — clears polygon, returns to `idle`, closes modal.
- Close `×` button (top-right) — same as Clear.

**Body** (scrollable):
A DataTable with these columns:

| Column | Render | Sortable? |
|--------|--------|-----------|
| ☑ Checkbox | `<input type="checkbox">` controlled by `deselectedIds` Set | — |
| Code | `appointment.code` (e.g. APT-00123) | yes (default asc) |
| Property | `appointment.propertyAddress` (full address, truncated with tooltip) | no |
| Status | `<StatusChip>` (existing `APPOINTMENT_STATUS_MAP` color lookup) | yes |
| Scheduled | `formatDate(scheduledDate)` + `timeSlot` | yes |
| Inspector | `inspectorName ?? '—'` | no |
| Confirmation | `<TenantConfirmationChip>` if available | no |

Per-row checkbox flips an item in/out of the `deselectedIds` Set. A "Select all / None" toggle in the column header. The DataTable reuses the existing `apps/web/src/components/data/DataTable.tsx` primitive (per `feedback_no_raw_ids_in_ui.md` — never show raw UUIDs).

Footer (sticky):
- Left: `"{Active} of {Total} selected"` counter.
- Right: action buttons (gated by RBAC + state-machine validity — see §6 below).

### 5. Bulk actions — two-step interaction

Each action button in the footer opens a **secondary step** inside the same modal (the body swaps from list to action-specific form). User confirms in step 2; on success modal closes and refetch fires; on per-item error, step 2 shows the mixed-result summary.

| Action | Footer button label | Step 2 form | Backend endpoint |
|--------|---------------------|-------------|------------------|
| Cancel | "Cancel ({N})" | Reason textarea (required, min 3 chars) | `POST /v1/appointments/bulk-cancel` (NEW) |
| Reschedule | "Reschedule ({N})" | Date picker + optional time slot | `POST /v1/appointments/bulk-edit` (REUSE) |
| Change Status | "Change Status ({N})" | Target status select (valid transitions only — intersection across the selection) + optional reason | `POST /v1/appointments/bulk-change-status` (NEW) |
| Assign Inspector | "Assign Inspector ({N})" | Inspector select (scoped to selection's tenant) | `POST /v1/appointments/bulk-edit` (REUSE) |
| Re-send Reminder | "Re-send Reminder ({N})" | Confirm dialog (no form — primary contact dispatch) | `POST /v1/appointments/bulk-resend-reminder` (EXISTS) |
| Create Group | "Create Group ({N})" | Existing `MapGroupCreateModal` shape inlined (or chained) | Existing service-group endpoint |

Step 2 has Back + Apply buttons. Back returns to the list (preserving deselect state). Apply fires the endpoint and transitions modal to `applying` (spinner) → `done` summary (count of success/failed) → user closes.

### 6. RBAC + state-machine validity gating

Each action is gated by:

**A. Role permission** (per `CLAUDE.md` §6 + Constitution v1.4.0):

| Action | AM | OP | CL_ADMIN | CL_USER |
|--------|----|----|----------|---------|
| Cancel | ✓ | ✓ | ✓ (own tenant) | flag `cancel_appointments` |
| Reschedule | ✓ | ✓ | ✓ | flag `create_appointments` (allows edits — verify against role-matrix) |
| Change Status | ✓ | ✓ | n/a (not allowed cross-state) | n/a |
| Assign Inspector | ✓ | ✓ | ✗ | ✗ |
| Re-send Reminder | ✓ | ✓ | ✗ | ✗ |
| Create Group | ✓ | ✓ | ✗ | ✗ |

Implementation: new permission keys added to `packages/shared/src/permissions/role-matrix.ts` mirroring existing ones (e.g. `appointment.bulk_cancel`, `appointment.bulk_change_status`). Footer buttons hidden via `canPerform(key)`.

**B. State-machine validity** (per `CLAUDE.md` §5):

When the selection contains items of mixed status, an action button is **enabled only if it is valid for ALL selected items**. Implementation:

- Frontend computes `validActions` from the selection: for each item, compute the set of legal next statuses via a shared `getValidTransitions(currentStatus, role)` helper in `packages/shared/src/lib/appointment-transitions.ts` (NEW). Intersection across the selection gives the enabled-for-all set.
- If the user selected items where Cancel is invalid for any (e.g. one is already `DONE`), the Cancel button is rendered disabled with a tooltip "Some items already in a terminal state — cannot cancel."
- For Reschedule / Assign Inspector / Re-send Reminder, the constraint is similar (terminal-state items can't be modified; backend rejects gracefully too).

**C. Tenant homogeneity** (carried over from existing `BulkEditModal:50-59`):

Some fields need all items to share tenant/branch (Inspector requires single tenant; time slot requires single branch + tenant). When the selection is mixed, the relevant action is disabled with the same helper text pattern.

### 7. Backend changes

**New endpoints**:

```
POST /v1/appointments/bulk-cancel
  Body: { ids: string[]; reason: string }
  Response: { results: Array<{ id, status: 'CANCELLED' | 'INVALID_TRANSITION' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR', error?: { code, message } }> }
  Auth: AM | OP | CL_ADMIN | CL_USER(flag cancel_appointments)
  Per-item: delegates to ExecuteStatusTransitionUseCase with targetStatus=CANCELLED, reason
  Idempotency: optional Idempotency-Key header per request (entire batch); not per item

POST /v1/appointments/bulk-change-status
  Body: { ids: string[]; targetStatus: AppointmentStatus; reason?: string }
  Response: same shape as bulk-cancel (status set: target | INVALID_TRANSITION | FORBIDDEN | NOT_FOUND | ERROR)
  Auth: AM | OP (status changes are operator-elevated)
  Per-item: delegates to ExecuteStatusTransitionUseCase; reason required iff transition demands it (state machine knows)
```

**Reused endpoints**:
- `POST /v1/appointments/bulk-edit` — for Reschedule (`scheduledDate` field) and Assign Inspector (`assignedInspectorId` field). The modal posts the appropriate subset of `changes`.
- `POST /v1/appointments/bulk-resend-reminder` — exists since 023; modal calls it as-is.

**Implementation pattern** (mirrors `bulk-resend-reminder.use-case.ts`): sequential for-of loop over `ids`, per-item try/catch, mixed-result body. No transactions across items — each item is independent.

**State machine sovereignty preserved**: all status transitions go through `ExecuteStatusTransitionUseCase` (the sole entry point per Constitution §State Machine). The bulk wrapper is glue; it adds no transition logic.

### 8. Shared schemas (`packages/shared/src/schemas/appointment.ts`)

```ts
export const bulkCancelRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().min(3).max(500),
});

export const bulkChangeStatusRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().min(3).max(500).optional(),
});

export const bulkActionResultItemSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['SUCCESS', 'INVALID_TRANSITION', 'FORBIDDEN', 'NOT_FOUND', 'ERROR']),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const bulkActionResponseSchema = z.object({
  results: z.array(bulkActionResultItemSchema),
});
```

`pnpm generate:api` regenerates `api-types.ts` after route schemas are wired.

**Permission keys** (`packages/shared/src/permissions/role-matrix.ts`):

```ts
'appointment.bulk_cancel': { roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], condition: 'cl_user_flag', conditionKey: 'cancel_appointments' },
'appointment.bulk_change_status': { roles: ['AM', 'OP'] },
// bulk_resend_reminder + bulk_edit already exist
```

## Architecture

### Frontend changes

```
apps/web/src/features/appointments/
  pages/
    AppointmentMapPage.tsx
      - lassoState enum (idle | drawing | review | applying)
      - auto-fit useEffect guard: skip when lassoState !== 'idle'
      - on lasso onSelectionChange: fitBounds(selected, padding 80/320/80/80)
      - ESC handler at page level
      - render: MapBulkActionModal when lassoState === 'review' || 'applying'
      - REMOVE inline <MapSelectionPanel> (replaced by modal)
      - KEEP <MapGroupCreateModal> for "Create Group" sub-action
  components/
    MapBulkActionModal.tsx          (NEW)
      - 2-step: review list + action form
      - reuses Dialog, DataTable, StatusChip, TenantConfirmationChip, ContactAutocomplete
      - prop: lassoSelectedIds, selectedAppointments, polygonTimestamp, onClose, onClear, onRedraw, onSuccess
    MapBulkActionFooter.tsx         (NEW — small)
      - action buttons, validity tooltips
    MapBulkActionReviewStep.tsx     (NEW — internal to modal)
      - DataTable with checkbox column + select-all
    MapBulkActionApplyStep.tsx      (NEW — internal to modal)
      - action-specific form (reason / date / status / inspector)
      - results summary on completion
    MapSelectionPanel.tsx           (DELETED — replaced by modal; usage migrated)
  hooks/
    useBulkCancelAppointments.ts    (NEW)
    useBulkChangeStatus.ts          (NEW)
    useBulkEditAppointments.ts      (NEW — wrapper around POST /bulk-edit for the modal)
    useBulkResendReminder.ts        (EXISTS)
apps/web/src/components/map/
  MapLassoSelect.tsx
    - prop: lassoState (replaces active)
    - control lifecycle decoupled: keep MapboxDraw alive across drawing → review
    - on draw.create: switch to simple_select (polygon persists)
    - cleanup only on lassoState === 'idle'
    - new optional onPolygonCleared callback
packages/shared/src/lib/
  appointment-transitions.ts        (NEW)
    - getValidTransitions(currentStatus, role): AppointmentStatus[]
    - matches CLAUDE.md §5 transition matrix + RBAC
```

### Backend changes

```
apps/backend/src/modules/appointment/
  application/use-cases/
    bulk-cancel-appointments.use-case.ts          (NEW)
      - for-of: delegate to ExecuteStatusTransitionUseCase per item
      - per-item result: SUCCESS | INVALID_TRANSITION | FORBIDDEN | NOT_FOUND | ERROR
    bulk-change-status.use-case.ts                (NEW)
      - same pattern
    bulk-edit-appointments.use-case.ts            (EXISTS — unchanged)
    bulk-resend-reminder.use-case.ts              (EXISTS — unchanged)
  interfaces/
    appointment.routes.ts
      - POST /v1/appointments/bulk-cancel        (NEW)
      - POST /v1/appointments/bulk-change-status (NEW)
      - both use Fastify schema:{body,response}; permission gate per-route
packages/shared/src/schemas/
  appointment.ts
    - bulkCancelRequestSchema
    - bulkChangeStatusRequestSchema
    - bulkActionResultItemSchema
    - bulkActionResponseSchema
packages/shared/src/permissions/
  role-matrix.ts
    - appointment.bulk_cancel
    - appointment.bulk_change_status
```

## Data flow (lasso → modal → action)

```
1. User clicks "Select Area" toolbar action
   → setLassoState('drawing')
   → MapLassoSelect mounts MapboxDraw control (draw_polygon mode)

2. User draws polygon, releases
   → draw.create fires → MapLassoSelect computes pointInPolygon
   → onSelectionChange([id1, id2, ...])
   → setLassoSelectedIds, setLassoState('review')
   → useEffect: fitBounds(selectedMarkers, padding 80/320/80/80)
   → MapLassoSelect switches MapboxDraw to simple_select (polygon persists)
   → <MapBulkActionModal> renders

3. User unchecks 5 of 30 items in modal
   → deselectedIds Set updated; activeIds = lassoSelectedIds - deselectedIds

4. User clicks "Cancel (25)" in footer
   → modal step swaps to ReasonForm
   → user types reason, clicks Apply
   → setLassoState('applying')
   → POST /v1/appointments/bulk-cancel { ids: activeIds, reason }
   → response surfaces per-item results (25 SUCCESS, 0 ERROR)
   → modal shows summary; user clicks Done
   → setLassoState('idle'); MapLassoSelect cleans up polygon
   → queryClient invalidates appointments-map query; markers refresh
```

## Testing

### Frontend unit + component

- `MapLassoSelect.test.tsx`: state lifecycle — control mounts on drawing, persists on review, cleans on idle.
- `AppointmentMapPage.test.tsx`: lasso completion calls `fitBounds` with the selected markers' bounds (mock `mapInstance.fitBounds`); auto-fit useEffect skipped when lassoState !== 'idle'; ESC key clears lasso during review.
- `MapBulkActionModal.test.tsx`: renders the selected list with checkboxes; deselect updates count; footer buttons gated by RBAC; "Cancel" disabled when any selected item is already DONE.
- `useBulkCancelAppointments.test.ts`, `useBulkChangeStatus.test.ts`: mock POST + assert correct body shape.

### Backend integration

- `bulk-cancel.routes.test.ts` (Supertest): AM/OP can cancel; CL_USER with cancel_appointments flag can cancel own tenant; CL_USER without flag → 403; per-item result with mixed statuses (one valid, one already CANCELLED → INVALID_TRANSITION).
- `bulk-change-status.routes.test.ts`: AM/OP allowed; CL_* → 403; reason required for transitions that demand one (state machine validation).
- Use-case unit tests: `BulkCancelAppointmentsUseCase` for-of correctness; delegates to `ExecuteStatusTransitionUseCase`; transactional independence (one item fails → others succeed).

### Playwright happy path (OP)

1. Open `/appointments` map; click "Select Area".
2. Draw polygon enclosing 5 markers; verify map zooms to selection (not the whole world).
3. Modal opens listing the 5 appointments; uncheck 2.
4. Click "Re-send Reminder (3)"; confirm; assert toast "3 sent".
5. Verify polygon still on canvas; press ESC; polygon clears; modal closes.

### Regression

- 022 BUG-001 source-scan + pg_typeof (still green — no new repository casts in this PR).
- 023 RelationsTab lazy-fetch.
- 024 Constitution v1.4.0 cross-tenant visibility test (CL_ADMIN sees only own-tenant appointments in the modal list — derived from `/v1/appointments` which already applies the v1.4.0 filter).
- T-2-907 cross-form contract.
- PR #3 BulkEditModal (list page) — unchanged; must still pass its tests.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Auto-fit useEffect race condition (data refresh during review) | Guard with `lassoState !== 'idle'`; document in code comment so future contributors don't accidentally unguard. |
| MapboxDraw cleanup ordering bug (control persists when it shouldn't) | Component test that asserts `removeControl` is called exactly when `lassoState` transitions to `'idle'`. |
| Bulk Cancel for-of takes too long on 100 items (sequential transitions) | `.max(100)` Zod guard caps the batch; per-item ~50-100ms = 5-10s worst case (acceptable). If perf becomes an issue, parallelize within a tenant boundary (out of scope here). |
| State-machine validity diverges between frontend `getValidTransitions` and backend `AppointmentStateMachine` | Shared module in `packages/shared/src/lib/appointment-transitions.ts` is the single source; backend imports the same table. Contract test asserts parity. |
| User confuses "Clear lasso" (clears polygon, keeps selection?) vs "Clear selection" | Single explicit "Clear" action clears BOTH; "Re-draw" clears polygon and returns to drawing state (selection set is empty in new polygon). Copy: "Clear" / "Re-draw" — no "Clear selection" alternative. |
| Mixed-status selection: action disabled but user expects "do what you can" | Tooltip explains why disabled; user can deselect terminal-state items to enable the action. No "partial apply" — explicit deselect is the affordance. |
| `Create Group` collision (existing `MapGroupCreateModal` already wired) | Modal's "Create Group" button just opens the existing `MapGroupCreateModal` with the active selection; no duplicate component. |

## Open questions

None blocking. Two minor UX decisions deferred to implementation:

- **Polygon stroke color**: defer to MapboxDraw default (light blue) unless QA pushes back.
- **Action button ordering in footer**: alphabetical vs frequency-based. Implement alphabetical (Cancel, Change Status, Create Group, Re-send Reminder, Reschedule, Assign Inspector) for predictability; revisit if heatmap shows different patterns.

## Acceptance criteria

- Drawing a lasso polygon enclosing N markers focuses the map on those N markers (no zoom-out).
- The lasso polygon outline stays visible on the canvas after `draw.create` and until the user clears or re-draws.
- A `MapBulkActionModal` opens after lasso completion with a DataTable of the selected appointments, each row has a checkbox, and the footer has the 6 action buttons.
- Per-row checkbox deselect reduces the active count without re-opening the lasso.
- Each footer action is gated by the per-role + per-state-machine table above; disabled actions show a tooltip explaining why.
- Cancel / Change Status delegate to `ExecuteStatusTransitionUseCase` per item; mixed-result body returned.
- Reschedule + Assign Inspector reuse `POST /bulk-edit`; Re-send Reminder reuses 023's endpoint.
- ESC key clears lasso during review (polygon removed, modal closed, state → idle).
- 022 BUG-001 + 023 lazy-fetch + 024 v1.4.0 visibility + T-2-907 regressions all green.
- PR description includes: reference label, RBAC table, screenshots of the modal + the persisting polygon.

## Reference label for PR

`feat.appointments.map_lasso_bulk_modal` (new feature on develop; not stacked on 022+023+024 — different scope, different branch).
