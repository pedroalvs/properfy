# Tasks: Portal Inquilino — Redesign Completo

**Input**: `docs/superpowers/specs/2026-05-24-portal-inquilino-redesign.md` (v2.1, APPROVED) + `docs/superpowers/plans/2026-05-24-portal-inquilino-redesign.md`
**Prerequisites**: plan.md (this directory), spec v2.1
**Branch**: `patch/portal-inquilino`

**Tests**: Mandatory per Properfy constitution §III (TDD NON-NEGOTIABLE). Every domain/application/component task has its test pair.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies).
- **[Story]**: Which user story this task belongs to (US1..US5).
- All paths absolute under repo root.

## User Stories (mapped from spec §12 SCs)

- **US1 — Unified Form (Yes/No/Observation)**: MVP. Tenant opens portal, sees unified form, confirms or declines with availability. Maps SC-01, SC-02, SC-03.
- **US2 — Change Time (join-group)**: Tenant joins a nearby ACCEPTED group via "Change time". Maps SC-04, SC-05, SC-06, SC-08, SC-11, SC-16.
- **US3 — Propose New Date (preserved)**: Tenant uses the existing reschedule flow as a secondary CTA. Maps SC-07.
- **US4 — Web Admin Activity History**: Admin sees portal activity timeline on appointment detail. Maps SC-12.
- **US5 — Web Admin tenantNote in Bulk Actions**: tenantNote surfaced in map view. Maps SC-10.
- **Cross-cutting**: SC-09 (availableSlotsJson in portal-activities), SC-13 (existing tests stay green), SC-14 (mobile responsive), SC-15 (timezone format).

---

## Phase 1: Setup (Shared infrastructure)

**Purpose**: Shared schemas, types, and enum additions that all stories depend on.

- [ ] **T001** [P] Add `availableSlotsJson` to `portalRestrictionsSchema` in `packages/shared/src/schemas/tenant-portal.ts` — Zod array of `{dayOfWeek: enum MON..SUN, start: regex HH:mm, end: regex HH:mm}`, optional and nullable. Cross-field validation `start < end`.
- [ ] **T002** [P] Add `joinGroupRequestSchema` (input: groupId uuid, optional tenantNote ≤2000 chars) and `availableGroupsResponseSchema` (output: groups array per plan §6.2.1) to `packages/shared/src/schemas/tenant-portal.ts`.
- [ ] **T003** [P] Add `TenantPortalAction.GROUP_JOIN = 'GROUP_JOIN'` to `packages/shared/src/enums/misc.ts` and update length assertion 5 → 6 in `packages/shared/src/enums/misc.test.ts`.
- [ ] **T004** [P] Add TypeScript types `AvailableSlot` and `AvailableGroup` to `packages/shared/src/types/tenant-portal.ts` (or wherever portal types live) — exported so both web and backend can import.
- [ ] **T005** Write Zod schema test in `packages/shared/src/schemas/tenant-portal.test.ts`: valid `availableSlotsJson`, invalid time format, invalid day enum, `start ≥ end` rejected.

**Checkpoint**: shared types/schemas ready; backend and frontend can import them.

---

## Phase 2: Foundational (Database + domain layer)

**Purpose**: Prisma migration and domain errors — must complete before any use-case work.

- [ ] **T006** Add `available_slots_json Json?` column to `AppointmentRestriction` model in `apps/backend/prisma/schema.prisma`.
- [ ] **T007** Add `GROUP_JOIN` to `TenantPortalAction` enum in `apps/backend/prisma/schema.prisma`.
- [ ] **T008** Generate Prisma migration: `pnpm --filter backend prisma migrate dev --name portal_join_group_and_available_slots --create-only`; verify SQL is additive only (no DROP, no ALTER TYPE without USING).
- [ ] **T009** Run `pnpm --filter backend prisma generate` and confirm `@prisma/client` exports the new column type and enum value.
- [ ] **T010** [P] Add domain error classes to `apps/backend/src/modules/tenant-portal/domain/tenant-portal.errors.ts`:
  - `PortalGroupNotFoundError extends NotFoundError` with code `PORTAL_GROUP_NOT_FOUND` (404)
  - `PortalGroupFullError extends ConflictError` with code `PORTAL_GROUP_FULL` (409)
  - `PortalGroupUnavailableError extends ConflictError` with code `PORTAL_GROUP_UNAVAILABLE` (409)
