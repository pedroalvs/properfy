# Appointment Import Endpoints

**Feature**: `006-appointments`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/appointment/interfaces/appointment.routes.ts`, `apps/backend/src/modules/appointment/application/use-cases/import-appointments.use-case.ts`

---

## POST `/v1/appointments/import`

Upload an XLSX or CSV file to bulk-create appointments. Asynchronous — returns `202 Accepted` with an `importId`.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`, `CL_ADMIN`
- **Rate limit**: 5 req/min per client
- **Content type**: `multipart/form-data`
- **Required header**: `Idempotency-Key` (any string; scope `appointment.import`, 24 h retention)

**Behavior**

1. If a cached result exists for the `Idempotency-Key`, it is returned immediately. See GAP-004 for the payload-hash gap.
2. Otherwise, the file is uploaded to Supabase Storage at `imports/appointments/<importId>/<filename>`.
3. An `AppointmentImport` row is created in `PENDING`.
4. An `appointment.import` job is enqueued; the worker parses rows, invokes `CreateAppointmentUseCase` per row (supporting inline property creation), and updates `total_rows`, `success_count`, `error_count`, `errors_json`.

**Response 202**

```json
{
  "data": {
    "importId": "<uuid>",
    "status": "PENDING",
    "acceptedCount": 0,
    "warningCount": 0,
    "errorCount": 0
  }
}
```

Counters are zero on the initial response — clients must poll the status endpoint.

**Error codes**: `AUTH_FORBIDDEN`, `VALIDATION_ERROR` (missing header, missing file, unsupported extension, missing tenant context), `TOO_MANY_REQUESTS` (429).

---

## GET `/v1/appointments/import/:importId`

Poll the status of a bulk import.

- **Auth**: required
- **Allowed roles**: all authenticated roles with access to the tenant that owns the import.

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "tenantId": "<uuid>",
    "status": "PENDING|PROCESSING|DONE|FAILED",
    "originalFilename": "string",
    "totalRows": 0,
    "successCount": 0,
    "errorCount": 0,
    "errorsJson": [
      { "row": 2, "field": "scheduledDate", "code": "INVALID_DATE", "message": "Past date" }
    ],
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `NOT_FOUND`.
