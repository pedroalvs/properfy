# Execution Endpoints (PWA)

**Feature**: `008-inspectors-execution`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/inspector-execution/interfaces/inspector-execution.routes.ts`, `packages/shared/src/schemas/inspector-execution.ts`

All endpoints require an `INSP` actor with `inspectorId` set in the JWT claims.

---

## GET `/v1/inspector/schedule`

List the inspector's appointments, filtered by the T-1 visibility rule.

- **Auth**: required
- **Allowed roles**: `INSP` only

**Query params** (`inspectorScheduleQuerySchema`)

| Name | Type | Required | Notes |
|---|---|---|---|
| `dateFrom` | date | no | Inclusive. Defaults to today. |
| `dateTo` | date | no | Inclusive. Defaults to a few days ahead. |

**Response 200** (`inspectorScheduleResponseSchema`): grouped schedule items including appointment summary, property, scheduled time, key info, service type, and `canStart` flag.

> T-1 visibility is applied server-side: `ROUTINE` appointments with `tenantConfirmationStatus = PENDING` and no `keyRequired` are excluded on day-of and day-before. `INGOING`/`OUTGOING` and any `CONFIRMED` / `keyRequired=true` appointment is always visible.

**Error codes**: `AUTH_FORBIDDEN` (non-INSP), `INSPECTOR_NOT_LINKED`, `VALIDATION_ERROR`.

---

## GET `/v1/inspector/appointments/:appointmentId`

Read a single appointment's detail from the inspector's perspective.

- **Auth**: required
- **Allowed roles**: `INSP` assigned to this appointment.

**Response 200** (`inspectorAppointmentDetailResponseSchema`): appointment summary + property + contact + restrictions + current execution state + uploaded assets.

**Error codes**: `AUTH_FORBIDDEN`, `APPOINTMENT_NOT_FOUND` (used for cross-tenant / non-assigned to prevent existence leakage).

---

## POST `/v1/inspector/appointments/:appointmentId/start`

Start an inspection.

- **Auth**: required
- **Allowed roles**: `INSP` assigned
- **Required header**: `Idempotency-Key`
- **Audit**: yes (`inspection_execution.started` + `inspection.started` on appointment timeline)

**Request body** (`startInspectionSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `latitude` | number | yes | Decimal ~7 places. |
| `longitude` | number | yes | Decimal ~7 places. |

**Response 201** (`inspectionExecutionResponseSchema`)

```json
{
  "data": {
    "executionId": "<uuid>",
    "appointmentId": "<uuid>",
    "startedAt": "ISO-8601",
    "startLatitude": -33.8688,
    "startLongitude": 151.2093,
    "status": "IN_PROGRESS"
  }
}
```

Idempotent: replaying with the same key (or calling start again on an unfinished execution) returns the existing row.

**Error codes**: `AUTH_FORBIDDEN`, `INSPECTOR_NOT_LINKED`, `APPOINTMENT_NOT_FOUND` (not assigned, or wrong status), `EXECUTION_T1_BLOCKED`, `EXECUTION_TIME_WINDOW_EXCEEDED`, `EXECUTION_ALREADY_FINISHED`, `IDEMPOTENCY_KEY_MISSING`, `VALIDATION_ERROR`.

---

## POST `/v1/inspector/appointments/:appointmentId/assets`

Request a presigned upload URL for an asset.

- **Auth**: required
- **Allowed roles**: `INSP` assigned, execution started and not finished.

**Request body** (`requestAssetUploadSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `PHOTO\|DOCUMENT\|SIGNATURE` | yes | |
| `mimeType` | string | yes | Must be in the whitelist for the declared `kind`. |
| `fileName` | string | yes | Used to derive storage key extension. |

**Response 201** (`inspectionAssetResponseSchema`)

```json
{
  "data": {
    "assetId": "<uuid>",
    "uploadUrl": "https://...",
    "storageKey": "inspections/<tenantId>/<appointmentId>/<assetId>.jpg",
    "expiresAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `INSPECTOR_NOT_LINKED`, `EXECUTION_NOT_STARTED`, `EXECUTION_ALREADY_FINISHED`, `ASSET_MIME_TYPE_NOT_ALLOWED`, `APPOINTMENT_NOT_FOUND`.

---

## PATCH `/v1/inspector/appointments/:appointmentId/assets/:assetId/confirm`

Confirm that the asset has been uploaded to storage.

- **Auth**: required
- **Allowed roles**: `INSP` assigned.

**Request body**: none.

**Response 200**: asset row with `status = UPLOADED`.

**Error codes**: `AUTH_FORBIDDEN`, `ASSET_NOT_FOUND`, `ASSET_UPLOAD_EXPIRED`, `ASSET_UPLOAD_NOT_FOUND_IN_STORAGE`.

---

## POST `/v1/inspector/appointments/:appointmentId/finish`

Finish an inspection. Triggers `SCHEDULED → DONE` via feature 006 `ExecuteStatusTransitionUseCase`.

- **Auth**: required
- **Allowed roles**: `INSP` assigned, execution started and not finished.
- **Required header**: `Idempotency-Key`
- **Audit**: yes (`inspection_execution.finished` + `inspection.finished` + `appointment.status_transition` + `appointment.done_pending_crosscheck`)

**Request body** (`finishInspectionSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `latitude` | number | yes | Finish coordinates. |
| `longitude` | number | yes | |
| `checklistJson` | object | no | Must be non-empty if provided. |
| `notes` | string | no | |
| `assets` | array of `{ assetId, storageKey }` | no | Assets referenced for inclusion — must all be `UPLOADED`. |

**Response 200** (`inspectionExecutionResponseSchema`)

```json
{
  "data": {
    "executionId": "<uuid>",
    "appointmentId": "<uuid>",
    "startedAt": "ISO-8601",
    "finishedAt": "ISO-8601",
    "appointmentStatus": "DONE",
    "assetsCount": 6
  }
}
```

> The appointment is now in `DONE` but the financial entries have NOT been created. A separate operator cross-check (feature 006 `POST /v1/appointments/:id/cross-check-done`) is required before billing runs.

**Error codes**: `AUTH_FORBIDDEN`, `INSPECTOR_NOT_LINKED`, `EXECUTION_NOT_STARTED`, `EXECUTION_ALREADY_FINISHED`, `EXECUTION_ASSET_UPLOAD_PENDING`, `EXECUTION_INSUFFICIENT_ASSETS`, `EXECUTION_EMPTY_CHECKLIST`, `IDEMPOTENCY_KEY_MISSING`, `APPOINTMENT_NOT_FOUND`.

---

## GET `/v1/inspector/offers`

PWA-convenience alias for the marketplace list. Delegates to feature 005 `GetMarketplaceOffersUseCase`. The canonical path is `GET /v1/marketplace/offers`.

- **Auth**: required
- **Allowed roles**: `INSP` only

**Query params**: same as `listMarketplaceOffersQuerySchema` (pagination).

**Response 200**: same shape as feature 005 marketplace offers.