- [ ] **T011** [P] Phase 0 spike R1 — confirm PostGIS extension is enabled on the dev database (`SELECT extname FROM pg_extension WHERE extname = 'postgis'`). If absent, document Haversine fallback before T015.
- ~~**T012**~~ — REMOVED (round 2/3): premise was a hallucinated `inspector_assignments` table; grep confirmed it does not exist. Inspector linkage is via `appointment.assigned_inspector_id` direct FK. See revised T044.
- [ ] **T013** [P] (revised after Planejador round 1/3) Extend `GetPortalDataUseCase` to add a `tenant: { name, timezone }` block to the response. Read `tenants.name` + `tenants.timezone` (existing columns). Update the shared Zod schema (`packages/shared/src/schemas/tenant-portal.ts`) and the frontend type (`apps/web/src/features/tenant-portal/types/index.ts`). Update `get-portal-data.use-case.test.ts` to assert the new block is present.
- [ ] **T014** (NEW after Planejador round 1/3) Drop the "PROPERTY MANAGER" row from the unified form details grid: there is no source field in `Tenant` for it; the fallback to `agency.name` would render the same value twice. Update spec §3.1 acknowledgement and `InspectionConfirmationForm` to render only `AGENCY / CODE / NAME` rows (3-row layout; the 2×2 grid becomes 2 columns × 2 rows with AGENCY spanning, or 2 columns × 2 rows with cells AGENCY|CODE on row 1 and NAME on row 2 — UI choice during T024).

**Checkpoint**: Schema changes applied, domain errors ready, spike findings documented. User stories can begin.

---

## Phase 3: US1 — Unified Form (P1, MVP)

**Goal**: Tenant opens portal → sees unified `InspectionConfirmationForm` with logo, date pill, details grid, Yes/No toggle, observation, and submit gating.

**Independent Test**: Open portal with token A. See unified form with no separate ConfirmSection / UnavailableSection / RescheduleForm cards. Toggle Yes → Submit enabled with empty observation → POST /confirm fires → success card replaces form. Toggle No → amber banner + observation required + WeeklyAvailabilityPicker required → Submit gated.

- [ ] **T020** [US1] Extend `apps/backend/src/modules/tenant-portal/application/use-cases/report-unavailability.use-case.ts`: when `restrictions.availableSlotsJson` is present, include it in `new_values_json` of the `UNAVAILABLE_REPORTED` activity row (M6 from spec v2.1). Side effect: append `availableSlotsJson` to the activity new_values payload but do NOT change the existing tenantConfirmationStatus snapshot.
- [ ] **T021** [US1] Extend `report-unavailability.use-case.test.ts`: assert activity row's `newValuesJson` contains the slots when restrictions are present.
- [ ] **T022** [US1] [P] Build `apps/web/src/features/tenant-portal/components/WeeklyAvailabilityPicker.tsx` — 7 day chips, toggle adds time-range row, 30-min increment selects, defaults 09:00-17:00, MON..SUN order. Props: `value: AvailableSlot[]`, `onChange`, `disabled?`. Mobile responsive per spec §4.3.
- [ ] **T023** [US1] [P] Test `WeeklyAvailabilityPicker.test.tsx`: chip toggle adds/removes row, default times applied, `start < end` validation, callback fires with full state.
- [ ] **T024** [US1] Build `apps/web/src/features/tenant-portal/components/InspectionConfirmationForm.tsx` — the unified form. Yes/No toggle, observation textarea, amber banner on No, conditional `WeeklyAvailabilityPicker`, submit gating per spec §3.2 table, success state replacement.
- [ ] **T025** [US1] Test `InspectionConfirmationForm.test.tsx` — full §3.2 submit enable rules table, amber banner appears on No only, picker visible on No only, Yes submit fires `useConfirm`, No submit fires `useReportUnavailability` with `availableSlotsJson` + `tenantNote`.
- [ ] **T026** [US1] Rewrite `apps/web/src/features/tenant-portal/pages/PortalPage.tsx` — replace section cards with `InspectionConfirmationForm`, wire `usePortalData`, keep error views (Expired/Invalid/Cancelled), use tenant timezone for date pill format `DD/MM/YYYY hh:mm A` (spec §3.1, SC-15).
- [ ] **T027** [US1] Remove `ConfirmSection.tsx`, `ConfirmSection.test.tsx`, `UnavailableSection.tsx`, `UnavailableSection.test.tsx` — content collapsed into `InspectionConfirmationForm`. **Do NOT remove** `ResponseConfirmationCard.tsx` (reused as the success card).
- [ ] **T028** [US1] [P] Minor restyle of `RescheduleForm.tsx` to match new design tokens (no logic change). Keep all 007 US4 behaviour intact.
- [ ] **T029** [US1] Playwright E2E `apps/web/e2e/portal-yes.spec.ts` — token open, Yes click, observation optional, submit, success card visible.
- [ ] **T030** [US1] Playwright E2E `apps/web/e2e/portal-no.spec.ts` — token open, No click, fill observation, pick 2 days in WeeklyAvailabilityPicker, submit, success card visible, server received `availableSlotsJson`.

