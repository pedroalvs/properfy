# Phase 0 Research — F03-4 (web)

All "unknowns" here are *integration patterns* in the existing `apps/web` codebase, not open product questions (those are resolved in the task file D1–D31 / L-F03-01..10). Each decision cites the pattern to reuse.

## R1. Field-activity data fetching

- **Decision**: One React Query hook `useAppointmentFieldActivity(id)` calling `GET /v1/appointments/:id/field-activity` through the typed `openapi-fetch` client, query key `['appointment', id, 'field-activity']`, invalidated together with the appointment detail on status transitions.
- **Rationale**: Matches the existing `useAppointmentDetail` pattern; a separate key keeps the (larger, role-shaped) field-activity payload out of the detail cache and lets the section show its own loading/error states without blocking the detail.
- **Alternatives considered**: Folding field-activity into the detail response — rejected: it is a separate endpoint owned by F03-2 and carries role-conditional coordinate fields; coupling would widen the detail query and complicate the CL test.

## R2. CL privacy enforcement in the DOM

- **Decision**: The components render only derived values (distance, accuracy, flags, times). Coordinate fields (`startLatitude`, `fieldEvent.latitude`, …) are never read. A dedicated test renders the CL payload (which omits coordinates) and asserts no coordinate-shaped value appears; a second guard test feeds a payload that *does* carry coordinates and asserts the component still renders none.
- **Rationale**: The backend already strips coordinates for CL, but the constitution requires the web not to leak even if a coordinate slips through; a component that never reads the field cannot leak. The failing-without-guard test is mandated by the task.
- **Alternatives considered**: Trusting the backend only — rejected: defense in depth + an explicit regression gate is cheap and required.

## R3. Reason-code humanization

- **Decision**: Use the existing `formatReasonCodeLabel` util (`@properfy/shared`) everywhere a code is shown (map banner, issue card, table tooltip). For the manual dialog, filter `SYSTEM_ONLY_REJECTION_CODES` out of the option list as an isolated step.
- **Rationale**: `AppointmentTable`/export already call `formatReasonCodeLabel` (regression only). The map banner currently shows the raw code — the single real bug to fix. The isolated filter step lets F07-3 chain `allowedRejectionCodesFrom(fromStatus)` before it without a rewrite (L-F07-01/04).
- **Alternatives considered**: A local label map — rejected: duplicates shared logic (constitution §Simplicity).

## R4. AuditTimeline source/phase badges

- **Decision**: Compare `metadata.source` against the shared `TRANSITION_SOURCE_INSPECTOR_CANT_DO` (and the string `'INSPECTOR_FINISH'` for the forward-compatible check-out badge, since F06-2 has not landed its constant yet) and `metadata.phase === 'FINISH'`.
- **Rationale**: D31/L-F06-04 — consumers must match constants, not `actorType`. `TRANSITION_SOURCE_INSPECTOR_FINISH` does not exist on `develop` yet (F06-2 adds it); the badge matches the literal `'INSPECTOR_FINISH'` so it is inert until F06-2 writes that source, then lights up with no further web change. Documented as a premise in the spec.
- **Alternatives considered**: Waiting for F06-2 — rejected: the badge is additive and harmless now, and the task explicitly asks for the forward-compatible match.

## R5. Platform settings page shape + generic hook

- **Decision**: `PlatformSettingsPage` renders a `PageHeader` + one `FormSection` per registry key; this task mounts only `FieldEventsSettingsSection`. A generic `usePlatformSetting(key)` hook wraps `GET /v1/platform-settings/:key` (read) and `PUT /v1/platform-settings/:key` (mutation, invalidating the key + the list). Client validation reuses `PLATFORM_SETTINGS_REGISTRY[key].schema` where possible, with field-specific range messages per the task copy.
- **Rationale**: The registry already encodes schema/defaults/section; one generic hook keeps every future section (F04/F05/F07/F08/F10) to "add a `FormSection`", matching the shared-package contract note.
- **Alternatives considered**: A bespoke `useFieldEventsSetting` — rejected: would not generalize and duplicates fetch logic.

## R6. Platform settings mutation semantics

- **Decision**: `PUT` sends the complete `fieldEvents` object (`{ value: {...} }`). Last-write-wins (D18) — no optimistic concurrency header. On 400, map `error.details` (Zod issues) to field errors and focus the first; on 403, show `ErrorState`. "Discard changes" resets form state to the loaded value; an unsaved-changes navigation prompt reuses the standard edit-screen guard.
- **Rationale**: Matches the backend contract (`updatePlatformSettingSchema = { value }`) and the task's accepted D18 tradeoff.
- **Alternatives considered**: Partial/PATCH update — rejected: the endpoint is a full replace of the key value.

## R7. Sidebar insertion (shared-conflict file)

- **Decision**: Append `{ icon: 'mdi-tune-vertical', label: 'Platform Settings', to: '/platform-settings' }` to the existing "Configuration" group's children. Do not touch the Dashboard group or the X01 canonical order.
- **Rationale**: `paralelizacao.md` rule — X01 owns the Dashboard-group order; F03-4 only appends within "Configuration", which X01 does not alter. Rebase is a trivial non-overlapping edit.
- **Alternatives considered**: A new menu group — rejected: the task places it in the existing "Configuration" group (AM/OP).

## R8. Portal change-time gate

- **Decision**: In `PortalPage`, `const canChangeTime = appointment.canChangeTime ?? true;` Gate the group-list query and the picker on `canChangeTime`; when false + REJECTED, show the new banner. A `join-group` 409 keeps the existing error + reload.
- **Rationale**: L-F03-01/D20; `?? true` preserves old-backend payloads. The backend already returns empty groups + 409, so the web change is purely presentational.
- **Alternatives considered**: Removing the picker whenever REJECTED — rejected: `TENANT_DECLINED` rejections must still offer rescheduling (`canChangeTime: true`).

## R9. Map popup vs page modals

- **Decision**: The compact `InspectorIssueCard` on the map detail panel is inline content only — it opens no dialog/modal of its own.
- **Rationale**: Known trap (`project_map_popup_outside_click_kills_page_modals`) — a modal launched from inside the map popup gets killed by the popup's outside-click handling.
- **Alternatives considered**: A "details" modal from the compact card — rejected per the trap and the task's edge-case note.

## Outcome

No `NEEDS CLARIFICATION` remain. All decisions reuse existing web primitives and the merged F03-1/F03-2 contracts.
