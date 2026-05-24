# Tasks: Appointments Map UX Refinements (026)

**Feature**: `026-appointments-map-ux-refinements`
**Plan**: `./plan.md` · **Spec**: `./spec.md`
**Branch**: `feat/026-appointments-map-ux-refinements` (NEW; off `develop` AFTER 025 merges)
**Reference label**: `feat.appointments.map_ux_refinements`

## Convention

- Dependency-ordered top-to-bottom.
- `[shared]` `[backend]` `[web]` `[test]` tags.
- Branch waits for 025 merge. Do NOT branch off `feat/appointments-map-ux`.
- 022/023/024/025 regression gates MUST stay green.

---

## 0. Prerequisite

- [ ] **T-5-001** Confirm 025 merged to `develop`. Create branch `feat/026-appointments-map-ux-refinements` from latest `develop`.

## 1. Shared schemas + permissions

- [ ] **T-5-101 [shared]** Add to `packages/shared/src/schemas/service-group.ts`:
  - `addAppointmentsToGroupRequestSchema` (`{ appointmentIds: array<uuid>().min(1).max(30) }`)
  - `eligibilityCheckRequestSchema` (same shape)
  - `eligibilityCheckResponseSchema` (envelope per plan §6)
- [ ] **T-5-102 [shared]** Add `bulkReopenForRescheduleRequestSchema` to `packages/shared/src/schemas/appointment.ts`.
- [ ] **T-5-103 [shared]** Add permission keys:
  - `appointment.add_to_group`: `['AM', 'OP']`
  - `appointment.bulk_reopen_for_reschedule`: `['AM', 'OP', 'CL_ADMIN']`
  Update `role-matrix.test.ts`.

## 2. Backend — extend ReopenForRescheduleUseCase

- [ ] **T-5-201 [backend]** Extend `apps/backend/src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case.ts`:
  - Inject optional `tokenRepo: ITenantPortalTokenRepository` constructor dependency.
  - After successful reschedule + existing `appointment.rescheduled` audit emit: if `tokenRepo` provided, call `revokeAllForAppointment(appointmentId)` and emit `tenant_portal.tokens_revoked` audit.
  - Existing tests pass unchanged (no `tokenRepo` injected → no-op path).
- [ ] **T-5-202 [backend]** Wire `tokenRepo` into the production container that constructs `ReopenForRescheduleUseCase`. Verify single-item endpoint behaviour: portal tokens revoked.
- [ ] **T-5-203 [backend][test]** New unit test for the additive path: with `tokenRepo` injected, calling `execute` triggers `revokeAllForAppointment` exactly once + audit event emitted.

## 3. Backend — Add-to-group use cases

- [ ] **T-5-301 [backend]** Create `apps/backend/src/modules/service-group/application/use-cases/add-appointments-to-group.use-case.ts` per plan §1. Reuses existing `ServiceGroupValidator` (spec 005 line 244); per-item delegates to `ExecuteStatusTransitionUseCase` for DRAFT → AWAITING_INSPECTOR auto-transition.
- [ ] **T-5-302 [backend]** Create `check-appointments-eligibility-for-group.use-case.ts` per plan §2. Read-only; pure validator invocations + group-level reason aggregation.
- [ ] **T-5-303 [backend][test]** Unit tests:
  - `Add` happy path: 3 eligible → 3 added; DRAFT items auto-transitioned.
  - `Add` mixed: 2 eligible + 1 INVALID_TENANT + 1 GROUP_FULL → per-item statuses correct; only eligible were transitioned.
  - `EligibilityCheck`: per-appointment + per-group reasons aggregated correctly.

## 4. Backend — Bulk-reopen-for-reschedule

- [ ] **T-5-401 [backend]** Create `bulk-reopen-for-reschedule.use-case.ts` per plan §3. Same-group precheck → if mixed/none, return all items as `INVALID_SCOPE`. Per-item delegates to `ReopenForRescheduleUseCase` (which now includes the token revoke step from T-5-201).
- [ ] **T-5-402 [backend][test]** Unit tests:
  - Same-group happy path: 3 in same group → 3 rescheduled; portal tokens revoked.
  - Mixed-group: returns `INVALID_SCOPE` for all (no partial application).
  - Date > 30 days: per-item `INVALID_DATE_WINDOW`.

## 5. Backend — Routes

- [ ] **T-5-501 [backend]** Add to `apps/backend/src/modules/service-group/interfaces/service-group.routes.ts`:
  - `POST /v1/service-groups/:groupId/appointments` (auth `appointment.add_to_group`)
  - `POST /v1/service-groups/:groupId/eligibility-check` (auth `appointment.add_to_group`)
  Both with Fastify `schema:{body,response}`.
- [ ] **T-5-502 [backend]** Add to `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts`:
  - `POST /v1/appointments/bulk-reopen-for-reschedule` (auth `appointment.bulk_reopen_for_reschedule`)
