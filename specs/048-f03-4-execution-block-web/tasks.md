# Tasks: F03-4 — Field activity, inspector-unable card, platform settings (web)

**Feature**: `048-f03-4-execution-block-web` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Scope**: `apps/web` only. Consumes merged F03-1/F03-2 contracts. TDD mandatory (constitution III). ≤ 150 changed files.

All paths are under the worktree root `/Users/pedro/Code/GitHub/properfy/.claude/worktrees/f03-4-execution-block-web`.

## Phase 1: Setup

- [ ] T001 Confirm shared packages are built to `dist/` (web resolves `@properfy/shared`/`@properfy/frontend-standards` from `dist/`): run `pnpm --filter @properfy/shared build` and `pnpm --filter @properfy/frontend-standards build`.
- [ ] T002 Read the current web files to be modified to capture their exact shape before editing: `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx`, `components/AppointmentDetailSections.tsx`, `components/AppointmentMapDetailPanel.tsx`, `components/AuditTimeline.tsx`, `components/StatusTransitionDialog.tsx`, `components/AppointmentTable.tsx`, `apps/web/src/components/shell/Sidebar.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/features/rental-tenant-portal/pages/PortalPage.tsx`; and one existing Configuration page + its hook as the pattern for the settings page (e.g. Service Types / Notification Templates), plus the typed API client wrapper and `useAppointmentDetail` hook.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T003 [P] Add `AppointmentDetail.inspectorIssue` and `AppointmentMapItem.inspectorIssue` view types (sourced from generated `api-types.ts` / `@properfy/shared` `InspectorIssue`) in `apps/web/src/features/appointments/types/index.ts` and `hooks/useAppointmentMapData.ts`; no `as any`.
- [ ] T004 [P] Create `apps/web/src/features/appointments/hooks/useAppointmentFieldActivity.ts` (React Query, `GET /v1/appointments/:id/field-activity`, key `['appointment', id, 'field-activity']`) via the existing typed client; export the row/summary types from `@properfy/shared`. (Red test in T011 drives behaviour; this task is the hook skeleton it imports.)
- [ ] T005 [P] Create `apps/web/src/features/platform-settings/hooks/usePlatformSetting.ts` generic hook (read `GET /v1/platform-settings/:key`, mutate `PUT /v1/platform-settings/:key` with `{ value }`, invalidate key + list). Skeleton consumed by T017's red tests.

## Phase 3: User Story 1 — Field activity + inspector-couldn't-complete card (P1)

**Goal**: 00.A3/03.A2 (web). Independent test: load a detail (mocked) as OP with execution + `CANT_DO`, verify rows/flags/card + map modal; load as CL, verify no coordinate in DOM.

### Tests (write first — must fail)
- [ ] T006 [P] [US1] `InspectorIssueCard.test.tsx` — null issue renders nothing; full issue renders title/reason/note/reporter + `role="status"`; no note hides Note; null name → "Reported by Inspector"; unknown reason humanized via `formatReasonCodeLabel`; `(current inspector)` only when `issue.inspectorId === currentInspectorId`. File: `apps/web/src/features/appointments/components/InspectorIssueCard.test.tsx`.
- [ ] T007 [P] [US1] `AppointmentDetailSections.test.tsx` — with `appointment.inspectorIssue` the card renders at top (below overdue alert); persists when `status 'SCHEDULED'` after re-offer. File: `apps/web/src/features/appointments/components/AppointmentDetailSections.test.tsx`.
- [ ] T008 [P] [US1] `AppointmentMapDetailPanel.test.tsx` — compact card below banner with `data-testid="map-detail-inspector-issue"` when issue present (from detail or map item), absent otherwise. (Banner humanization assertions live in T014.) File: `apps/web/src/features/appointments/components/AppointmentMapDetailPanel.test.tsx`.
- [ ] T009 [P] [US1] `AppointmentFieldActivitySection.test.tsx` — loading skeleton; error ErrorState "Couldn't load field activity" + Retry; empty "No field activity yet."; full AM/OP rows (Checked in/out, "Distance at check-in: 120 m (accuracy ±8 m)", chips Outside geofence (300 m)/Outside time window/Checked out outside geofence) and no external map link; `abandonedAt` → "Check-in abandoned" row + "Abandoned" chip; device-time note when client/server differ > 2 min; events list descending. File: `apps/web/src/features/appointments/components/AppointmentFieldActivitySection.test.tsx`.
- [ ] T010 [P] [US1] CL privacy test: `AppointmentFieldActivitySection` rendered with a CL payload (no coords) shows distance/flags and **no** coordinate in the DOM; a guard case feeding a payload that *does* carry coordinates asserts the component still renders none (fails if a coordinate value appears). Same file or a sibling `*.cl.test.tsx`.

