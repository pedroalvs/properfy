# Audit Endpoints

**Feature**: `011-reports-audit`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/audit/interfaces/audit.routes.ts`, `packages/shared/src/schemas/audit.ts`

One endpoint: the audit log read surface. There is NO write endpoint — every audit entry is written internally via `PersistentAuditService.log()` by the feature that produces the event.

---

## GET `/v1/audit-logs`

List audit log entries with filters and pagination. Restricted to platform operators.

- **Auth**: required
- **Allowed roles**: `AM` (cross-tenant), `OP` (cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 — optional `?tenantId=` narrows the view). CL_ADMIN has tenant-scoped read access (feature 020, closes 011#GAP-002). CL_USER, INSP are forbidden. Superseded phrasing: "OP (own tenant only — scoped by `tenantId` from JWT)".

**Query params** (`listAuditLogsQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | Standard pagination. |
| `entityType` | string | e.g., `Appointment`, `Tenant`, `FinancialEntry`. |
| `entityId` | uuid | Often combined with `entityType` for entity history queries. |
| `actorId` | uuid | Only meaningful when `actorType = USER`. |
| `action` | string | Dot-separated code (e.g., `appointment.status_transition`). |
| `fromDate`, `toDate` | date | Optional bounds. |
| `sortBy`, `sortOrder` | | Standard. |

> `tenantId` is NOT accepted as a query param — OP is always scoped to their own tenant, AM sees all.

**Response 200** (`auditLogResponseSchema`)

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid|null>",
      "actorType": "USER|SYSTEM|ANONYMOUS",
      "actorId": "<uuid|null>",
      "actorName": "Jane Doe",
      "entityType": "Appointment",
      "entityId": "<uuid|null>",
      "action": "appointment.status_transition",
      "reason": "string|null",
      "beforeJson": { "status": "SCHEDULED" },
      "afterJson": { "status": "DONE" },
      "requestId": "string|null",
      "ipAddress": "string|null",
      "metadataJson": { "...": "..." },
      "createdAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1842
}
```

- `actorName` is resolved server-side: user name for `USER`, literal `"System"` for `SYSTEM`, `null` for `ANONYMOUS`.
- `beforeJson` and `afterJson` contain raw snapshots — clients must render them carefully and avoid exposing PII to unauthorized eyes.

**Error codes**: `AUTH_FORBIDDEN` (CL, INSP, or unauthenticated), `VALIDATION_ERROR` (invalid filter params).