- [ ] **T-5-503 [backend][test]** Supertest per endpoint × per role; mixed-result envelope; FORBIDDEN denial cases.
- [ ] **T-5-504 [shared]** Run `pnpm generate:api`. Commit `api-types.ts`. Verify only the three new endpoints are in the diff.

## 6. Frontend primitives

- [ ] **T-5-601 [web]** Create `apps/web/src/components/ui/ViewportAwareDropdown.tsx` per plan §1. Props: `trigger`, `children`, `placement?`. Auto-flips per viewport; closes on outside scroll/click; recomputes on resize.
- [ ] **T-5-602 [web][test]** Stub `getBoundingClientRect` to assert flip direction at top-edge / bottom-edge / left-edge of viewport.
- [ ] **T-5-603 [web]** Create `apps/web/src/components/map/MapFilterToggleButton.tsx` per plan §6. Pill style + `mdi-filter-variant` + "Filters" label. Top-left positioning.
- [ ] **T-5-604 [web]** Verify/fix `MapScreenLayout.tsx` to support overlay-style (not push) when `sidePanelOpen=false`. The current CSS (lines 14-40) uses `max-h-0 overflow-hidden md:w-0` which is push — change to `position: absolute; transform: translateX(-100%)` for closed state.

## 7. Frontend — AppointmentCodePill clickable

- [ ] **T-5-701 [web]** Extend `AppointmentCodePill.tsx` to accept optional `onClick`. When provided: `role="button"`, `aria-label="Open details for appointment {code}"`, `cursor-pointer`, `hover:bg-peach/40`, keyboard Enter/Space fires onClick.
- [ ] **T-5-702 [web][test]** Component test: onClick fires; aria-label set; keyboard navigation works.

## 8. Frontend — Hooks

- [ ] **T-5-801 [web]** Create `useAppointmentsEligibilityCheck(groupId, appointmentIds)` hook (`useQuery` against eligibility-check endpoint).
- [ ] **T-5-802 [web]** Create `useAddAppointmentsToGroup()` mutation hook.
- [ ] **T-5-803 [web]** Create `useBulkReopenForReschedule()` mutation hook.

## 9. Frontend — MapBulkActionModal refactor

- [ ] **T-5-901 [web]** Add `position?: 'top-right' | 'centered'` prop. Default: `'top-right'` on viewport ≥600px; `'centered'` on mobile. Use a `useMediaQuery` hook (create if absent — small primitive).
- [ ] **T-5-902 [web]** Position `top-right`: render without backdrop overlay, with `position: fixed; top: 16px; right: 16px; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 32px); pointer-events: auto;`. Surrounding wrapper passes pointer-events through so map remains interactive outside the modal box.
- [ ] **T-5-903 [web]** Wrap Bulk actions dropdown trigger + menu in `<ViewportAwareDropdown placement="auto">`.
- [ ] **T-5-904 [web]** Reduce dropdown items to exactly 4: Cancel · Reschedule · Send confirmation email · Change status (alphabetical). Rename "Re-send Reminder" label → "Send confirmation email" (endpoint unchanged — still hits `/v1/appointments/bulk-resend-reminder`).
- [ ] **T-5-905 [web]** Remove "Assign Inspector" from this dropdown (kept in list-page BulkEditModal — untouched).
- [ ] **T-5-906 [web]** Pass `onClick={() => openDetailPanel(row.id)}` to each row's `<AppointmentCodePill>`.
- [ ] **T-5-907 [web]** Footer reshuffle: `[Close]` left; right group: `[Bulk actions (N) ▾]` (when ≥1 checked) · `[Add to group]` · `[Create group (N)]`. Both `Add to group` and `Create group` gated by `canPerform('appointment.add_to_group')` (AM/OP) — disabled when 0 checked OR spans tenants.
- [ ] **T-5-908 [web][test]** Component tests:
  - Position top-right on ≥600px viewport; centered on smaller.
  - Dropdown has exactly 4 items per AM role; 2 per CL_ADMIN; 1 (Reschedule only) for CL_USER without flag.
  - Code pill click fires `openDetailPanel`.
  - UUID-not-rendered still green.

## 10. Frontend — MapAddToGroupSubModal

- [ ] **T-5-1001 [web]** Create `MapAddToGroupSubModal.tsx`:
  - Lists existing service groups in the active tenant set (reuse existing `useServiceGroupList` if present; verify; if absent, create as a small `useQuery` wrapper).
  - On group selection, calls `useAppointmentsEligibilityCheck(groupId, appointmentIds)` lazily to compute per-appointment eligibility.
  - Banner displays ineligible appointments with translated reasonCodes.
  - "Add" button calls `useAddAppointmentsToGroup({ groupId, appointmentIds })` with the eligible subset only.
  - Result envelope handled as per-item success/failed summary (mirrors 025 bulk modal).
