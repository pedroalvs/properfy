# Tasks: Appointments Map UX (025)

**Feature**: `025-appointments-lasso-bulk-flow`
**Plan**: `./plan.md` · **Spec**: `./spec.md`
**Branch**: `feat/appointments-map-ux` (NEW; off `develop @ 6035fc9`)
**Reference label**: `feat.appointments.map_ux`

## Convention

- Tasks are dependency-ordered top-to-bottom.
- `[shared]` `[backend]` `[web]` `[test]` `[delete]` tags indicate workspace.
- All commits target the new branch; do NOT stack on 022+023+024.
- 022 / 023 / 024 regression gates MUST stay green at every step.

---

## 1. Shared schemas + permissions + transition matrix

- [ ] **T-4-101 [shared]** Create `packages/shared/src/lib/appointment-transitions.ts` exporting `getValidTransitions(currentStatus, role, clUserFlags?)` and `isReasonRequired(currentStatus, targetStatus)` per `plan.md` §1. Mirrors CLAUDE.md §5 transition matrix. Unit tests for every transition in the matrix.
- [ ] **T-4-102 [shared]** Update `packages/shared/src/schemas/appointment.ts` with:
  - `bulkCancelRequestSchema`
  - `bulkRescheduleRequestSchema`
  - `bulkStatusTransitionRequestSchema`
  - `bulkAssignInspectorRequestSchema`
  - `bulkActionResultItemSchema`
  - `bulkActionResponseSchema`
- [ ] **T-4-103 [shared]** Add to `packages/shared/src/permissions/role-matrix.ts`:
  - `appointment.bulk_cancel` (AM, OP, CL_ADMIN, CL_USER+flag)
  - `appointment.bulk_reschedule` (AM, OP, CL_ADMIN, CL_USER)
  - `appointment.bulk_status_transition` (AM, OP)
  - `appointment.bulk_assign_inspector` (AM, OP)
  Update `role-matrix.test.ts`.

## 2. Backend application

- [ ] **T-4-201 [backend]** Create `BulkCancelAppointmentsUseCase` (`apps/backend/src/modules/appointment/application/use-cases/bulk-cancel-appointments.use-case.ts`). Pattern from `plan.md` §2: for-of with idempotency `bulk_cancel:{apptId}:{dayKey}`; delegate to `ExecuteStatusTransitionUseCase`; map errors to per-item statuses. Unit tests: happy path · INVALID_TRANSITION · FORBIDDEN · NOT_FOUND · ERROR · IDEMPOTENT_REPLAY.
- [ ] **T-4-202 [backend]** Create `BulkRescheduleAppointmentsUseCase`. Delegates to `UpdateAppointmentUseCase` with `{ scheduledDate, timeSlot? }`. Same idempotency pattern. Unit tests.
- [ ] **T-4-203 [backend]** Create `BulkStatusTransitionUseCase`. Delegates to `ExecuteStatusTransitionUseCase` with caller-supplied target. Validates reason via shared `isReasonRequired`. Unit tests.
- [ ] **T-4-204 [backend]** Create `BulkAssignInspectorUseCase`. Delegates to `UpdateAppointmentUseCase`. Validates inspector active. Unit tests.
- [ ] **T-4-205 [backend]** Verify `get-appointment.use-case.ts` returns `clientName` (agency tenant.name). If absent, add additively — fetch `tenantRepo.findById(appointment.tenantId)` and expose `clientName: tenant.name`. Update tests.

## 3. Backend routes

- [ ] **T-4-301 [backend]** Add four new endpoints to `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts`:
  - `POST /v1/appointments/bulk-cancel`
  - `POST /v1/appointments/bulk-reschedule`
  - `POST /v1/appointments/bulk-status-transition`
  - `POST /v1/appointments/bulk-assign-inspector`
  Each with Fastify `schema: { body, response }`; permission gate via `authorizationService.assertRoles` using the matching `appointment.bulk_*` key. Wire use cases into the container.
- [ ] **T-4-302 [backend][test]** Supertest cases per endpoint:
  - Happy path (mixed-result body).
  - RBAC denial (CL_ADMIN denied for status-transition; CL_USER without flag denied for cancel).
  - Body-size cap (101 ids → 400).
  - Reason required by transition (e.g. SCHEDULED → REJECTED without reason → INVALID_TRANSITION error in per-item result, NOT 400 — state machine drives this).
- [ ] **T-4-303 [shared]** Run `pnpm generate:api`. Commit regenerated `packages/shared/src/api-types.ts`. Verify only contact-related delta is the four new endpoints (no unrelated drift).

## 4. Frontend — primitives + utilities