### Implementation
- [ ] T011 [US1] Implement `InspectorIssueCard.tsx` (`full`/`compact` variants, prop `currentInspectorId`, `mdi-account-alert`, warning left border, `role="status"`) to pass T006. File: `apps/web/src/features/appointments/components/InspectorIssueCard.tsx`.
- [ ] T012 [US1] Implement `AppointmentFieldActivitySection.tsx` (consumes `useAppointmentFieldActivity`, renders summary rows/flag chips/events, loading/empty/error states; never reads any coordinate field) to pass T009/T010. File: `apps/web/src/features/appointments/components/AppointmentFieldActivitySection.tsx`.
- [ ] T013 [US1] Wire the card into `AppointmentDetailSections.tsx` (top, below overdue alert) and mount `AppointmentFieldActivitySection` in `AppointmentDetailPage.tsx` overview tab, after `AppointmentDetailSections` and before `AppointmentSatisfactionSection`; invalidate the field-activity key with the detail on transitions. Pass T007.
- [ ] T014 [US1] `AppointmentMapDetailPanel.tsx`: humanize the REJECTED banner via `formatReasonCodeLabel` and render the compact `InspectorIssueCard` (no own modal) below banner (or top when not REJECTED). Pass T008 + the banner-humanization regression (`TENANT_DECLINED` → "Tenant Declined"). Covers part of US3 banner too.

**Checkpoint**: US1 independently demoable — field activity + card visible on detail and map for AM/OP; CL sees no coordinates.

## Phase 4: User Story 2 — Platform settings page (P1)

**Goal**: 03.A2 configurable mode. Independent test: render page (mocked GET), edit + submit, verify PUT body + snackbar + validation + 403/400 + guard.

### Tests (write first)
- [ ] T015 [P] [US2] `PlatformSettingsPage.test.tsx` — loads `GET /v1/platform-settings`, shows "Field events" section + "Default" badge when `isDefault`; "Last changed by Ana Ops on 03/11/2026 10:00" when `updatedBy`; 403 → ErrorState "You don't have access to platform settings". File: `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.test.tsx`.
- [ ] T016 [P] [US2] `FieldEventsSettingsSection.test.tsx` — client validation (radius 49 → "Enter a radius between 50 and 5000 m"; tolerance 241 → "Enter 0 to 240 minutes"; reminder 721 → "Enter 0 to 720 minutes"); selecting Block shows fallback help; save → `PUT /v1/platform-settings/fieldEvents` full object + snackbar "Field event settings saved. Changes apply within a minute."; 400 with `details` → field errors + focus first; reminder field disabled when switch off; "Discard changes" restores; unsaved-changes navigation prompt. File: `apps/web/src/features/platform-settings/components/FieldEventsSettingsSection.test.tsx`.
- [ ] T017 [P] [US2] `Sidebar.roles.test.tsx` — AM and OP see "Platform Settings" under Configuration; CL_ADMIN/CL_USER/INSP do not; Dashboard-group order (X01) unchanged. File: `apps/web/src/components/shell/Sidebar.roles.test.tsx` (extend if it exists).