- [ ] **T-5-1002 [web][test]** Component test: opens, calls eligibility-check; ineligibles shown; confirm calls add endpoint with eligible ids only.

## 11. Frontend — MapBulkRescheduleForm

- [ ] **T-5-1101 [web]** Create `MapBulkRescheduleForm.tsx` (extracted from `MapBulkActionModal` step 2):
  - Fields: `<input type="date">` + `<SelectInput>` populated from `useTimeSlotOptions(branchId, tenantId)` + optional `<Textarea>` for reason.
  - NO numeric "Slot Size" input. NO custom slot creation.
  - Submit calls `useBulkReopenForReschedule({ appointmentIds, newDate, newTimeSlot, reason })`.
- [ ] **T-5-1102 [web]** Pre-submission validation: if the checked set spans `serviceGroupId` values (or mixes grouped/non-grouped), Reschedule menu item is DISABLED with tooltip "Bulk reschedule limited to appointments within the same group in this cycle". Implementation: compute `Set<serviceGroupId | null>` from the checked items; if size > 1 OR contains `null`, disable.
- [ ] **T-5-1103 [web][test]** Component tests:
  - Dropdown options sourced from `useTimeSlotOptions` (mock the hook).
  - No numeric input rendered (DOM query asserts absence).
  - Same-group precheck: span-groups disables submit.
  - Submit posts correct body to bulk-reopen endpoint.

## 12. Frontend — AppointmentMapPage integration

- [ ] **T-5-1201 [web]** Filter panel state:
  - Initialize from `sessionStorage.getItem('appointments-map.filters.open') === 'true'`; default `false`.
  - On toggle: `sessionStorage.setItem('appointments-map.filters.open', String(next))`.
  - Pass to `<MapScreenLayout sidePanelOpen={filtersOpen}>`.
- [ ] **T-5-1202 [web]** Render `<MapFilterToggleButton open={filtersOpen} onToggle={...} />` over the map (top-left).
- [ ] **T-5-1203 [web]** Add close `×` button inside the filter panel header (calls same toggle).
- [ ] **T-5-1204 [web][test]** Page tests:
  - First load: panel CLOSED + Filters button visible.
  - Click Filters → panel opens; sessionStorage written `'true'`.
  - Reload with sessionStorage `'true'` → panel opens on mount.
  - Click `×` in panel → panel closes; sessionStorage `'false'`.

## 13. End-to-end QA

- [ ] **T-5-1301 [test]** Playwright happy path (OP):
  - Open `/appointments` map. Filter panel CLOSED + Filters button at top-left.
  - Click Filters → panel slides in overlay.
  - Click lasso, draw polygon over 5 markers → modal opens at TOP-RIGHT.
  - Click code pill of row #2 → AppointmentMapDetailPanel opens; modal stays open.
  - Check 3 rows. Open Bulk actions ▾ → exactly 4 items visible.
  - Click Reschedule → form has date + dropdown (NO numeric input).
  - Select valid date + slot + reason → Apply → 3 rescheduled toast.
  - Re-draw lasso over 5 mixed-status markers. Check all 5. Click "Add to group" → sub-modal opens.
  - Banner shows "2 not eligible". Click "Add 3 eligible" → success summary.
- [ ] **T-5-1302 [manual]** QA matrix per role: AM, OP, CL_ADMIN, CL_USER — verify dropdown items + Add to group visibility + Reschedule form gating.

## 14. Regression gates (MUST stay green)

- [ ] **T-5-1401 [test]** 022 BUG-001 source-scan + `pg_typeof` integration.
- [ ] **T-5-1402 [test]** 023 RelationsTab lazy-fetch + T-2-907 cross-form contract + BUG-023-001.
- [ ] **T-5-1403 [test]** 024 Constitution v1.4.0 cross-tenant visibility.
- [ ] **T-5-1404 [test]** 025 default-UNCHECKED + polygon persistence + lazy-fetch detail panel + no raw UUIDs.

## 15. Pre-PR

- [ ] **T-5-1501** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **T-5-1502** `pnpm generate:api` no-op (already done at T-5-504); api-types.ts committed.
- [ ] **T-5-1503** Open PR `feat/026-appointments-map-ux-refinements` → `develop`:
  - Title: `feat(appointments): map UX refinements — viewport-aware dropdown · top-right modal · Add to group · Reschedule refactor · code pill click · filter collapse`
  - Reference label: `feat.appointments.map_ux_refinements`
  - Body: 7-item acceptance checklist; Regras-validation note for items 3 + 5; 4 screenshots (top-right modal, Add to group sub-modal, Reschedule with dropdown, filter toggle).
- [ ] **T-5-1504** Notify Guia/QA: PR ready for cycle 1 review.
