# Phase 1 Data Model — Inspector Field Events (F03-2)

Expand-only. One migration `<timestamp>_inspector_field_events` (timestamp regenerated at implementation so it orders after F02's migration — D19).

## Enum `InspectorFieldEventType`

`CANT_DO`, `LATE_NOTICE` (exactly 2).

## Table `inspector_field_events`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `String @id @default(uuid())` | no | |
| `appointment_id` | `String` | no | FK → `appointments.id` |
| `inspector_id` | `String` | no | FK → `inspectors.id` |
| `tenant_id` | `String` | no | appointment's tenant — scope + reports (**carries tenant_id; not a §II exception**) |
| `type` | `InspectorFieldEventType` | no | |
| `reason_code` | `VarChar(50)` | no | `FieldIssueReason` (CANT_DO) or `LateNoticeReason` (LATE_NOTICE); validated in shared Zod |
| `note` | `Text` | yes | CANT_DO only, ≤ 500 chars (Zod); LATE_NOTICE never has a note |
| `minutes` | `Int` | yes | LATE_NOTICE only, 5..240 (the `minutesLate` relative to the reference) |
| `latitude` | `Decimal(10,7)` | yes | inspector position — served to AM/OP only |
| `longitude` | `Decimal(10,7)` | yes | inspector position — served to AM/OP only |
| `accuracy_m` | `Decimal(10,2)` | yes | |
| `client_occurred_at` | `DateTime` | yes | raw client-reported time when plausible |
| `created_at` | `DateTime @default(now())` | no | the event instant (immutable — no `updated_at`) |

Indexes:

- `@@index([appointment_id, type, created_at(sort: Desc)])` — latest `CANT_DO` per appointment (`DISTINCT ON`)
- `@@index([inspector_id, created_at])`
- `@@index([tenant_id, created_at])`
- `@@index([type, created_at])`
- `@@map("inspector_field_events")`

Relations (back-refs): `Appointment.field_events InspectorFieldEvent[]`, `Inspector.field_events InspectorFieldEvent[]`, `Tenant.inspector_field_events InspectorFieldEvent[]`.

**Immutability**: events are append-only. No update/delete endpoint, no `updated_at`.

## Column `inspection_executions.abandoned_at`

`DateTime?`, nullable. Non-null = the check-in was abandoned (inspector reported can't-do after checking in). A later `start` restarts the row and resets it to null. No `@@index([abandoned_at])` (filtered together with `finished_at: null` over a small set).

## Enum `RejectionReasonCode` (extended)

Add `INSPECTOR_UNABLE` → total **9** (doc: "System-assigned only: the inspector reported 'Can't do this job' from the app"). Export `SYSTEM_ONLY_REJECTION_CODES: RejectionReasonCode[] = ['INSPECTOR_UNABLE']`. Column `appointments.rejection_reason_code` is `VarChar(50)` → **no migration** for the new value. (TASK-F07-1 later adds `INSPECTOR_NO_SHOW`, `NOT_EXECUTED` → 11.)

## Shared enums (new, in `enums/field-events.ts`)

| `FieldIssueReason` | Label | Note required |
|---|---|---|
| `NO_ANSWER` | No answer at the door | no |
| `KEY_FAILED` | Key didn't work | no |
| `TENANT_REFUSED` | Tenant refused entry | no |
| `UNSAFE` | Unsafe to enter | no |
| `SITE_ISSUE` | Problem at the property | **yes** |
| `CANT_ATTEND` | I can't attend | no |

`FIELD_ISSUE_NOTE_REQUIRED_REASONS = ['SITE_ISSUE']`.

| `LateNoticeReason` | Label |
|---|---|
| `TRAFFIC` | Traffic |
| `PREVIOUS_JOB_OVERRAN` | Previous job ran over |
| `PERSONAL` | Personal reason |
| `OTHER` | Other |

`LATE_NOTICE_MINUTES_OPTIONS = [10, 20, 30, 45, 60, 90] as const`.

## Derived values (not columns)

- **`estimatedArrivalAt`**: `max(reference, effectiveNoticeAt) + minutesLate` where `reference = published_service_start_at ?? windowStartAt`. Derived and returned; consumers recompute via the exported pure `computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate)`.
- **`inspectorIssue`** (list/detail): latest `CANT_DO` of the appointment → `{ reason, note, inspectorId, inspectorName, occurredAt }` | null.
- **`lastFieldIssue`** (inspector detail): latest `CANT_DO` of the appointment **only when made by the requesting inspector** → `{ reason, note, occurredAt }` | null.
- **`canChangeTime`** (portal): `!isPortalChangeTimeBlocked({ status, rejectionReasonCode })`.
- **`executionAbandoned`** (can't-do response): whether an in-progress execution was abandoned by this report.
