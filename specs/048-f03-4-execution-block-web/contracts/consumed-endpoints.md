# Consumed Endpoints — F03-4 (web)

This feature defines **no new endpoints**. It consumes the following, already merged by F03-1/F03-2 and present in `packages/shared/src/api-types.ts` (verified at `develop@75166fe6`). Types come from the generated client; no hand-edit.

## GET /v1/appointments/{appointmentId}/field-activity
- **Auth**: AM, OP, CL_ADMIN, CL_USER (same as appointment detail). Backend omits inspector coordinates for CL roles.
- **Response 200**: `AppointmentFieldActivityResponse` = `{ execution: ExecutionSummary | null, events: FieldEventItem[] }` (events descending).
- **Web use**: `useAppointmentFieldActivity(id)`, key `['appointment', id, 'field-activity']`, rendered by `AppointmentFieldActivitySection`. Loading → skeleton; error → ErrorState "Couldn't load field activity" + Retry; empty → "No field activity yet."

## GET /v1/appointments/{appointmentId}  (existing, now carries `inspectorIssue`)
- **Response**: `AppointmentDetail` with `inspectorIssue: InspectorIssue | null`.
- **Web use**: feeds `InspectorIssueCard` (full) + `currentInspectorId = appointment.inspectorId`.

## GET /v1/appointments  (existing, each item now carries `inspectorIssue`)
- **Web use**: `AppointmentMapItem.inspectorIssue` feeds the compact card while the detail loads; `AppointmentTable` "Cancellation Reason" column (regression) humanizes `rejectionReasonCode`.

## GET /v1/platform-settings
- **Auth**: AM, OP only (route-guarded + server-enforced).
- **Response 200**: `PlatformSettingsListResponse` = `{ settings: PlatformSettingResponse[] }`.
- **Web use**: page load; "Field events" section reads the `fieldEvents` entry.

## GET /v1/platform-settings/{key}
- **Auth**: AM, OP.
- **Response 200**: `PlatformSettingResponse`.
- **Web use**: `usePlatformSetting('fieldEvents')` read.

## PUT /v1/platform-settings/{key}
- **Auth**: AM, OP.
- **Request**: `{ value: <complete key object> }` (`updatePlatformSettingSchema`).
- **Responses**: 200 `PlatformSettingResponse`; 400 `VALIDATION_ERROR` with `details`; 403 `FORBIDDEN`; 404 `PLATFORM_SETTING_UNKNOWN_KEY`.
- **Web use**: `usePlatformSetting('fieldEvents')` mutation; success snackbar "Field event settings saved. Changes apply within a minute."; 400 → field errors + focus first; 403 → ErrorState.

## GET portal data (rental-tenant-portal, existing, now carries `canChangeTime`)
- **Response**: `appointment.canChangeTime?: boolean` (optional; absent ⇒ `true`).
- **Web use**: `PortalPage` gates the group-list fetch + change-time picker; new REJECTED banner when `false`.

## Error envelope (all)
`{ error: { code, message, details? } }` — parsed by `utils/api-error.ts`.
