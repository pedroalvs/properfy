# Property Import Endpoints

**Feature**: `003-properties`
**Status**: IMPLEMENTED (`implementation decision` — dossiê defines import layout for appointments, not properties; property import reuses the same infrastructure pattern)
**Source**: `apps/backend/src/modules/property/interfaces/property.routes.ts`, `apps/backend/src/modules/property/application/use-cases/import-properties.use-case.ts`

---

## POST `/v1/properties/import`

Upload an XLSX or CSV file to bulk-create properties. Asynchronous — the endpoint returns `202 Accepted` with an `importId` that the client polls via `GET /v1/properties/import/:importId`.

- **Auth**: required
- **Allowed roles**: `AM` (any tenant); `OP`, `CL_ADMIN` (own tenant only)
- **Rate limit**: 5 req/min per client
- **Content type**: `multipart/form-data`
- **Required header**: `Idempotency-Key` (any string; scope is `property.import`, retention 24 h)

**Request**

- `file` part — must have extension `.xlsx` or `.csv`.
- `Idempotency-Key` header — required.

**Behavior**

1. If the `(idempotencyKey, 'property.import')` pair has a cached result, it is returned immediately (see GAP-006 regarding payload hash verification).
2. Otherwise, the file is uploaded to Supabase Storage at `imports/properties/<importId>/<filename>`.
3. A `PropertyImport` row is created with `status = PENDING`.
4. A `property.import` job is enqueued; the worker parses rows, inserts properties, and updates the import record with `total_rows`, `success_count`, `error_count`, and `errors_json`.
5. The idempotency cache is written with the returned response body.

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

> `acceptedCount`, `warningCount`, and `errorCount` are zero on the initial response. The worker updates the persisted record; clients must poll the status endpoint for the final numbers.

**Error codes**

- `VALIDATION_ERROR` — missing `Idempotency-Key` header, missing file, unsupported extension, missing tenant context.
- `AUTH_FORBIDDEN` — caller role is not allowed.
- `TOO_MANY_REQUESTS` — rate limit exceeded (HTTP 429).

---

## GET `/v1/properties/import/:importId`

Poll the status of an import job.

- **Auth**: required
- **Allowed roles**: all authenticated roles with access to the tenant that owns the import. Use-case scoping details are in `get-property-import-status.use-case.ts`.

**Path params**

| Name | Type | Notes |
|---|---|---|
| `importId` | uuid | |

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
      { "row": 2, "field": "postcode", "code": "INVALID_FORMAT", "message": "Postcode must be 4 digits" }
    ],
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

`errorsJson` is omitted (or null) until the worker has processed the file. The shape of each entry is not strictly validated in Phase 1 (tracked as candidate for formalization alongside GAP-008).

**Error codes**: `AUTH_FORBIDDEN`, `NOT_FOUND`.