### Implementation
- [ ] T018 [US2] Implement `usePlatformSetting(key)` fully (read + mutation + cache invalidation + typed errors) to pass T016. File: `apps/web/src/features/platform-settings/hooks/usePlatformSetting.ts`.
- [ ] T019 [US2] Implement `FieldEventsSettingsSection.tsx` (`FormSection title="Field events"`, controls per data-model table, `fieldset/legend` radios, `aria-describedby` help/error, Save/Discard, "Changes apply within a minute.", BLOCK help copy L-F03-08). File: `apps/web/src/features/platform-settings/components/FieldEventsSettingsSection.tsx`.
- [ ] T020 [US2] Implement `PlatformSettingsPage.tsx` (`PageHeader` "Platform settings", one `FormSection` per registry key — only "Field events" now; loading/403 states). File: `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx`.
- [ ] T021 [US2] Add lazy route `platform-settings` in `apps/web/src/app/router.tsx` guarded `<AuthGuard roles={[UserRole.AM, UserRole.OP]}>`.
- [ ] T022 [US2] Append `{ icon: 'mdi-tune-vertical', label: 'Platform Settings', to: '/platform-settings' }` to the "Configuration" group in `apps/web/src/components/shell/Sidebar.tsx` (append-only; do not touch X01 Dashboard order). Pass T017.

**Checkpoint**: US2 independently demoable — AM/OP edit field-event settings; CL/INSP cannot see the menu/route.

## Phase 5: User Story 3 — INSPECTOR_UNABLE humanized + timeline labels (P2)

**Goal**: system-only code humanized everywhere, never offered manually; new audit labels/badges.

### Tests (write first)
- [ ] T023 [P] [US3] `AuditTimeline.test.tsx` — labels for `inspection.geolocation_mismatch`/`inspection.check_in_blocked`/`inspector_field_event.cant_do`/`inspector_field_event.late_notice`/`inspection.completion_reminder_sent`; "Initiated by inspector" badge when `metadata.source === TRANSITION_SOURCE_INSPECTOR_CANT_DO`; "Check-out" badge when `metadata.phase === 'FINISH'` OR `metadata.source === 'INSPECTOR_FINISH'`; no badge when `status_transition` has no source. File: `apps/web/src/features/appointments/components/AuditTimeline.test.tsx`.
- [ ] T024 [P] [US3] `StatusTransitionDialog.test.tsx` — REJECTED options exclude "Inspector Unable"; the 8 prior options remain; filter is an isolated step removing `SYSTEM_ONLY_REJECTION_CODES`. File: `apps/web/src/features/appointments/components/StatusTransitionDialog.test.tsx`.
- [ ] T025 [P] [US3] `AppointmentTable.test.tsx` — REJECTED row with `rejectionReasonCode 'INSPECTOR_UNABLE'` → "Cancellation Reason" = "Inspector Unable" with `reason` tooltip (regression; label already humanized). File: `apps/web/src/features/appointments/components/AppointmentTable.test.tsx`.

### Implementation
- [ ] T026 [US3] `AuditTimeline.tsx`: add `ACTION_LABELS`/`ACTION_STYLES` and badge logic (compare `metadata.source` against `TRANSITION_SOURCE_INSPECTOR_CANT_DO` and the `'INSPECTOR_FINISH'` literal; `metadata.phase === 'FINISH'`). Pass T023.
- [ ] T027 [US3] `StatusTransitionDialog.tsx`: import `SYSTEM_ONLY_REJECTION_CODES` and remove them from the REJECTED option list as an isolated filter step (mirroring `SYSTEM_ONLY_CANCELLATION_CODES`). Pass T024.
- [ ] T028 [US3] Confirm `AppointmentTable.tsx` humanizes `INSPECTOR_UNABLE` (regression only — adjust only if the tooltip/label is missing). Pass T025. (Map banner already handled in T014.)