**Checkpoint**: US1 delivered. Tenants can confirm or report unavailability via the unified form. Mobile responsive verified at viewport 320/480/768.

---

## Phase 4: US2 — Change Time (P1)

**Goal**: Tenant clicks "Change time" → sees list of nearby ACCEPTED groups → selects one → confirms → appointment joined into the new group with full side-effects.

**Independent Test**: Token open on appointment A in tenant T, suburb S. Seed 3 ACCEPTED service groups in tenant T with assigned inspectors, each with at least one property within 2 km of A.property. Click "Change time" → list renders 3 groups. Select group G2. Submit. Verify: appointment A's `scheduledDate`/`timeSlot`/`assignedInspectorId` match G2; status = SCHEDULED via state-machine 006; `tenantConfirmationStatus` = CONFIRMED; token `used_at` set; `tenant_portal_activities` has GROUP_JOIN row; `audit_logs` has `tenant_portal.group_joined` with `actorType = ANONYMOUS`; G2's `confirmed_count` incremented by 1; if A was previously in another group, that group's `confirmed_count` decremented by 1 and notification fired.

- [ ] **T040** [US2] Add `findPortalEligibleGroups` query to `apps/backend/src/modules/service-group/infrastructure/prisma-service-group.repository.ts` — accepts `{ tenantId, serviceTypeId, propertyGeoPoint, dateMin }`; returns groups with `status = 'ACCEPTED'`, `confirmed_count < 10`, `scheduled_date >= dateMin`, with at least one linked appointment property within 2 km via PostGIS `ST_DWithin(geo_point::geography, $1::geography, 2000)` (or Haversine fallback per T011).
- [ ] **T041** [US2] Test query in `prisma-service-group.repository.test.ts` (integration with Testcontainers): seed 5 groups (3 eligible, 2 disqualified for status/count/distance), assert query returns the 3 eligible.
- [ ] **T042** [US2] Build `apps/backend/src/modules/tenant-portal/application/use-cases/get-available-groups.use-case.ts`. Inputs: tokenId, appointmentId, isReadOnly. Returns `{ groups: [] }` if read-only; otherwise loads appointment + property, calls repo query, maps to portal response shape (id, scheduledDate, timeWindow, suburb, inspectorName, confirmedCount, capacityMax=10). RBAC not applicable (portal token).
- [ ] **T043** [US2] Test `get-available-groups.use-case.test.ts`: happy path, read-only returns empty, no eligible groups returns empty (no error), filters applied correctly.
- [ ] **T044** [US2] Build `apps/backend/src/modules/tenant-portal/application/use-cases/join-group.use-case.ts` — orchestrate the 13-step side-effect sequence from spec §5.2: validate token, validate cutoff, lock + validate group, **detach from previous group with confirmed_count decrement + audit + previous-inspector notification (spec §5.2 step 4)**, inherit fields (set `appointment.scheduled_date`, `appointment.time_slot`, **`appointment.assigned_inspector_id`** to match the group — direct column update via `IAppointmentRepository.update(...)`; **no separate `inspector_assignments` table involved** per R2 correction), transition status via `ExecuteStatusTransitionUseCase` with SYS actor, link to new group, bump new `confirmed_count`, set `tenantConfirmationStatus = CONFIRMED`, set `tenantNote`, write activity + audit, mark token used, fire-and-forget notifications.
- [ ] **T045** [US2] Test `join-group.use-case.test.ts` — comprehensive: happy path (full side-effects asserted), cutoff (PORTAL_ACTION_BLOCKED), token already used (PORTAL_TOKEN_ALREADY_USED), inactive appointment (PORTAL_APPOINTMENT_INACTIVE), group not found (PORTAL_GROUP_NOT_FOUND), group full race (PORTAL_GROUP_FULL), group cancelled mid-request (PORTAL_GROUP_UNAVAILABLE), previous-group detach side-effects (confirmed_count decrement + notification).
- [ ] **T046** [US2] Add `GET /v1/tenant-portal/:token/available-groups` route to `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts` — uses portal-token middleware, calls `GetAvailableGroupsUseCase`, responds with `availableGroupsResponseSchema`-shaped payload.
- [ ] **T047** [US2] Add `POST /v1/tenant-portal/:token/join-group` route — uses portal-token middleware, validates body via `joinGroupRequestSchema`, calls `JoinGroupUseCase`, maps domain errors to envelope codes.
- [ ] **T048** [US2] Integration test in `tenant-portal.routes.test.ts` — both new endpoints: GET happy path + empty, POST happy path with side-effect assertions, POST race conditions, POST cutoff.
- [ ] **T049** [US2] [P] Add `useAvailableGroups` and `useJoinGroup` hooks to `apps/web/src/features/tenant-portal/hooks/usePortalData.ts` (or a new file `useChangeTime.ts` if the file is becoming large). Use TanStack Query patterns matching existing portal hooks.
- [ ] **T050** [US2] Extend `apps/web/src/features/tenant-portal/types/index.ts` with `AvailableSlot`, `AvailableGroup` re-exports from shared (no duplication).
- [ ] **T051** [US2] Build `apps/web/src/features/tenant-portal/components/AvailableGroupsList.tsx` — skeleton state (3 placeholder rows on `isLoading`), empty state (spec §5.1 fallback message), error state (retry button), list rendering with selectable rows, selection state, mobile responsive.
- [ ] **T052** [US2] Test `AvailableGroupsList.test.tsx` — skeleton on loading, empty message on `groups: []`, error state with retry callback, list renders, selection callback fires.
- [ ] **T053** [US2] Extend `InspectionConfirmationForm` (or PortalPage) with the "Change time" CTA below the date pill (primary CTA — spec §3.1, §3.5). On click: hide date pill, render `AvailableGroupsList` inline, render "← Back" link to cancel without token consumption (spec §3.5 cancel/back).
- [ ] **T054** [US2] Wire submit handler for "Confirm time change" — calls `useJoinGroup.mutateAsync({ groupId, tenantNote })`. On success: replace form with success card "Inspection rescheduled with inspector {Name} for {date} {window}". On error: render inline error per spec §3.5 error UX, refresh list on PORTAL_GROUP_FULL/PORTAL_GROUP_UNAVAILABLE.
- [ ] **T055** [US2] Playwright E2E `apps/web/e2e/portal-change-time-happy.spec.ts` — full happy path: open, click Change time, list renders, select group, Submit, success card, server side-effects asserted via API call.
- [ ] **T056** [US2] Playwright E2E `apps/web/e2e/portal-change-time-cancel.spec.ts` — open, Change time, click ← Back, date pill restored, token preserved (verify by re-confirming with Yes).
- [ ] **T057** [US2] Playwright E2E `apps/web/e2e/portal-change-time-empty.spec.ts` — open with no nearby groups, click Change time, see "no available times nearby — use Propose new date or contact your agency" message.

