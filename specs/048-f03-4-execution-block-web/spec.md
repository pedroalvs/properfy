# Feature Specification: F03-4 — Field activity, inspector-unable card, platform settings (web)

**Feature Branch**: `048-f03-4-execution-block-web`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F03-4 (`fase2-etapa1/tarefas/F03-tarefas.md`). Web-only consumer of the F03-1 and F03-2 contracts. Contract codes: 00.7, 00.8, 03.1, 03.2, 03.3; acceptance 00.A3 (web) and 03.A2 (web).

## Context & Scope

This is the **web** slice of Properfy Phase 2 feature F03 (field events). It is a pure **consumer** of contracts already merged on `develop`:

- **F03-1** (`PlatformSetting` registry + `GET/PUT /v1/platform-settings[/:key]`, the `fieldEvents` key, execution flags, audit coordinate masking).
- **F03-2** (`InspectorFieldEvent`, `GET /v1/appointments/:id/field-activity`, `inspectorIssue` on appointment responses, `RejectionReasonCode.INSPECTOR_UNABLE`, `SYSTEM_ONLY_REJECTION_CODES`, `TRANSITION_SOURCE_INSPECTOR_CANT_DO`, `isPortalChangeTimeBlocked`, `portalDataResponseSchema.appointment.canChangeTime`).

**No new backend route, Prisma model, or hand-written `api-types.ts` entry is created.** The web reads the generated typed client only. There is no change to the backend or to `packages/shared` schemas; if a response field is missing, the fix belongs to F03-2, not here.

