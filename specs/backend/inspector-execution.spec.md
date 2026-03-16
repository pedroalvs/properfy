# Inspector Execution Module – Implementation Spec

**Version:** 1.0
**Module path:** `apps/backend/src/modules/inspector-execution`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Inspector Execution module handles everything an inspector (INSP) does in the field via the PWA mobile app. It covers:

1. Viewing the inspector's schedule (accepted appointments for today and upcoming days).
2. Starting an inspection (creating an `InspectionExecution` record with geolocation).
3. Finishing an inspection (completing execution, uploading assets/evidence, triggering the `SCHEDULED → DONE` state transition).
4. Uploading inspection assets (photos, documents, signatures) via S3 presigned URL flow.

This module does NOT handle the marketplace offer/acceptance flow — that belongs to the `service-group` module. It does NOT handle financial entry creation — that is a side effect of the `DONE` transition, handled by the `billing` module.

### Actors

| Actor | Interaction |
|---|---|
| INSP | View schedule, start/finish inspection, upload assets |
| OP | Can finish inspection on behalf of inspector via appointments module (not this module's endpoints) |

### Domain Boundaries

- Owns: `InspectionExecution`, `InspectionAsset` entities
- Reads: `Appointment`, `AppointmentContact`, `AppointmentRestriction`, `Property`, `ServiceType`, `ServiceGroup`
- Triggers: `SCHEDULED → DONE` transition (via Appointments module state machine)
- Produces: `InspectionExecution`, `InspectionAsset` records
- Does NOT own: appointment state machine, billing entries, notifications

### T-1 rule summary

An appointment only appears in the inspector's schedule on the day before (T-1) if:
- It is in `SCHEDULED` status, AND
- One of:
  - `serviceType.flow_type` is `INGOING` or `OUTGOING` (no tenant confirmation required), OR
  - `appointment.tenantConfirmationStatus = CONFIRMED`, OR
  - `appointment.keyRequired = true`, OR
  - `appointment.tenantConfirmationStatus` was set to `CONFIRMED` by an OP manual override.

---

## 2. Data Model

### 2.1 Enums

#### `InspectionAssetKind`

```prisma
enum InspectionAssetKind {
  PHOTO     // Inspection photograph evidence
  DOCUMENT  // Supporting document (PDF, etc.)
  SIGNATURE // Digital signature capture
}
```

#### `InspectionAssetStatus`

```prisma
enum InspectionAssetStatus {
  PENDING        // Presigned URL issued, upload not yet confirmed
  UPLOADED       // Backend confirmed S3 object exists
  UPLOAD_FAILED  // Upload did not complete within TTL; can retry
}
```

### 2.2 Entity: `InspectionExecution`

**Table:** `inspection_executions`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| appointment_id | String | No | — | FK → appointments.id; unique (1:1) |
| inspector_id | String | No | — | FK → inspectors.id |
| started_at | DateTime | No | — | set at start |
| finished_at | DateTime | Yes | — | set at finish |
| start_latitude | Decimal | No | — | precision(10,7) |
| start_longitude | Decimal | No | — | precision(10,7) |
| finish_latitude | Decimal | Yes | — | precision(10,7) |
| finish_longitude | Decimal | Yes | — | precision(10,7) |
| checklist_json | Json | Yes | — | structured checklist response |
| notes | String | Yes | — | free-text field notes, max 5000 chars |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |

```prisma
model InspectionExecution {
  id                String    @id @default(uuid())
  appointment_id    String    @unique
  inspector_id      String
  started_at        DateTime
  finished_at       DateTime?
  start_latitude    Decimal   @db.Decimal(10, 7)
  start_longitude   Decimal   @db.Decimal(10, 7)
  finish_latitude   Decimal?  @db.Decimal(10, 7)
  finish_longitude  Decimal?  @db.Decimal(10, 7)
  checklist_json    Json?
  notes             String?
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt

  appointment       Appointment       @relation(fields: [appointment_id], references: [id])
  inspector         Inspector         @relation(fields: [inspector_id], references: [id])
  assets            InspectionAsset[]

  @@index([inspector_id])
  @@index([started_at])
  @@map("inspection_executions")
}
```

### 2.3 Entity: `InspectionAsset`

**Table:** `inspection_assets`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| appointment_id | String | No | — | FK → appointments.id |
| inspection_execution_id | String | No | — | FK → inspection_executions.id |
| storage_key | String | No | — | S3 object key; unique |
| mime_type | String | No | — | e.g. `image/jpeg`, `application/pdf` |
| size_bytes | Int | Yes | — | set after upload confirmation |
| kind | InspectionAssetKind | No | — | enum |
| status | InspectionAssetStatus | No | `PENDING` | enum |
| uploaded_by | String | No | — | inspector_id |
| upload_expires_at | DateTime | Yes | — | presigned URL TTL (15 min from issuance) |
| created_at | DateTime | No | `now()` | |

```prisma
model InspectionAsset {
  id                       String               @id @default(uuid())
  appointment_id           String
  inspection_execution_id  String
  storage_key              String               @unique
  mime_type                String
  size_bytes               Int?
  kind                     InspectionAssetKind
  status                   InspectionAssetStatus @default(PENDING)
  uploaded_by              String
  upload_expires_at        DateTime?
  created_at               DateTime             @default(now())

  appointment              Appointment          @relation(fields: [appointment_id], references: [id])
  execution                InspectionExecution  @relation(fields: [inspection_execution_id], references: [id])

  @@index([appointment_id])
  @@index([inspection_execution_id])
  @@index([status])
  @@index([uploaded_by])
  @@map("inspection_assets")
}
```

### 2.4 Referenced entities (read-only from this module)

- `appointments` — `status`, `tenantConfirmationStatus`, `keyRequired`, `assignedInspectorId`, `serviceTypeId`, `scheduledDate`
- `appointment_contacts` — tenant contact info for display in app
- `appointment_restrictions` — operational restrictions (is_home, etc.)
- `properties` — full address for map display
- `service_types` — `flowType`, `requiresTenantConfirmation`, `checklistTemplate`
- `inspectors` — name, phone for identity verification

---

## 3. Use Cases

### 3.1 `getInspectorSchedule`

**Actor:** INSP
**Input:** JWT (INSP role), optional `date` query param (YYYY-MM-DD; defaults to today)

**Steps:**

1. Extract `inspectorId` from JWT claims.
2. Determine the target date (default: today in system timezone; configurable per inspector region).
3. Query appointments where:
   - `inspector_id = inspectorId`
   - `status = SCHEDULED`
   - `scheduled_date = targetDate`
4. Apply T-1 visibility rule (see Business Rules 5, 6, 7):
   - If `targetDate` is tomorrow (T-1 relative to today) AND `serviceType.flow_type = ROUTINE` AND `tenantConfirmationStatus != CONFIRMED` AND `keyRequired != true` → exclude from results.
5. For each appointment, attach: property address, service type, appointment contact, restrictions, inspection execution status (started/not started).
6. Return sorted by `timeSlot` ascending.

**Output shape:**

```typescript
{
  date: string,
  appointments: Array<{
    id: string,
    status: "SCHEDULED",
    scheduledDate: string,
    timeSlot: string,
    serviceType: { code: string, name: string, flowType: string },
    property: { street: string, addressLine2: string | null, suburb: string, postcode: string, state: string },
    contact: { tenantName: string | null, primaryPhone: string | null },
    tenantConfirmationStatus: string,
    keyRequired: boolean,
    meetingLocationJson: object | null,
    executionStatus: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED",
  }>
}
```

### 3.2 `getAppointmentDetail`

**Actor:** INSP
**Input:** JWT, `appointmentId`

**Steps:**

1. Extract `inspectorId` from JWT.
2. Load appointment by `appointmentId` where `inspector_id = inspectorId` AND `status IN (SCHEDULED, DONE)`.
3. If not found or inspector mismatch → `APPOINTMENT_NOT_FOUND`.
4. Apply T-1 visibility rule (same as 3.1 step 4).
5. Load full detail: property, serviceType, contact, restrictions, existing execution (if any), assets list.
6. Return full detail payload.

### 3.3 `startInspection`

**Actor:** INSP
**Input:** JWT, `appointmentId`, `{ latitude, longitude }`, `Idempotency-Key` header

**Steps:**

1. Extract `inspectorId` from JWT.
2. Check idempotency: look up `Idempotency-Key` in idempotency store (PostgreSQL-backed; keyed by `idempotency:start:{key}`, TTL 24h). If found → return cached response.
3. Load appointment where `id = appointmentId` AND `inspector_id = inspectorId` AND `status = SCHEDULED`.
4. If not found → `APPOINTMENT_NOT_FOUND`.
5. Apply T-1 rule: if today is T-1 and appointment does not meet T-1 exceptions → `EXECUTION_T1_BLOCKED`.
6. Check if `InspectionExecution` already exists for this appointment:
   - If `finished_at IS NOT NULL` → `EXECUTION_ALREADY_FINISHED`.
   - If `finished_at IS NULL` (in-progress) → return existing execution (idempotent start).
7. Validate geolocation: `latitude` and `longitude` must be valid decimal values in range (-90/90, -180/180).
8. Within a DB transaction:
   a. Create `InspectionExecution` with `started_at = now()`, `start_latitude`, `start_longitude`, `inspector_id`.
   b. Create audit log entry.
9. Store idempotency result in PostgreSQL idempotency store.
10. Emit `inspection_execution.started` domain event.
11. Return execution record.

### 3.4 `finishInspection`

**Actor:** INSP
**Input:** JWT, `appointmentId`, `{ latitude, longitude, checklistJson, notes, assets: [{ assetId, storageKey }] }`, `Idempotency-Key` header

**Steps:**

1. Extract `inspectorId` from JWT.
2. Check idempotency (PostgreSQL-backed; keyed by `idempotency:finish:{key}`, TTL 24h). If found → return cached response.
3. Load `InspectionExecution` where `appointment_id = appointmentId`.
4. If not found → `EXECUTION_NOT_STARTED`.
5. If `finished_at IS NOT NULL` → `EXECUTION_ALREADY_FINISHED` (idempotent if same idempotency key).
6. Validate minimum required assets (see Business Rule 8).
7. Validate all referenced `assetId` entries exist with `status = UPLOADED` and belong to this execution. Any `PENDING` asset → `EXECUTION_ASSET_UPLOAD_PENDING`.
8. Validate geolocation range.
9. Within a DB transaction:
   a. Update `InspectionExecution`: set `finished_at = now()`, `finish_latitude`, `finish_longitude`, `checklist_json`, `notes`.
   b. Trigger `SCHEDULED → DONE` transition via Appointments module (internal call): sets `appointment.status = DONE`. The `done_checked_by_user_id` field is NOT set here — it remains null until an OP performs cross-check (see Business Rule 9).
   c. Create audit log entry.
10. Store idempotency result in PostgreSQL idempotency store.
11. Emit `inspection_execution.finished` domain event.
12. Return execution with final status.

### 3.5 `requestAssetUploadUrl`

**Actor:** INSP
**Input:** JWT, `appointmentId`, `{ kind, mimeType, fileName }`

**Steps:**

1. Extract `inspectorId` from JWT.
2. Load `InspectionExecution` for the appointment. Must exist and `finished_at IS NULL` → if already finished → `EXECUTION_ALREADY_FINISHED`.
3. Validate `mimeType` against allowed list (see Business Rule 11).
4. Generate storage key: `inspections/{tenantId}/{appointmentId}/{uuid}.{ext}`.
5. Generate S3 presigned PUT URL (TTL: 15 minutes) via Supabase Storage SDK.
6. Create `InspectionAsset` record with `status = PENDING`, `upload_expires_at = now() + 15 min`, `storage_key`, `kind`, `mimeType`.
7. Return presigned URL and asset ID.

### 3.6 `confirmAssetUpload`

**Actor:** INSP (called automatically by PWA after successful S3 PUT)
**Input:** JWT, `appointmentId`, `assetId`

**Steps:**

1. Load `InspectionAsset` where `id = assetId` AND `uploaded_by = inspectorId`.
2. If `status = UPLOADED` → idempotent, return success.
3. If `upload_expires_at < now()` → `ASSET_UPLOAD_EXPIRED`.
4. Verify object exists in S3 (HEAD request to storage key).
5. If object found: update `status = UPLOADED`, `size_bytes` (from S3 metadata).
6. If object not found: update `status = UPLOAD_FAILED`.
7. Return updated asset status.

---

## 4. API Contracts

All endpoints require `Authorization: Bearer {JWT}` with INSP role.

### 4.1 `GET /v1/inspector/schedule`

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| date | string | No | YYYY-MM-DD; defaults to today |

**Response 200:**

```json
{
  "date": "2026-03-21",
  "appointments": [
    {
      "id": "uuid",
      "status": "SCHEDULED",
      "scheduledDate": "2026-03-21",
      "timeSlot": "09:00-11:00",
      "serviceType": { "code": "ROUTINE", "name": "Routine Inspection", "flowType": "ROUTINE" },
      "property": {
        "street": "123 Main St",
        "addressLine2": null,
        "suburb": "Bondi",
        "postcode": "2026",
        "state": "NSW"
      },
      "contact": { "tenantName": "John Smith", "primaryPhone": "+61412345678" },
      "tenantConfirmationStatus": "CONFIRMED",
      "keyRequired": false,
      "meetingLocationJson": null,
      "executionStatus": "NOT_STARTED"
    }
  ]
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | JWT role is not INSP |

### 4.2 `GET /v1/inspector/appointments/:appointmentId`

**Response 200:**

```json
{
  "id": "uuid",
  "status": "SCHEDULED",
  "scheduledDate": "2026-03-21",
  "timeSlot": "09:00-11:00",
  "serviceType": { "code": "ROUTINE", "name": "Routine Inspection", "flowType": "ROUTINE" },
  "property": {
    "street": "123 Main St",
    "addressLine2": null,
    "suburb": "Bondi",
    "postcode": "2026",
    "state": "NSW",
    "country": "AU",
    "latitude": -33.891,
    "longitude": 151.277
  },
  "contact": {
    "tenantName": "John Smith",
    "primaryEmail": "john@example.com",
    "primaryPhone": "+61412345678",
    "secondaryPhone": null
  },
  "restrictions": {
    "isHome": true,
    "unavailableDaysJson": null,
    "unavailableHoursJson": null,
    "notes": "Please call 30 min before"
  },
  "tenantConfirmationStatus": "CONFIRMED",
  "keyRequired": false,
  "meetingLocationJson": null,
  "keyLocationJson": null,
  "execution": null,
  "assets": []
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `APPOINTMENT_NOT_FOUND` | Not found or not assigned to this inspector |

### 4.3 `POST /v1/inspector/appointments/:appointmentId/start`

**Headers:** `Idempotency-Key: {uuid}` (required)

**Request body (Zod schema):**

```typescript
const StartInspectionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
```

**Response 201:**

```json
{
  "executionId": "uuid",
  "appointmentId": "uuid",
  "startedAt": "2026-03-21T09:05:00.000Z",
  "startLatitude": -33.891,
  "startLongitude": 151.277,
  "status": "IN_PROGRESS"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 400 | `IDEMPOTENCY_KEY_MISSING` | Header not provided |
| 404 | `APPOINTMENT_NOT_FOUND` | Appointment not found or not SCHEDULED |
| 403 | `EXECUTION_T1_BLOCKED` | T-1 rule: tenant not confirmed |
| 409 | `EXECUTION_ALREADY_FINISHED` | Execution already completed |
| 422 | `VALIDATION_ERROR` | Invalid coordinates |

### 4.4 `POST /v1/inspector/appointments/:appointmentId/finish`

**Headers:** `Idempotency-Key: {uuid}` (required)

**Request body (Zod schema):**

```typescript
const FinishInspectionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  checklistJson: z.record(z.unknown()).optional(),
  notes: z.string().max(5000).optional(),
  assets: z.array(z.object({
    assetId: z.string().uuid(),
    storageKey: z.string().min(1),
  })).optional().default([]),
});
```

**Response 200:**

```json
{
  "executionId": "uuid",
  "appointmentId": "uuid",
  "startedAt": "2026-03-21T09:05:00.000Z",
  "finishedAt": "2026-03-21T10:45:00.000Z",
  "appointmentStatus": "DONE",
  "assetsCount": 12
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 400 | `IDEMPOTENCY_KEY_MISSING` | Header not provided |
| 404 | `EXECUTION_NOT_STARTED` | No execution record found |
| 409 | `EXECUTION_ALREADY_FINISHED` | Already finished |
| 422 | `EXECUTION_ASSET_UPLOAD_PENDING` | Referenced asset not yet confirmed uploaded |
| 422 | `EXECUTION_INSUFFICIENT_ASSETS` | Minimum required assets not met |
| 422 | `VALIDATION_ERROR` | Schema validation failure |

### 4.5 `POST /v1/inspector/appointments/:appointmentId/assets`

**Purpose:** Request presigned S3 upload URL for an asset.

**Request body (Zod schema):**

```typescript
const RequestAssetUploadSchema = z.object({
  kind: z.enum(["PHOTO", "DOCUMENT", "SIGNATURE"]),
  mimeType: z.string().min(1),
  fileName: z.string().min(1).max(255),
});
```

**Response 201:**

```json
{
  "assetId": "uuid",
  "uploadUrl": "https://supabase-storage.../presigned-put-url?...",
  "storageKey": "inspections/tenant-uuid/appointment-uuid/asset-uuid.jpg",
  "expiresAt": "2026-03-21T09:20:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `EXECUTION_NOT_STARTED` | No active execution |
| 409 | `EXECUTION_ALREADY_FINISHED` | Execution complete |
| 422 | `ASSET_MIME_TYPE_NOT_ALLOWED` | mimeType not in allowed list |

### 4.6 `PATCH /v1/inspector/appointments/:appointmentId/assets/:assetId/confirm`

**Purpose:** Confirm that an asset was successfully uploaded to S3.

**Request body:** none

**Response 200:**

```json
{
  "assetId": "uuid",
  "status": "UPLOADED",
  "sizeBytes": 2048576
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `ASSET_NOT_FOUND` | Asset not found or not owned by inspector |
| 410 | `ASSET_UPLOAD_EXPIRED` | Presigned URL has expired; request a new one |
| 422 | `ASSET_UPLOAD_NOT_FOUND_IN_STORAGE` | S3 HEAD check failed |

---

## 5. Business Rules

1. **Idempotency-Key required on start and finish:** Both `POST /start` and `POST /finish` require the `Idempotency-Key` header (UUID v4). If the same key is submitted again within 24 hours, the server returns the previously cached response without re-executing the operation. Missing key returns `400 IDEMPOTENCY_KEY_MISSING`.

2. **Inspector assignment validation:** An inspector can only start or finish an inspection for an appointment where `appointment.inspector_id` matches their own `inspectorId` from the JWT. Cross-inspector access returns `404 APPOINTMENT_NOT_FOUND` (not 403, to avoid leaking existence).

3. **Appointment must be SCHEDULED:** `startInspection` requires `appointment.status = SCHEDULED`. Any other status returns `404 APPOINTMENT_NOT_FOUND`.

4. **Geolocation is mandatory on start:** `latitude` and `longitude` are required fields for `startInspection`. Invalid coordinates (outside valid range) return `422 VALIDATION_ERROR`.

5. **T-1 rule for Routine Inspection:** If the inspection date is tomorrow (T-1), a Routine Inspection (`flow_type = ROUTINE`) only appears in the schedule and is allowed to start if `tenantConfirmationStatus = CONFIRMED` OR `keyRequired = true` OR an OP has manually confirmed.

6. **T-1 exception for Ingoing/Outgoing:** Appointments with `flow_type = INGOING` or `flow_type = OUTGOING` appear in the schedule whenever `status = SCHEDULED`, regardless of `tenantConfirmationStatus`. No T-1 restriction applies.

7. **T-1 exception for key_required:** If `appointment.keyRequired = true`, the Routine Inspection may appear in the schedule even without tenant confirmation (inspector uses a key to access the property).

8. **Minimum required assets before finishing:** The minimum number and type of required assets before calling `finishInspection` is configurable per `service_type` (stored in `service_types.checklist_template` or a dedicated config). The default minimum is: 1 PHOTO. If the service type requires a SIGNATURE, at least 1 SIGNATURE asset must be `UPLOADED`. Attempting to finish without meeting minimums returns `422 EXECUTION_INSUFFICIENT_ASSETS`.

9. **`done_checked_by_user_id` is NOT set by inspector:** The inspector finishing the inspection triggers the `SCHEDULED → DONE` transition. However, `appointment.done_checked_by_user_id` is set separately by an OP during a cross-check step. The transition to DONE is allowed without the cross-check; the cross-check is an operational verification step that happens after DONE.

10. **Asset upload is presigned URL flow:** The inspector requests a presigned PUT URL from the backend, uploads directly to Supabase Storage (S3-compatible), then calls the confirm endpoint. The backend never proxies the file content.

11. **Allowed MIME types for assets:**

    | Kind | Allowed MIME types |
    |---|---|
    | PHOTO | `image/jpeg`, `image/png`, `image/heic`, `image/webp` |
    | DOCUMENT | `application/pdf`, `image/jpeg`, `image/png` |
    | SIGNATURE | `image/png`, `image/svg+xml` |

12. **Presigned URL TTL:** 15 minutes from issuance. After that, the asset record transitions to `UPLOAD_FAILED` status. Inspector must request a new presigned URL to retry.

13. **Asset upload retry:** If an asset is in `UPLOAD_FAILED` or `PENDING` with expired TTL, the inspector can request a new presigned URL. A new `InspectionAsset` record is created. The old record remains in the database for audit purposes.

14. **Finish requires all referenced assets to be UPLOADED:** The `assets` array in the finish request must reference only `InspectionAsset` records with `status = UPLOADED`. Any asset in `PENDING` or `UPLOAD_FAILED` status blocks the finish operation.

15. **Single execution per appointment:** `InspectionExecution` has a unique constraint on `appointment_id`. A second call to start on the same appointment (without finishing) returns the existing in-progress execution (idempotent).

16. **Checklist JSON structure:** The `checklist_json` field stores inspector responses to the service type's checklist template. The exact schema is defined per service type; this module stores it as generic JSON without deep validation (schema validation is the app's responsibility).

17. **Schedule query scope:** `getInspectorSchedule` only returns appointments assigned to the requesting inspector. It never returns appointments from other inspectors.

18. **Schedule default date range:** By default, the schedule endpoint returns appointments for the requested date only. For multi-day view, the caller queries with different `date` values.

---

## 6. Authorization Matrix

| Endpoint | INSP (own appointments) | INSP (other inspector's appt) | OP/AM | CL_ADMIN/CL_USER |
|---|---|---|---|---|
| GET /v1/inspector/schedule | Allowed | N/A | Denied (403) | Denied (403) |
| GET /v1/inspector/appointments/:id | Allowed | 404 (not found) | Denied (403) | Denied (403) |
| POST .../start | Allowed | 404 | Denied (403) | Denied (403) |
| POST .../finish | Allowed | 404 | Denied (403) | Denied (403) |
| POST .../assets | Allowed | 404 | Denied (403) | Denied (403) |
| PATCH .../assets/:id/confirm | Allowed | 404 | Denied (403) | Denied (403) |

**Note:** OP can finish inspections on behalf of an inspector using the Appointments module's status transition endpoint (`POST /v1/appointments/:id/status-transitions`), not through this module.

---

## 7. Domain Events

### `inspection_execution.started`

```typescript
{
  event: "inspection_execution.started",
  payload: {
    executionId: string,
    appointmentId: string,
    inspectorId: string,
    tenantId: string,
    startedAt: string,
    startLatitude: number,
    startLongitude: number,
  }
}
```

**Consumers:** Notifications module (optional: notify operator that inspection started), Audit log.

### `inspection_execution.finished`

```typescript
{
  event: "inspection_execution.finished",
  payload: {
    executionId: string,
    appointmentId: string,
    inspectorId: string,
    tenantId: string,
    finishedAt: string,
    finishLatitude: number,
    finishLongitude: number,
    assetsCount: number,
    checklistSubmitted: boolean,
  }
}
```

**Consumers:** Billing module (create financial entries for `DONE` appointment); Notifications module (notify agency and operator of completion); Audit log.

### `inspection_execution.asset_uploaded`

```typescript
{
  event: "inspection_execution.asset_uploaded",
  payload: {
    assetId: string,
    appointmentId: string,
    executionId: string,
    inspectorId: string,
    kind: "PHOTO" | "DOCUMENT" | "SIGNATURE",
    storageKey: string,
    sizeBytes: number,
  }
}
```

---

## 8. Queue Jobs

### `inspection-execution.mark-assets-expired` (scheduled cron)

**Purpose:** Mark `PENDING` assets as `UPLOAD_FAILED` when presigned URL has expired.

**Schedule:** Every 5 minutes.

**Logic:**

```sql
UPDATE inspection_assets
SET status = 'UPLOAD_FAILED'
WHERE status = 'PENDING'
  AND upload_expires_at < now();
```

### `inspection-execution.notify-not-started` (scheduled cron)

**Purpose:** Alert operator when an inspection is still `IN_PROGRESS` (execution started but not finished) more than 6 hours after `started_at`.

**Schedule:** Hourly.

**Logic:** Query `InspectionExecution` where `finished_at IS NULL` AND `started_at < now() - interval '6 hours'`. Emit internal alert event per record.

---

## 9. External Integrations

### Supabase Storage (S3-compatible)

**Usage:** Presigned PUT URL generation and HEAD verification for inspection assets.

**Bucket name:** `inspection-assets` (configurable via `STORAGE_BUCKET_INSPECTION_ASSETS` env var).

**Presigned URL generation (SDK call):**

```typescript
const { data, error } = await supabaseStorageClient
  .from('inspection-assets')
  .createSignedUploadUrl(storageKey);
// TTL: 900 seconds (15 min)
```

**HEAD verification (after inspector reports upload):**

```typescript
// Use AWS SDK S3 HeadObject or Supabase storage info
const { data } = await supabaseStorageClient
  .from('inspection-assets')
  .info(storageKey);
// If data is null → object does not exist → UPLOAD_FAILED
```

**Storage key pattern:** `inspections/{tenantId}/{appointmentId}/{assetId}.{extension}`

**File size limit:** 25 MB per asset. Enforced at presigned URL policy level (S3 Content-Length-Range condition) and validated at confirm step.

---

## 10. Test Scenarios

### Unit Tests (Vitest)

#### T-1 visibility rule

- **PASS:** ROUTINE appointment with `CONFIRMED` status visible at T-1.
- **PASS:** INGOING appointment always visible when `SCHEDULED`.
- **PASS:** ROUTINE with `keyRequired = true` visible at T-1 regardless of confirmation.
- **FAIL:** ROUTINE with `PENDING` confirmation at T-1 → excluded from schedule.
- **PASS:** ROUTINE with `CONFIRMED` status visible for future dates beyond T-1.

#### `startInspection` use case

- Creates `InspectionExecution` with correct coordinates and timestamps.
- Returns existing execution if `appointment_id` already has one (idempotent start).
- Rejects when `appointment.status != SCHEDULED`.
- Rejects when `inspector_id` does not match.
- Rejects duplicate idempotency key: returns cached response without DB write.
- Validates coordinate range: `latitude > 90` → `VALIDATION_ERROR`.

#### `finishInspection` use case

- Sets `finished_at`, triggers `SCHEDULED → DONE` transition.
- Rejects with `EXECUTION_NOT_STARTED` if no execution record.
- Rejects with `EXECUTION_ALREADY_FINISHED` on second call (without matching idempotency key).
- Idempotent: same `Idempotency-Key` on second call returns cached response.
- Rejects if any asset in `assets` array has `status = PENDING`.
- Rejects if minimum asset count not met.

#### `requestAssetUploadUrl` use case

- Returns presigned URL and creates `InspectionAsset` with `status = PENDING`.
- Rejects `ASSET_MIME_TYPE_NOT_ALLOWED` for unsupported types.
- Rejects `EXECUTION_ALREADY_FINISHED` if execution complete.

#### `confirmAssetUpload` use case

- Sets `status = UPLOADED` and `size_bytes` when S3 object found.
- Sets `status = UPLOAD_FAILED` when S3 HEAD returns 404.
- Returns `ASSET_UPLOAD_EXPIRED` when `upload_expires_at < now()`.
- Idempotent: already `UPLOADED` returns success.

### Integration Tests (Supertest)

#### Full inspection flow

1. `GET /v1/inspector/schedule` → appointment visible for today.
2. `POST /start` → 201, execution created.
3. `POST /assets` → 201, presigned URL returned.
4. Mock S3 upload confirmation.
5. `PATCH /assets/:id/confirm` → 200, `status = UPLOADED`.
6. `POST /finish` with `assets: [{ assetId, storageKey }]` → 200, `appointmentStatus = DONE`.
7. Verify appointment `status = DONE` in DB.
8. Verify `InspectionExecution.finished_at` set.
9. Verify `inspection_execution.finished` event emitted.

#### T-1 filter

- Setup: ROUTINE appointment for tomorrow with `PENDING` confirmation.
- `GET /schedule?date={tomorrow}` → appointment NOT in response.
- Update `tenantConfirmationStatus = CONFIRMED`.
- `GET /schedule?date={tomorrow}` → appointment IS in response.

#### Idempotency

- `POST /start` with key `abc123` → 201, creates execution.
- `POST /start` with same key `abc123` → 201, same execution ID returned, no DB duplicate.

#### Role enforcement

- OP JWT calling `GET /v1/inspector/schedule` → 403.
- CL_ADMIN JWT calling `POST /v1/inspector/appointments/:id/start` → 403.

#### Asset retry

- Request upload URL (asset status = PENDING).
- Advance time past 15-min TTL.
- Cron job marks asset as `UPLOAD_FAILED`.
- Request new upload URL → new asset record created, new presigned URL returned.
- Confirm new upload → status = UPLOADED.
- Finish inspection with new asset → succeeds.

### Edge Cases

- Finish with empty `assets` array when service type requires PHOTO → `EXECUTION_INSUFFICIENT_ASSETS`.
- Start when appointment already `DONE` → `APPOINTMENT_NOT_FOUND` (status guard).
- `GET /schedule` for a date with no scheduled appointments → returns empty array (not 404).
- Asset MIME type `image/heic` (iPhone native) → allowed for PHOTO.
- Asset file size > 25 MB → presigned URL policy rejects at S3 level before confirm step.
