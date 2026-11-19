# Data model — PWA field-event actions (TASK-F03-3)

This task adds **no** persistent server model. It consumes server contracts and touches only client-side IndexedDB state that already exists. Nothing here changes an IndexedDB schema.

## Client state (IndexedDB — existing, unchanged shape)

### ExecutionState (`features/execution/types/index.ts`)
Per-appointment local execution record. Written by `useLocalExecutionState` and now, via the extracted `useExecutionActions`, by **both** the card and `ExecutionPage` (same key = `appointmentId`, single writer path).
- `phase`: `PRE_START | IN_PROGRESS | DONE | ERROR` (existing).
- `startLocation`, `startedAt`, `pendingSync`, error message (existing fields).
- **Invariant (new, enforced by behaviour not schema)**: a permanent queued-START failure MUST clear this record (`clearExecutionState(appointmentId)`) so the card leaves IN_PROGRESS.

### QueuedAction (`features/execution/lib/indexeddb.ts`)
Offline START/FINISH items, chained per appointment.
- `type`: `'START' | 'FINISH'` — **unchanged; no new type is added** (field events never enqueue, D7).
- `payload`: free-form; now carries `accuracy` and `clientOccurredAt` in addition to `latitude`/`longitude`. Old items with only `{latitude, longitude}` stay valid (D8).
- `status`: `'PENDING' | 'FAILED'` (existing); `retryCount` (existing).
- **New helper**: `purgeAppointmentFromOfflineQueue(appointmentId)` removes all `QueuedAction` for the appointment and calls `clearExecutionState(appointmentId)` (used after a confirmed "Can't do").

## Consumed server contracts (read-only; shapes defined by the committed shared schemas)

### `InspectorAppointmentDetail` (GET inspector appointment detail)
The PWA uses a **hand-written** `InspectorAppointmentDetailResponse['data']` (`features/schedule/types/index.ts`) mapped by `mapInspectorAppointmentDetail` (`features/schedule/lib/adapters.ts`) into the `InspectorAppointment` domain type — it does **not** import the generated `api-types` for this detail. This task extends both the response type and the adapter:
- `geofence?: { radiusMeters: number; mode: 'FLAG' | 'BLOCK' }` — drives the capture warning radius (default 300 when absent).
- `lastFieldIssue?: { reason: string; note: string | null; occurredAt: string } | null` — drives the "You reported…" alert (present only when the latest CANT_DO was this inspector's).
- `publishedServiceStartAt?: string` — optional; absent until F04 merges, so the "Running late" reference falls back to `timeSlotStart`.
- Existing fields used: `inspectionAppLink`, `scheduledDate`, `timeSlotStart`, `timeSlotEnd`, `appointmentCode`, `status`, `propertyAddress`.

**Note — no server `executionStatus`.** The day-schedule payload carries no execution status. The card/detail derive the execution phase from the local IndexedDB `ExecutionState` via `useLocalExecutionState(appointment.id)` (as `AppointmentDetailPage` already does). "Check in" vs "Check out" is a function of `status === SCHEDULED` plus the local phase.

### `startInspectionResponseSchema` / `finishInspectionResponseSchema`
- Start adds: `startAccuracyMeters`, `outOfRadius`, `outOfWindow`, `geofence { mode, effectiveMode, radiusMeters, fallbackReason }`.
- Finish adds: `finishGeolocationDistanceMeters?`, `finishOutOfRadius?`.
- Request bodies add optional `accuracy` and `clientOccurredAt`.

### `cantDoRequestSchema` → `cantDoResponseSchema`
- Request: `{ reason, note?, latitude?, longitude?, accuracy?, clientOccurredAt? }` (note required for `SITE_ISSUE`; lat/lng together).
- Response: `{ eventId, appointmentId, appointmentStatus: 'REJECTED', occurredAt, executionAbandoned }`.

### `lateNoticeRequestSchema` → `lateNoticeResponseSchema`
- Request: `{ reason, minutesLate (int 5–240), latitude?, longitude?, accuracy?, clientOccurredAt? }`.
- Response: `{ eventId, appointmentId, occurredAt, reason, minutesLate, referenceAt, referenceSource: 'PUBLISHED_PLAN' | 'WINDOW_START', estimatedArrivalAt }`.

## Shared enums/labels consumed (no redefinition)
- `FieldIssueReason` (6) + `FIELD_ISSUE_REASON_LABELS` + `FIELD_ISSUE_NOTE_REQUIRED_REASONS = ['SITE_ISSUE']`.
- `LateNoticeReason` (4) + `LATE_NOTICE_REASON_LABELS` + `LATE_NOTICE_MINUTES_OPTIONS = [10,20,30,45,60,90]`.
- `GeofenceMode` (`FLAG | BLOCK`).

## Multi-tenant / privacy note
No new entity, no `tenant_id` decision. The app is `INSP`-only; the server scopes all reads/writes to the inspector's own assignments. Consumed payloads (`lastFieldIssue`, detail) carry **no** raw inspector coordinates by design (F03-1/F03-2 privacy cut). The PWA renders only distance/accuracy/flags, never raw lat/lng, for any field-event surface.