**Multi-tenant exception note (CLAUDE.md §7.1):** `PlatformSetting` is platform-scoped and has **no `tenant_id`** (the inspector is cross-tenant; precedents: `Inspector`, global `ServiceRegion`, `IntegrationSetting`). `InspectorFieldEvent` **does** carry `tenant_id` (the appointment's). This task only reads these through RBAC-guarded endpoints; it adds no query, so the exception is owned by F03-1/F03-2 and is restated here for traceability.

**Privacy rule (CLAUDE.md §7.9, D10):** `CL_ADMIN`/`CL_USER` must never see raw inspector latitude/longitude — not in the UI, not in the DOM. The web shows only derived values (distance, accuracy, flags). A test MUST fail if a coordinate value appears in a CL-rendered DOM.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator reviews what happened in the field (Priority: P1)

An operator (AM/OP) or an agency user (CL_ADMIN/CL_USER) opens an appointment detail and sees a **Field activity** block: when the inspector checked in and out, the distance and GPS accuracy at each point, and any flags (outside geofence, outside time window, checked-out outside geofence, abandoned), plus the list of field events (can't-do / running-late). When the inspector reported they could not complete the job, a prominent **"Inspector couldn't complete"** card shows the reason, note, inspector and time — on both the detail and the map modal.

**Why this priority**: This is acceptance 00.A3 (web) and 03.A2 (web) — the core contractual deliverable of the task: field events and the geofence flag must be visible in the web detail, with the configurable mode. Without it the feature is not demonstrable.

**Independent Test**: Load an appointment detail (mocked API) as OP with a completed execution and a `CANT_DO` event; verify the field-activity rows, flag chips, and the inspector-unable card render; open the map modal and verify the compact card. Load the same as CL_ADMIN and verify no coordinate value appears in the DOM.

**Acceptance Scenarios**:

1. **Given** an appointment with a completed execution (checked in 120 m away, ±8 m accuracy, checked out), **When** an OP opens the detail, **Then** the Field activity block shows "Checked in", "Checked out", "Distance at check-in: 120 m (accuracy ±8 m)", "Distance at check-out", and no external map link.
2. **Given** an execution with `outOfRadius`, `outOfWindow` and `finishOutOfRadius` set, **When** the block renders, **Then** chips "Outside geofence (300 m)", "Outside time window" and "Checked out outside geofence" appear.
3. **Given** the same appointment opened by a CL_ADMIN (payload carries no coordinates), **When** the block renders, **Then** the distance and flags still show and no latitude/longitude value is present anywhere in the DOM.
4. **Given** an appointment whose last `CANT_DO` event exists, **When** OP opens the detail and the map modal, **Then** the "Inspector couldn't complete" card shows "Reason: {humanized}", "Note: {note}" (when present), and "Reported by {inspectorName ?? 'Inspector'} on {dd/MM/yyyy HH:mm}"; the card persists after the appointment is re-offered.
5. **Given** the `CANT_DO` event was reported by the appointment's current inspector (`issue.inspectorId === appointment.inspectorId`), **When** the card renders, **Then** it shows "Reported by {name} (current inspector) on …"; otherwise no suffix.
6. **Given** an appointment with no execution and no events, **When** the block renders, **Then** it shows "No field activity yet." and no inspector-unable card.
7. **Given** a rejection-after-check-in (execution has `abandonedAt`), **When** the block renders, **Then** it shows a "Check-in abandoned: {dd/MM/yyyy HH:mm}" row and an "Abandoned" chip.

---

### User Story 2 - AM/OP configures field-event behaviour (Priority: P1)

An AM or OP opens a new **Platform settings** page (under the "Configuration" menu group) and edits the **Field events** section: geofence radius, geofence mode (Flag / Block), check-in time-window tolerance, and the completion-reminder switch + minutes. Saving writes through `PUT /v1/platform-settings/fieldEvents`. The page is extensible: future features add one `FormSection` per registry key.

**Why this priority**: 03.A2 requires the SINALIZAR/BLOQUEAR (Flag/Block) mode to be configurable by AM/OP. The page is the "screen" costed in the plan and the shared host for every future platform-setting section.

**Independent Test**: Render the page with a mocked `GET /v1/platform-settings`; edit the radius and mode; submit; verify the `PUT` body is the complete `fieldEvents` object and the success snackbar appears. Verify client validation messages and the 403/400 handling. Verify a CL/INSP never sees the menu item (route-guarded).

**Acceptance Scenarios**:

1. **Given** `GET /v1/platform-settings` returns `fieldEvents` at defaults with `isDefault: true`, **When** an AM opens the page, **Then** the "Field events" section shows the values and a "Default" badge.
2. **Given** the setting has an `updatedBy`, **When** the page loads, **Then** it shows "Last changed by {name} on {dd/MM/yyyy HH:mm}".
3. **Given** the radius field, **When** the user enters 49, **Then** an inline error "Enter a radius between 50 and 5000 m" shows and Save is disabled; tolerance 241 → "Enter 0 to 240 minutes"; reminder 721 → "Enter 0 to 720 minutes".
4. **Given** the mode radios, **When** the user selects "Block", **Then** the fallback help text (no per-job override; BLOCK presumes correctly geocoded properties) is shown.
5. **Given** valid edits, **When** the user saves, **Then** `PUT /v1/platform-settings/fieldEvents` is sent with the complete object and a snackbar "Field event settings saved. Changes apply within a minute." appears.
6. **Given** the server returns 400 with `details`, **When** saving, **Then** field errors are shown and focus moves to the first errored field; a 403 shows `ErrorState` "You don't have access to platform settings".
7. **Given** unsaved edits, **When** the user clicks "Discard changes", **Then** the loaded values are restored; navigating away with unsaved changes prompts for confirmation.

---

### User Story 3 - INSPECTOR_UNABLE is humanized and never offered to humans (Priority: P2)

Everywhere the web lists or labels reason codes, the system-only `INSPECTOR_UNABLE` code appears **humanized** ("Inspector Unable") when it comes from the system, and is **never offered** as a manual option in the status-transition dialog.

**Why this priority**: Part of 00.7 web; prevents an operator from manually applying a system-only code and keeps the audit/table/map/export readable.

**Independent Test**: Render `StatusTransitionDialog` for REJECTED and verify "Inspector Unable" is absent while the 8 prior options remain; render `AppointmentTable` and the map banner with `INSPECTOR_UNABLE` and verify the humanized label.

**Acceptance Scenarios**:

1. **Given** the status-transition dialog opened for a REJECTED transition, **When** the options render, **Then** `SYSTEM_ONLY_REJECTION_CODES` (incl. `INSPECTOR_UNABLE`) are filtered out and the remaining options are unchanged.
2. **Given** a REJECTED row with `rejectionReasonCode === 'INSPECTOR_UNABLE'`, **When** the table renders, **Then** the "Cancellation Reason" column shows "Inspector Unable" with the `reason` tooltip.
3. **Given** the map detail panel for that appointment, **When** the REJECTED banner renders, **Then** it shows "Inspector Unable" (humanized via `formatReasonCodeLabel`), not the raw code; regression: `TENANT_DECLINED` → "Tenant Declined".
4. **Given** the AuditTimeline, **When** it renders field-event and geofence audit actions, **Then** `inspection.geolocation_mismatch` → "Location Mismatch", `inspection.check_in_blocked` → "Check-in Blocked (Outside Geofence)", `inspector_field_event.cant_do` → "Inspector Couldn't Complete", `inspector_field_event.late_notice` → "Inspector Running Late", `inspection.completion_reminder_sent` → "Completion Reminder Sent"; badge "Initiated by inspector" when `metadata.source === TRANSITION_SOURCE_INSPECTOR_CANT_DO`; badge "Check-out" when `metadata.phase === 'FINISH'` OR `metadata.source === 'INSPECTOR_FINISH'`.

---

### User Story 4 - Tenant portal does not offer a new time after an inspector rejection (Priority: P2)

When an appointment was rejected by the inspector (`canChangeTime: false`), the rental-tenant portal hides the "change time" picker and the REJECTED banner reads "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time."

**Why this priority**: L-F03-01 (D20). The backend already blocks `join-group`/`get-available-groups`; the old web still shows "pick another available time", which is now wrong.

**Independent Test**: Render `PortalPage` (mocked) with REJECTED + `canChangeTime: false` and verify the new banner, no "pick another available time" phrase, and no group-list request fired; with `canChangeTime: true` or absent, the current behaviour is preserved.

**Acceptance Scenarios**:

1. **Given** portal data with `status 'REJECTED'` and `canChangeTime: false`, **When** the page renders, **Then** the new banner shows, the phrase "pick another available time" is absent, the group picker is not rendered and the available-groups request is not fired.
2. **Given** `status 'REJECTED'` with `canChangeTime: true` (e.g. `TENANT_DECLINED`), **When** the page renders, **Then** the current banner and picker appear (regression).
3. **Given** `canChangeTime` absent (old backend), **When** the page renders, **Then** the current behaviour is preserved (treated as `true`).
4. **Given** a race where `join-group` returns 409 `PORTAL_APPOINTMENT_INACTIVE`, **When** the tenant submits, **Then** the existing error message shows and the portal data reloads.

### Edge Cases

- Appointment with no execution and no events → empty-state block, no card.
- Re-offered after "can't do" → card persists (history of last impediment); block shows the restarted execution plus the old events.
- Rejection after check-in → "Check-in abandoned" row + "Abandoned" chip.
- Property with no coordinates → "Property has no coordinates" in place of distance; no radius chip.
- Poor accuracy → shows "±350 m"; the radius chip shows only if the flag was recorded.
- CL → no coordinate in the DOM or payload (backend already strips; the component does not depend on that to hide anything).
- INSP → does not reach the web detail route (already guarded).
- Future unknown reason code → humanized by `formatReasonCodeLabel`.
- Setting at default → "Default" badge; saving writes the row.
- Two operators editing at once → last write wins (D18, accepted).
- Portal opened before the "can't do" → tenant picking a group gets the 409; the page reloads and shows the new banner.
- Portal after OP re-offer → status leaves REJECTED → `canChangeTime` returns `true` → normal flow.
- Time window skipped on implausible client time (D25) → backend records `out_of_window = false`; no "Outside time window" flag shows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The appointment detail (overview tab) MUST render a **Field activity** section after `AppointmentDetailSections` and before `AppointmentSatisfactionSection`, fed by `GET /v1/appointments/:id/field-activity` via a `useAppointmentFieldActivity(id)` React Query hook (key `['appointment', id, 'field-activity']`), invalidated with the detail on transitions.
- **FR-002**: The Field activity block MUST show, when present: checked-in time (server) with a "Device time … (synced later)" note when the client time differs by more than 2 minutes; checked-out time or "—"; "Check-in abandoned" row when `abandonedAt`; distance at check-in and at check-out as "{m} m (accuracy ±{m} m)" or "Property has no coordinates"; flag chips "Outside geofence ({radius} m)", "Outside time window", "Checked out outside geofence", "Abandoned"; and a descending list of field events (type, reason, minutes for late, note, inspector, time).
- **FR-003**: The Field activity block MUST render a loading skeleton, an empty state "No field activity yet." (when no execution and no events), and an error state "Couldn't load field activity" with a "Retry" action.
- **FR-004**: The block and its events MUST NOT render any inspector coordinate; a test MUST fail if a coordinate value is present in a CL-rendered DOM.
- **FR-005**: A reusable `InspectorIssueCard` component MUST render the "Inspector couldn't complete" card with `full` (detail) and `compact` (map) variants, only when `inspectorIssue` is non-null; `role="status"`; title "Inspector couldn't complete"; rows "Reason", "Note" (when present) and "Reported by {inspectorName ?? 'Inspector'}{ (current inspector) when `issue.inspectorId === currentInspectorId` } on {dd/MM/yyyy HH:mm}".
- **FR-006**: The detail MUST render the `InspectorIssueCard` (full) at the top of `AppointmentDetailSections` (below the overdue alert); the map detail panel MUST render the compact card (`data-testid="map-detail-inspector-issue"`), below the REJECTED banner or at the top when status is not REJECTED (card persists after re-offer).
- **FR-007**: The map detail panel REJECTED banner MUST humanize the reason code via `formatReasonCodeLabel` (showing "Inspector Unable", "Tenant Declined", etc.), not the raw code.
- **FR-008**: `AuditTimeline` MUST add labels/styles for `inspection.geolocation_mismatch`, `inspection.check_in_blocked`, `inspector_field_event.cant_do`, `inspector_field_event.late_notice`, `inspection.completion_reminder_sent`; a "Initiated by inspector" badge when `metadata.source === TRANSITION_SOURCE_INSPECTOR_CANT_DO`; and a "Check-out" badge when `metadata.phase === 'FINISH'` OR `metadata.source === 'INSPECTOR_FINISH'`. Comparisons MUST use the shared `TRANSITION_SOURCE_*` constants, not string literals.
- **FR-009**: `StatusTransitionDialog` MUST remove `SYSTEM_ONLY_REJECTION_CODES` (imported from shared) from the REJECTED options as an isolated filter step over the input list (so F07-3 can chain an origin filter before it without rewriting this one).
- **FR-010**: A new **Platform settings** page (`features/platform-settings/pages/PlatformSettingsPage.tsx`) MUST be route-guarded to AM/OP (`<AuthGuard roles={[AM, OP]}>` at route `platform-settings`), lazy-loaded, with a `PageHeader` "Platform settings" and one `FormSection` per registry key; this task renders only the "Field events" section (`FieldEventsSettingsSection.tsx`) via a generic `usePlatformSetting(key)` hook.
- **FR-011**: The Field events section MUST provide: geofence radius (number, 50–5000 m), geofence mode (radio "Flag (recommended)"/"Block" with the Block fallback help text), time-window tolerance (number, 0–240 min), a completion-reminder switch, and remind-after-window-end minutes (number, 0–720, disabled when the switch is off). It MUST validate client-side with the stated messages, submit the complete `fieldEvents` object via `PUT`, show the success snackbar, map a 400's `details` to field errors (focus the first), show a 403 `ErrorState`, support "Discard changes", and prompt on navigation with unsaved changes.
- **FR-012**: A "Platform Settings" item (`{ icon: 'mdi-tune-vertical', label: 'Platform Settings', to: '/platform-settings' }`) MUST be **appended** to the "Configuration" group in `Sidebar.tsx` (inheriting AM/OP from the group); AM and OP see it, CL_ADMIN/CL_USER/INSP do not. The change MUST NOT reorder or alter the X01-owned canonical order.
- **FR-013**: `INSPECTOR_UNABLE` MUST appear humanized in the appointment table and export (already humanized by `formatReasonCodeLabel` — regression tests only) and in the map banner (FR-007); it MUST NOT be offered in the manual status-transition dialog (FR-009). No reason-code filter exists in the list/board and none is added.
- **FR-014**: `PortalPage` MUST compute `const canChangeTime = appointment.canChangeTime ?? true;` and, when false for a REJECTED appointment, render the banner "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time.", hide the change-time picker, and not fire the available-groups request. When true or absent, the current behaviour is preserved. A `join-group` 409 keeps the existing error + reload.
- **FR-015**: Web types MUST come from the generated `api-types.ts` (`AppointmentDetail.inspectorIssue`, `AppointmentMapItem.inspectorIssue`, field-activity response, platform-settings response); no `as any`.
- **FR-016**: The task MUST NOT import anything new into `DashboardPage`, `AnalyticsPage` or `InspectorWorkloadPage` (D11: existing dashboards unchanged). The compact map card MUST NOT open its own modal (map popup closes page modals).

### Key Entities *(consumed, not created)*

- **PlatformSetting (`fieldEvents` key)**: `{ geofenceRadiusMeters, geofenceMode: 'FLAG'|'BLOCK', checkInWindowToleranceMinutes, completionReminderEnabled, completionReminderMinutesAfterWindowEnd }`, with `isDefault`, `updatedAt`, `updatedBy`. Platform-scoped, no `tenant_id`.
- **InspectorIssue**: `{ reason: string; note: string | null; inspectorId?: string | null; inspectorName: string | null; occurredAt: string } | null` — last `CANT_DO` of the appointment, persistent after re-offer.
- **Field activity response**: execution summary (start/finish times, distances, accuracies, flags, `abandonedAt`, client times, `geofenceRadiusM`) + a descending list of field events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (00.A3 web)**: Check-in, check-out and "can't do" appear in the web detail with date, time and inspector; the reason card appears on the detail and the map modal only when it exists.
- **SC-002 (03.A2 web)**: The "Outside geofence" flag appears in the execution block; the FLAG/BLOCK mode is configurable by AM/OP on the Platform settings page.
- **SC-003 (privacy)**: CL sees distance and flags with zero raw inspector coordinates in the DOM (test fails otherwise).
- **SC-004**: `INSPECTOR_UNABLE` appears humanized in the table, export and map, and is not offered in the manual dialog.
- **SC-005**: The tenant portal offers no new time for an inspector-rejected appointment (component test 10 + e2e `portal-inspector-unable`).
- **SC-006**: `pnpm --filter web typecheck`, `lint`, `test` pass; the four Playwright specs pass in CI mode; ≤ 150 changed files.

## Assumptions

- **Premise (L-F03-01 / D20)**: `canChangeTime` absent on the portal payload is treated as `true` (old-backend compatibility). Adopted per the plan.
- **Premise (D18)**: Platform settings `PUT` is last-write-wins; no optimistic concurrency. The page warns via the standard unsaved-changes prompt but does not detect concurrent edits.
- **Premise (D31 / L-F06-04)**: The AuditTimeline "Check-out" badge also matches `metadata.source === 'INSPECTOR_FINISH'` — forward-compatible and inert until F06-2 writes that source.
- F03-1 and F03-2 are merged on `develop` and `api-types.ts` already carries their routes/fields (verified at `develop@75166fe6`).
- The backend already strips inspector coordinates from CL payloads and masks them in the audit log; the web does not rely on that to hide the (non-existent) external map link.
- Node 24 is the CI runtime; local Node 26 is used only for the dev gates and does not change behaviour.
- Out of scope: existing dashboards (D11), Live Day (F05), other features' settings sections, a reason-code list filter (does not exist), and any embedded/external map in the block.