**Checkpoint**: US2 delivered. Tenants can join nearby groups. Race conditions handled. Mobile responsive.

---

## Phase 5: US3 — Propose New Date (P2, preserved)

**Goal**: Tenant clicks "Propose new date" → existing `RescheduleForm.tsx` opens → 007 US4 flow runs unchanged.

**Independent Test**: Open portal. Click "Propose new date". RescheduleForm appears with date picker. Pick a date within 30 days. Submit. Verify 007 US4 acceptance scenarios still pass (scheduledDate updated, tokens revoked, audit + activity written).

- [ ] **T060** [US3] Add "Propose new date" secondary CTA in `InspectionConfirmationForm` / `PortalPage` (spec §3.1) — text link below "Change time". Click expands existing `RescheduleForm.tsx` (no rewrite).
- [ ] **T061** [US3] Verify all existing 007 US4 acceptance scenarios still pass (re-run existing portal integration tests — should be no-op if T028 only restyled).
- [ ] **T062** [US3] Playwright E2E `apps/web/e2e/portal-propose-new-date.spec.ts` — click Propose new date, pick valid date, submit, success card.

**Checkpoint**: US3 delivered with zero regression to 007 US4.

---

## Phase 6: US4 — Extend existing Admin Activity Tab (P2, revised after Planejador round 1/3)