**Checkpoint**: US3 — `INSPECTOR_UNABLE` humanized in table/map/timeline, never offered in the manual dialog.

## Phase 6: User Story 4 — Portal change-time gate (P2)

**Goal**: L-F03-01/D20 — no new-time picker after an inspector rejection.

### Tests (write first)
- [ ] T029 [P] [US4] `PortalPage.test.tsx` — REJECTED + `canChangeTime:false` → new banner "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time.", no "pick another available time", picker not rendered, available-groups request not fired; `canChangeTime:true` (e.g. TENANT_DECLINED) → current banner + picker (regression); `canChangeTime` absent → current behaviour; `join-group` 409 `PORTAL_APPOINTMENT_INACTIVE` → existing error + reload. File: `apps/web/src/features/rental-tenant-portal/pages/PortalPage.test.tsx`.

### Implementation
- [ ] T030 [US4] `PortalPage.tsx`: `const canChangeTime = appointment.canChangeTime ?? true;` two REJECTED banner variants; gate the picker and the available-groups query on `canChangeTime`; keep the 409 error + reload. Pass T029.

**Checkpoint**: US4 — portal hides change-time for inspector-rejected appointments.

## Phase 7: E2E + Polish & cross-cutting

- [ ] T031 [P] E2E `apps/web/tests/e2e/appointment-inspector-issue.spec.ts` — OP opens REJECTED appointment w/ `inspectorIssue` (API mocked): card on detail; map pin → card in modal; Timeline shows "Inspector Couldn't Complete".
- [ ] T032 [P] E2E `apps/web/tests/e2e/appointment-field-activity-cl.spec.ts` — CL_ADMIN detail → Field activity block with distance + flags and no coordinate on the page.
- [ ] T033 [P] E2E `apps/web/tests/e2e/platform-settings.spec.ts` — AM sets radius 250 + mode Block → save → reload → values shown.
- [ ] T034 [P] E2E `apps/web/tests/e2e/portal-inspector-unable.spec.ts` — portal REJECTED `canChangeTime:false` → new banner, no times offered.
- [ ] T035 Verify no new import into `DashboardPage`/`AnalyticsPage`/`InspectorWorkloadPage` (D11); verify compact map card opens no modal (map popup trap); verify no `as any`.
- [ ] T036 Update `apps/web/CLAUDE.md`: new `features/platform-settings/` (page/route `/platform-settings` AM/OP, `usePlatformSetting`, `FieldEventsSettingsSection`), `InspectorIssueCard`, `AppointmentFieldActivitySection`, `useAppointmentFieldActivity`, AuditTimeline labels, `StatusTransitionDialog` system-only filter, PortalPage `canChangeTime` gate, Sidebar "Platform Settings" item.
- [ ] T037 Run gates inside the worktree (via subagent, condensed summary): `pnpm --filter web typecheck && lint && test`; the four E2E specs in CI mode. Confirm `git status --porcelain` clean and `git diff --stat origin/develop... | tail -1` ≤ 150 files.

## Dependencies & order

- Phase 1 → Phase 2 → Phases 3–6 (US1→US2→US3→US4 by priority; US3 T014's banner work is done in US1 Phase 3) → Phase 7.
- Foundational T003/T004/T005 block the stories that import them.
- Within each story: tests (red) before implementation (green).
- `AppointmentMapDetailPanel.tsx` is touched once (T014) for both the compact card (US1) and banner humanization (US3) — do it in Phase 3 to avoid a second edit.

## Parallel opportunities

- T003/T004/T005 in parallel (different files).
- All `[P]` test files within a story in parallel.
- E2E specs T031–T034 in parallel.

## MVP

US1 + US2 (both P1) = the 00.A3/03.A2 contractual core. US3/US4 (P2) complete the humanization and portal correctness.
