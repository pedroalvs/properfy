# Consumed contracts (TASK-F03-3)

This is a frontend task. It defines **no** new contract and changes **no** route or `api-types`. It consumes the following, all already merged on `develop` by TASK-F03-1 and TASK-F03-2.

## Endpoints

| Method | Path | Request schema | Response schema | Source |
|--------|------|----------------|-----------------|--------|
| POST | `/v1/inspector/appointments/:appointmentId/start` | `startInspectionSchema` (+ `accuracy?`, `clientOccurredAt?`) | `startInspectionResponseSchema` (+ `startAccuracyMeters`, `outOfRadius`, `outOfWindow`, `geofence`) | F03-1 |
| POST | `/v1/inspector/appointments/:appointmentId/finish` | `finishInspectionSchema` (+ `accuracy?`, `clientOccurredAt?`) | `finishInspectionResponseSchema` (+ `finishGeolocationDistanceMeters?`, `finishOutOfRadius?`) | F03-1 |
| GET | inspector appointment detail | — | detail schema (+ `geofence?`, `lastFieldIssue?`) | F03-1/F03-2 |
| POST | `/v1/inspector/appointments/:appointmentId/cant-do` | `cantDoRequestSchema` | `cantDoResponseSchema` | F03-2 |
| POST | `/v1/inspector/appointments/:appointmentId/late-notice` | `lateNoticeRequestSchema` | `lateNoticeResponseSchema` | F03-2 |

All five require an `Idempotency-Key` header. `start`/`finish` keys are `start-{id}`/`finish-{id}` in `sessionStorage` (existing). `cant-do`/`late-notice` keys are generated once when the sheet opens and held in a `useRef`.

## Error codes the app must handle

| Code | HTTP | Where | App behaviour |
|------|------|-------|---------------|
| `GEOFENCE_OUT_OF_RADIUS` | 422 | start | Show server message; no local state; permanent in queue on first response (append " Check in again when you're at the property.") |
| `APPOINTMENT_NOT_FOUND` | 404 | start/finish/cant-do/late-notice | Server message; invalidate schedule; (queue) permanent cleanup |
| `EXECUTION_T1_BLOCKED` | 403 | start | Server message; (queue) permanent cleanup |
| `CANT_DO_ALREADY_REPORTED` | 409 | cant-do | Treat as success (same cleanup) with server message |
| late-notice already-checked-in | 422 | late-notice | Show "You've already checked in to this job." |
| `IDEMPOTENCY_KEY_MISSING` | 400 | all | Guarded by always sending a key |

## Shared enums/labels

`FieldIssueReason`, `FIELD_ISSUE_REASON_LABELS`, `FIELD_ISSUE_NOTE_REQUIRED_REASONS`, `LateNoticeReason`, `LATE_NOTICE_REASON_LABELS`, `LATE_NOTICE_MINUTES_OPTIONS`, `GeofenceMode` — all from `@properfy/shared` `enums/field-events`.

## Non-goals (explicitly not touched)
- No new route, no backend code, no Prisma/schema change, no `openapi.json`/`api-types` regeneration.
- No new `QueuedAction` type; IndexedDB schema unchanged.