**Goal**: The admin `AppointmentPortalActivityTab` already exists and is integrated into `AppointmentDetailPage` via the `portal-activity` tab. **Extend it** to support `GROUP_JOIN` and render `new_values_json` summaries — do NOT create a parallel component.

**Independent Test**: Seed an appointment with one row of each action type including a `GROUP_JOIN`. Open admin appointment detail → switch to Portal Activity tab → see all rows with appropriate icon/color + data summary (tenantNote for CONFIRMED, availableSlotsJson summary for UNAVAILABLE_REPORTED, new date+window+inspector for GROUP_JOIN).

- [ ] **T070** [US4] Extend `apps/web/src/features/appointments/components/AppointmentPortalActivityTab.tsx`:
  - Add `GROUP_JOIN` to `ACTION_COLORS` map: `{ bg: '#B2DFDB', text: '#00695C', icon: 'mdi-calendar-arrow-right' }` (or final designer-approved values).
  - Below the action label + timestamp row, render a data summary line built from `activity.newValuesJson` per action type:
    - `CONFIRMED` → `tenantNote` (if present).
    - `RESCHEDULED` → `"New date: ${newScheduledDate} ${newTimeSlot}"` + tenantNote.
    - `UNAVAILABLE_REPORTED` → `"Available: ${formatAvailableSlots(availableSlotsJson)}"` + tenantNote.
    - `CONTACT_UPDATED` → list of changed fields.
    - `GROUP_JOIN` → `"Joined group ${groupId.slice(0,8)} — ${newScheduledDate} ${newTimeWindow} with ${inspectorName}"` + tenantNote.
- [ ] **T071** [US4] Update `apps/web/src/features/appointments/components/AppointmentPortalActivityTab.test.tsx`:
  - New test cases: GROUP_JOIN row renders icon + group summary; UNAVAILABLE_REPORTED row renders availableSlotsJson summary line; tenantNote rendered on CONFIRM/RESCHEDULE.
  - Ensure existing tests still pass (skeleton, error, empty, basic action label rendering).
- [ ] **T072** [US4] (NO new component, NO new hook, NO new page integration — already done.) Verify `usePortalActivities` hook returns the `newValuesJson` field; if not, extend it to surface that field for the tab to consume.

**Checkpoint**: US4 delivered as an extension of the existing tab. Admin sees all portal activity with data summaries in the existing Portal Activity tab. RBAC unchanged (AM/OP only via `isPrivileged` gate).

---

## Phase 7: US5 — tenantNote in Bulk Actions (P3, frontend-only)

**Goal**: Admin map view bulk-actions side panel shows the `tenantNote` field for the selected appointment when non-empty.

**Independent Test**: Seed an appointment with `tenantNote = "Construction next door — please call before arrival"`. Open admin map. Select the appointment. Bulk-actions panel shows a read-only "Tenant note" row with the text.

- [ ] **T080** [US5] Locate the bulk-actions panel component (architect to find; likely under `apps/web/src/features/appointments/components/`).
- [ ] **T081** [US5] Add a read-only row "Tenant note" to the panel — render when `appointment.tenantNote` is non-null and non-empty. Style: same as other read-only rows.
- [ ] **T082** [US5] Update component test if applicable (tenantNote row presence/absence).

**Checkpoint**: US5 delivered. Operators see tenant notes at-a-glance from the map.

---

## Phase 8: Polish & Verification