- [ ] **T-4-401 [web]** Create `apps/web/src/features/appointments/components/AppointmentCodePill.tsx` (small mono-font chip, peach background). Component test rendering `<AppointmentCodePill code="442303">`.
- [ ] **T-4-402 [web]** Create `ConfirmationChannelIcons.tsx`. Two icons (email + sms) with status-driven colours. Verify the marker list payload exposes per-channel status; if not, accept fallback rendering and capture GAP-405.
- [ ] **T-4-403 [web]** Create four hooks:
  - `useBulkCancelAppointments.ts`
  - `useBulkRescheduleAppointments.ts`
  - `useBulkStatusTransition.ts`
  - `useBulkAssignInspector.ts`
  Each is a `useCreateMutation` wrapper. Stub unit tests asserting posted body shape.

## 5. Frontend — `MapLassoSelect` refactor

- [ ] **T-4-501 [web]** Refactor `apps/web/src/components/map/MapLassoSelect.tsx`:
  - Replace `active: boolean` prop with `lassoState: 'idle' | 'drawing' | 'review' | 'applying'`.
  - MapboxDraw control lifecycle: mount on `drawing`; keep alive through `review`+`applying`; remove + `deleteAll()` on `idle`.
  - On `draw.create`: switch to `simple_select` mode (polygon persists).
  - Disable `map.dragPan` while `lassoState === 'drawing'`; re-enable on transitions out of drawing.
  - Custom paint layer: fill `rgba(255, 178, 102, 0.18)`, outline `#FF8A33` solid width 2.
  - New optional `onPolygonCleared?: () => void` callback.
- [ ] **T-4-502 [test]** Component test: state-lifecycle assertions (control mounted at drawing, persists at review, cleaned at idle); custom paint layer applied.

## 6. Frontend — `MapBulkActionModal`

- [ ] **T-4-601 [web]** Create `MapBulkActionModal.tsx` per `plan.md` §3 and spec §Modal anatomy. Steps + footer state matrix; default checked state = EMPTY Set; select-all toggle in header with indeterminate state.
- [ ] **T-4-602 [web]** 7-column DataTable body per spec §Modal column structure:
  - col 1: checkbox
  - col 2: serviceType + `<AppointmentCodePill>`
  - col 3: formatted date + start of timeSlot
  - col 4: `<StatusChip>`
  - col 5: `<ConfirmationChannelIcons>`
  - col 6: serviceGroupName ?? '—'
  - col 7: `<RowActionsMenu>` (3-dots)
- [ ] **T-4-603 [web]** Step 2 forms per action:
  - Cancel → reason textarea (3-500 chars, required).
  - Reschedule → date input + optional time slot select (homogeneous-branch guard).
  - Change Status → target-status select (intersection of valid transitions across checked items via `getValidTransitions`).
  - Assign Inspector → inspector select (homogeneous-tenant guard).
  - Re-send Reminder → confirm dialog (no form).
  Back returns to step 1 preserving check state; Apply fires the hook; on result, body swaps to summary.
- [ ] **T-4-604 [web]** Footer state matrix per spec:
  - 0 checked: `[Close] [Add to group disabled] [Create group disabled]`.
  - ≥1 checked: `[Close] [Bulk actions (N) ▾] [Add to group] [Create group (N)]`.
  Bulk actions dropdown items gated by RBAC (`canPerform`) + state-machine validity (`getValidTransitions` intersection).
- [ ] **T-4-605 [web]** Create `MapAddToGroupModal.tsx` (sub-modal) — searchable existing-group picker scoped to active selection's tenant set; disables when selection spans tenants. Dispatches `POST /v1/service-groups/{groupId}/appointments` (verify endpoint existence; add additively if missing — task T-4-206 if needed).
- [ ] **T-4-606 [test]** Component tests:
  - Default UNCHECKED state (assert no row is checked on mount).
  - Select-all toggle (header checkbox flips all).
  - Footer transitions 0↔≥1 verified.
  - Bulk actions dropdown items disabled per RBAC + state-machine validity.
  - UUID-not-rendered assertion (seed rows with UUID; assert UUID string absent from DOM).

## 7. Frontend — `AppointmentMapDetailPanel`

- [ ] **T-4-701 [web]** Create `AppointmentMapDetailPanel.tsx` per `plan.md` §6 and spec FR-450..460. Right-anchored `<DrawerPanel size="narrow">`. Header with `serviceTypeName` + `<StatusChip>` + date+time + `#{appointmentCode}` + close `×`.
- [ ] **T-4-702 [web]** Always-expanded sections (CLIENT, PROPERTIES) hydrated from marker payload (no fetch yet).
- [ ] **T-4-703 [web]** 8 collapsible `<DisclosureSection>` sections — default closed. First time any expands, fire `useAppointmentDetail(appointmentId, { enabled: true })`; populate ALL sections from the single response.
- [ ] **T-4-704 [web]** "MORE DETAILS" CTA — full-width outline button; opens `/appointments/:id` in new tab.
- [ ] **T-4-705 [web]** Close on ESC / click outside / `×` — preserves map state.
- [ ] **T-4-706 [web]** Click on a DIFFERENT marker swaps appointment in panel; collapsed sections reset; new fetch on first expand.
- [ ] **T-4-707 [test]** Component tests:
  - Renders header + CLIENT + PROPERTIES from marker payload without firing fetch.
  - First expand of any collapsible triggers exactly one fetch; subsequent expands of OTHER collapsibles do NOT re-fetch.
  - Marker swap resets collapse state and clears cache for new ID.
  - UUID-not-rendered assertion.

