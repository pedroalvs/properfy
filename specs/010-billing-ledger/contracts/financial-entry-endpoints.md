# Financial Entry Endpoints

**Feature**: `010-billing-ledger`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/billing/interfaces/billing.routes.ts`, `packages/shared/src/schemas/billing.ts`

All endpoints require a Bearer JWT.

---

## GET `/v1/financial/entries/summary`

Aggregate ledger totals by type, optionally scoped to a tenant.

- **Auth**: required
- **Allowed roles**: AM (any tenant); OP (own tenant only); CL_ADMIN, CL_USER (own tenant only, `tenantId` is ignored)

**Query params**

| Name | Type | Notes |
|---|---|---|
| `tenantId` | uuid | AM only (OP is auto-scoped to own tenant). |

**Response 200**

```json
{
  "data": {
    "totalDebits": 12500.00,
    "totalPayouts": 7800.00,
    "totalAdjustments": 120.50,
    "totalRefunds": 250.00,
    "pendingCount": 6,
    "currency": "AUD"
  }
}
```

> `currency` is `null` when the summary crosses tenants with different currencies.

---

## GET `/v1/financial/entries`

List financial entries with filters and pagination.

- **Auth**: required
- **Allowed roles**: AM (any tenant); OP (own tenant); CL_ADMIN, CL_USER (own tenant)

**Query params** (`listFinancialEntriesQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | Pagination. |
| `tenantId` | uuid | AM only (OP is auto-scoped to own tenant). |
| `appointmentId` | uuid | |
| `inspectorId` | uuid | |
| `entryType` | `TENANT_DEBIT\|INSPECTOR_PAYOUT\|REFUND\|MANUAL_ADJUSTMENT` | |
| `status` | `PENDING\|APPROVED\|CANCELLED` | |
| `effectiveFrom`, `effectiveTo` | date | |
| `sortBy`, `sortOrder` | | |

**Response 200** (`financialEntryResponseSchema`)

```json
{
  "data": [
    {
      "id": "<uuid>",
      "tenantId": "<uuid>",
      "appointmentId": "<uuid|null>",
      "inspectorId": "<uuid|null>",
      "entryType": "TENANT_DEBIT|INSPECTOR_PAYOUT|REFUND|MANUAL_ADJUSTMENT",
      "amount": 250.00,
      "currency": "AUD",
      "status": "PENDING|APPROVED|CANCELLED",
      "description": "string",
      "effectiveAt": "ISO-8601",
      "initiatedByUserId": "<uuid>",
      "approvedByUserId": "<uuid|null>",
      "approvedAt": "ISO-8601|null",
      "referenceEntryId": "<uuid|null>",
      "reason": "string|null",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 137
}
```

---

## GET `/v1/financial/entries/:entryId`

Read a single entry.

- **Auth**: required
- **Allowed roles**: same as list

**Response 200**: same shape as list item.

**Error codes**: `ENTRY_NOT_FOUND`, `AUTH_FORBIDDEN`.

---

## POST `/v1/financial/entries/:entryId/approve` (also PATCH variant)

Approve a `PENDING` entry. Two-person rule — approver MUST differ from initiator.

- **Auth**: required
- **Allowed roles**: AM, OP
- **Audit**: yes (`financial_entry.approved`)

**Request body**: none.

**Response 200**

```json
{
  "data": {
    "id": "<uuid>",
    "status": "APPROVED",
    "approvedBy": "<uuid>",
    "approvedAt": "ISO-8601"
  }
}
```

**Error codes**: `AUTH_FORBIDDEN`, `ENTRY_NOT_FOUND`, `ENTRY_NOT_PENDING`, `ENTRY_SELF_APPROVAL_NOT_ALLOWED`.

---

## POST `/v1/financial/entries/adjust`

Create a manual adjustment entry.

- **Auth**: required
- **Allowed roles**: AM, OP
- **Audit**: yes (`financial_entry.manual_adjustment_created`)
- **Optional header**: `Idempotency-Key` (scope `manual-adjustment`, 24 h)

**Request body** (`createManualAdjustmentSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenantId` | uuid | yes | Must be active. |
| `appointmentId` | uuid | no | Must belong to the target tenant if provided. |
| `inspectorId` | uuid | no | Must be active and eligible for the target tenant. |
| `amount` | number (decimal 2 places) | yes | Sign convention: always positive; the entry type defines direction. |
| `description` | string (1..500) | yes | |
| `reason` | string | yes | Free-form reason — audited. |
| `effectiveAt` | date-time | no | Default `now()`. |
| `referenceEntryId` | uuid | no | Must belong to the target tenant if provided. |

**Response 201**: full entry payload with `entryType = MANUAL_ADJUSTMENT` and `status = PENDING`.

**Error codes**: `AUTH_FORBIDDEN`, `TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `APPOINTMENT_NOT_FOUND`, `INSPECTOR_NOT_FOUND`, `ENTRY_NOT_FOUND` (for reference), `VALIDATION_ERROR`.

---

## POST `/v1/financial/entries/:entryId/refund`

Create a refund against an approved `TENANT_DEBIT`. One refund per debit; amount is always the full original amount.

- **Auth**: required
- **Allowed roles**: AM, OP
- **Audit**: yes (`financial_entry.refund_created`)
- **Optional header**: `Idempotency-Key` (scope `refund`, 24 h)

**Request body** (`createRefundSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string (1..500) | yes | |
| `reason` | string | yes | Audited. |

**Response 201**: full entry payload with `entryType = REFUND`, `amount = original.amount`, `referenceEntryId = original.id`, `status = PENDING`.

**Error codes**: `AUTH_FORBIDDEN`, `ENTRY_NOT_FOUND`, `ENTRY_NOT_REFUNDABLE` (not an approved debit), `REFUND_ALREADY_EXISTS`.
