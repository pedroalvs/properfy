# API Contracts — Inspector Field Events (F03-2)

All `/v1`, camelCase payloads, error envelope `{ error: { code, message, details? } }`. Zod schemas in `packages/shared/src/schemas/field-events.ts` (+ `responses.ts`); `openapi.json`/`api-types.ts` regenerated. The authoritative contract is the generated OpenAPI document (constitution §IV).

## POST /v1/inspector/appointments/:appointmentId/cant-do

- **RBAC**: INSP, own `SCHEDULED` appointments only.
- **Idempotency-Key**: required, scope `cant-do`, TTL 24 h.
- **Request** `cantDoRequestSchema`: `{ reason: FieldIssueReason, note?: string(≤500, trimmed; required non-empty for SITE_ISSUE), latitude?, longitude? (together), accuracy?, clientOccurredAt? (ISO offset) }`.
- **Response 200** `cantDoResponseSchema`: `{ eventId, appointmentId, appointmentStatus: 'REJECTED', occurredAt, executionAbandoned }`.
- **Errors**: 400 `IDEMPOTENCY_KEY_MISSING` · "Idempotency-Key header is required"; 400 `VALIDATION_ERROR` · "Request payload is invalid"; 403 `FORBIDDEN`; 403 `INSPECTOR_NOT_LINKED` · "Inspector profile not linked to user account"; 404 `APPOINTMENT_NOT_FOUND` · "Appointment not found or not assigned to this inspector"; 409 `CANT_DO_ALREADY_REPORTED` · "You already reported this job. It is no longer on your route."; 409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED` · "This job is not scheduled for you any more."; 409 `EXECUTION_ALREADY_FINISHED` · "Inspection execution already completed"; 409 `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH` · "This Idempotency-Key was already used with a different request".
- **Side effects**: `CANT_DO` event (tenant = appointment tenant); `SCHEDULED → REJECTED` as SYS with `INSPECTOR_UNABLE` (unlinks group, releases inspector); `abandoned_at` if checked in; after commit → audits (`inspector_field_event.cant_do`, maybe `inspection_execution.abandoned`), one `INSPECTOR_UNABLE_ALERT` per active OP/AM, `INSPECTOR_FIELD_EVENTS.RECORDED`, and the existing `INSPECTION_REJECTED_AGENCY` to the agency (no tenant leg).

## POST /v1/inspector/appointments/:appointmentId/late-notice

- **RBAC**: INSP, own `SCHEDULED` job, today (agency tz), before check-in.
- **Idempotency-Key**: required, scope `late-notice`, TTL 24 h.
- **Request** `lateNoticeRequestSchema`: `{ reason: LateNoticeReason, minutesLate: int 5..240, latitude?, longitude? (together), accuracy?, clientOccurredAt? }` (a submitted `note` is stripped).
- **Response 201** `lateNoticeResponseSchema`: `{ eventId, appointmentId, occurredAt, reason, minutesLate, referenceAt, referenceSource: 'PUBLISHED_PLAN'|'WINDOW_START', estimatedArrivalAt }`.
- **Errors**: 400 `IDEMPOTENCY_KEY_MISSING` / `VALIDATION_ERROR`; 403 `FORBIDDEN` / `INSPECTOR_NOT_LINKED`; 404 `APPOINTMENT_NOT_FOUND`; 422 `LATE_NOTICE_NOT_ALLOWED` · "You can only send a running-late notice on the day of the job." / "You've already checked in to this job." / "This job is already finished."; 409 `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH`.
- **Side effects**: `LATE_NOTICE` event; audit `inspector_field_event.late_notice`; `INSPECTOR_FIELD_EVENTS.RECORDED`. **No** status change, **no** notification.

## GET /v1/appointments/:appointmentId/field-activity

- **RBAC**: AM, OP (any agency, same cut as `GET /v1/appointments/:id`); CL_ADMIN, CL_USER (own tenant only, **no** lat/lng); INSP → 403; TNT → 403; cross-tenant CL → 404.
- **Response 200** `appointmentFieldActivityResponseSchema`: `{ execution: executionSummarySchema | null, events: fieldEventItemSchema[] }`. Events ordered `occurredAt` desc, max 50. For CL: no `startLatitude/startLongitude/finishLatitude/finishLongitude` on `execution`, no `latitude/longitude` on events.
- **Errors**: 401; 403 `FORBIDDEN`; 404 `APPOINTMENT_NOT_FOUND`.

## Altered read contracts (expand-only)

| Endpoint | Added field |
|---|---|
| `GET /v1/appointments/:id`, `GET /v1/appointments` | `inspectorIssue: InspectorIssue \| null` (incl. `inspectorId`); CL receives it too. Declared in `appointmentResponseSchema` (undeclared fields are stripped by the serializer). |
| `GET /v1/inspector/appointments/:id` | `lastFieldIssue: { reason, note, occurredAt } \| null` (only the requesting inspector's own last `CANT_DO`). |
| Portal: data, available groups, join-group | data `appointment.canChangeTime?: boolean` (absent = legacy = true); groups `[]` for `REJECTED`+`INSPECTOR_UNABLE`; join-group → 409 `PORTAL_APPOINTMENT_INACTIVE` for `REJECTED`+`INSPECTOR_UNABLE`. Tenant confirmation status unchanged. |

## Transition use-case contract (internal, extended)

`ExecuteStatusTransitionUseCase` input gains:

- `auditMetadata?: Record<string, unknown>` — merged into the `status_transition` audit and the `STATUS_TRANSITION` event; generic (F06-2 uses it on finish).
- `expectedStatus?: AppointmentStatus` — when set, the write is `updateMany({ where: { id, tenant_id, status: expectedStatus } })`; `count === 0` → 409 `APPOINTMENT_STATUS_CHANGED` · "This appointment was changed by someone else. Reload and try again." Only finish and can't-do pass `'SCHEDULED'`.
- Guard: human actor + `SYSTEM_ONLY_REJECTION_CODES` code → 403 `REJECTION_REASON_CODE_SYSTEM_ONLY` · "The INSPECTOR_UNABLE rejection reason is assigned by the system only".

`IAppointmentRepository.update` gains the optional `expectedStatus` parameter. `appointment-state-machine.ts` and the 4 other transition-RBAC sources are untouched.

## Notification templates

- **New** `INSPECTOR_UNABLE_ALERT` (EMAIL, TRANSACTIONAL explicit, target `PLATFORM_OPS`) — registered in the 8 template places (not `seed.ts`; `syncPlatformTemplates` seeds at boot). Payload `INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS`: `appointmentCode, agencyName, propertyAddress, scheduledDate, timeWindow, inspectorName, reasonLabel, note, reportedAt, appointmentUrl`. Subject `Inspector couldn't complete {{appointmentCode}} — {{reasonLabel}}`.
- **Altered** `INSPECTION_REJECTED_AGENCY` — optional var `rejectedByInspector` + reused `inspectorName`; conditional final paragraph. No new registration. Note still via `{{rejectionReason}}`.

## Domain event

`INSPECTOR_FIELD_EVENTS = { RECORDED: 'inspector_field_event.recorded.v1' }`; payload `{ eventId, type, appointmentId, tenantId, inspectorId, reason, occurredAt }` (+ `estimatedArrivalAt` for `LATE_NOTICE`). F04 subscribes to mark `DayPlan` STALE (out of scope here).