**Purpose**: Run all gates and ensure the merge is clean.

- [ ] **T090** Run `pnpm typecheck` across all workspaces — zero errors.
- [ ] **T091** Run `pnpm lint` across all workspaces — zero errors.
- [ ] **T092** Run `pnpm test` — all unit + integration tests pass, including the 175 existing portal unit tests + 8 integration tests (SC-13).
- [ ] **T093** Run `pnpm --filter backend prisma migrate diff --from-empty --to-schema-datamodel apps/backend/prisma/schema.prisma | grep -E '(DROP|ALTER TYPE)' && exit 1 || exit 0` — verify migration is additive only.
- [ ] **T094** [P] Run Playwright suite — all E2E green, including the new 320 px viewport assertion spec (added after Planejador round 1/3).
- [ ] **T095** [P] Manual smoke test at viewport 320/480/768 px in addition to the Playwright assertion (mobile responsive — SC-14).
- [ ] **T096** [P] Manual smoke test of tenant timezone rendering (SC-15) — appoint a tenant with timezone `Australia/Brisbane` vs `Australia/Sydney`, verify date pill formats correctly.
- [ ] **T097** Update `apps/backend/CLAUDE.md` if new conventions are introduced (e.g. portal-specific use-case bypass of `canAddToGroup`). Note FR-072 amendment for join-group.
- [ ] **T098** Update `apps/web/CLAUDE.md` if new portal patterns are introduced (`InspectionConfirmationForm` as the single portal entry).
- [ ] **T099** Commit with Conventional Commits: e.g. `feat(portal): unified form + join-group flow + admin activity history`. NO Claude/AI references.

**Checkpoint**: All gates pass. Ready for PR review.

---

## Dependency Graph (compact)

```
T001..T005 (shared)        ─┐
T006..T009 (Prisma)        ─┼─→ all use-cases & frontend
T010 (errors)              ─┘
T011 (PostGIS spike)       ─→ informs T040 (radius query)
T013 (payload extend)      ─→ informs T026 (date pill + details grid)
T014 (drop PM row)         ─→ informs T024 (form layout)

US1 (T020..T030)           ─→ depends on T001, T003, T004, T009, T013, T014
US2 (T040..T057)           ─→ depends on T001..T011, T013, US1 partial (T026 page shell)
US3 (T060..T062)           ─→ depends on US1 (T028 restyle)
US4 (T070..T072)           ─→ depends on T003 (enum value visible in shared)
US5 (T080..T082)           ─→ independent (existing tenantNote field)

T090..T099 (polish)        ─→ depends on US1..US5
```

## Parallelisation Hints

- **Phase 1 [P]**: T001, T002, T003, T004 can run in 4 parallel branches (different files in `packages/shared/`).
- **Phase 2 [P]**: T010 (errors), T011 (PostGIS spike), T013 (payload extend), T014 (drop PM row) are independent — can run in parallel.
- **Phase 3 [P]**: T022/T023 (Picker) parallel to T028 (RescheduleForm restyle).
- **Phase 8 [P]**: T094, T095, T096 (E2E + manual smoke) parallel.

---

## Total Task Count

- Setup: 5 (T001..T005)
- Foundational: 8 (T006..T011, T013, T014) — T012 removed
- US1: 11 (T020..T030)
- US2: 18 (T040..T057)
- US3: 3 (T060..T062)
- US4: 3 (T070..T072) — revised: was 5; now extension of existing tab
- US5: 3 (T080..T082)
- Polish: 10 (T090..T099)

**Total: 61 tasks** (revised after Planejador rounds 1/3 + 2/3 — net -2 vs initial 63: T012 removed, US4 dropped 2 tasks (T073, T074), Foundational added 1 (T014)).

Estimated LOC delta: **+2.0k to +2.4k including tests** (revised after Planejador round 1/3 — earlier 1.5k–2k estimate was optimistic given the payload expansion in R5/R6 and the new 320 px Playwright spec).

---

## Out of scope (deferred — spec §13)

- Configurability of the 2 km radius per tenant/region.
- Configurability of the portal cap of 10 confirmed.
- Inspector-side veto UI (only fire-and-forget notification for now).
- Free-text "reason for time change" surfaced separately from `tenantNote`.