## 8. Frontend — `AppointmentMapPage` integration

- [ ] **T-4-801 [web]** Refactor `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx`:
  - Introduce `lassoState` enum; replace `lassoActive` boolean.
  - Auto-fit useEffect guard: skip when `lassoState !== 'idle'`.
  - `handleLassoSelectionChange`:
    - 0 ids → toast "No appointments in selected area" + `lassoState = 'idle'` (polygon clears via MapLassoSelect).
    - ≥1 ids → if any selected marker outside viewport, `fitBounds(selectedBounds, padding 100, maxZoom 16)`; else NO camera move. Set `lassoState = 'review'`.
  - ESC handler at page level during review → idle.
  - Render `<MapBulkActionModal>` when `review || applying`.
  - Replace inline `<MapPopup>` for `mode === 'appointments'` with `<AppointmentMapDetailPanel>`; keep popup for `mode === 'groups'`.
  - Remove `<MapSelectionPanel>` render.
- [ ] **T-4-802 [delete]** Delete `apps/web/src/features/appointments/components/MapSelectionPanel.tsx` + `.test.tsx`. Update any barrel exports.
- [ ] **T-4-803 [test]** `AppointmentMapPage.test.tsx`:
  - Lasso completion with all markers visible in viewport → NO `fitBounds` call (mock `mapInstance.fitBounds`).
  - Lasso completion with marker outside viewport → exactly ONE `fitBounds` call with padding 100.
  - ESC during review → modal closed + polygon cleared.
  - Marker click in appointments mode renders `<AppointmentMapDetailPanel>` (not the old `<MapPopup>`).
  - Marker click in groups mode still renders the old popup.

## 9. End-to-end QA

- [ ] **T-4-901 [test]** Playwright happy path (OP role):
  - Open `/appointments` map. Click lasso icon.
  - Draw polygon enclosing 5 markers all visible in viewport. Assert NO zoom change.
  - Modal opens; all 5 rows UNCHECKED.
  - Check 3 rows. Footer shows `[Close] [Bulk actions (3) ▾] [Add to group] [Create group (3)]`.
  - Click "Bulk actions ▾" → Cancel → reason "test cancel" → Apply.
  - Assert "3 cancelled" toast; polygon clears; modal closes; query invalidates.
  - Click a marker → assert detail panel opens with CLIENT + PROPERTIES populated.
  - Click "Meeting location" expand → assert exactly one `GET /v1/appointments/:id`.
  - Click "MORE DETAILS" → assert new tab opened to `/appointments/:id`.
- [ ] **T-4-902 [manual]** QA matrix per role: AM, OP, CL_ADMIN, CL_USER — verify:
  - Footer button visibility per role.
  - Bulk actions dropdown items per role + state-machine validity.
  - Lasso polygon persists; no zoom-out.
  - Detail panel renders correctly (CLIENT, PROPERTIES, collapsible lazy fetch).

## 10. Regression gates (MUST stay green)

- [ ] **T-4-1001 [test]** 022 BUG-001 source-scan + `pg_typeof` integration.
- [ ] **T-4-1002 [test]** 023 RelationsTab lazy-fetch.
- [ ] **T-4-1003 [test]** 023 T-2-907 cross-form contract.
- [ ] **T-4-1004 [test]** 023 BUG-023-001 portal-token whitelist.
- [ ] **T-4-1005 [test]** 024 Constitution v1.4.0 cross-tenant visibility (CL_ADMIN sees only own-tenant in `/v1/appointments` list — derived from existing 024 work; 025 doesn't touch).
- [ ] **T-4-1006 [test]** PR #3 BulkEditModal (list page) — unchanged; existing tests pass.

## 11. Pre-PR

- [ ] **T-4-1101** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **T-4-1102** `pnpm generate:api` re-run (no-op if already done at T-4-303); `api-types.ts` committed.
- [ ] **T-4-1103** Open PR from `feat/appointments-map-ux` → `develop` with:
  - Title: `feat(appointments): map UX — lasso flow + bulk modal + marker detail panel`
  - Reference label: `feat.appointments.map_ux`
  - Body: four-issue acceptance checklist; screenshots of (a) modal with checkboxes default unchecked, (b) lasso polygon persisting on map, (c) marker detail panel with collapsibles, (d) bulk-actions dropdown.
- [ ] **T-4-1104** Notify Guia/QA channel: PR ready for cycle 1 review.
