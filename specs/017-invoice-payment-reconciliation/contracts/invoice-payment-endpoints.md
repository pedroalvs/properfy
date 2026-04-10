# Contract: Invoice Payment Endpoints

**Feature**: 017-invoice-payment-reconciliation
**Type**: REST endpoints under canonical `/v1/billing/invoices/*`

## Overview

Four endpoints: one extended, three new. All require AM or OP role. All write endpoints support `Idempotency-Key` header.

---

## 1. POST /v1/billing/invoices/:id/mark-paid (EXTENDED)

Marks a single invoice as paid. The endpoint already exists; this feature extends its request body.

### Request

```http
POST /v1/billing/invoices/:invoiceId/mark-paid
Authorization: Bearer <jwt>
Idempotency-Key: <optional uuid>
Content-Type: application/json

{
  "paidAt": "2026-04-10T12:00:00.000Z",      // optional, defaults to now
  "paymentReference": "BT-20260410-1234"     // optional, max 255 chars — NEW in 017
}
```

### Response (200)

```json
{
  "id": "<invoiceId>",
  "status": "PAID",
  "paidAt": "2026-04-10T12:00:00.000Z",
  "paidByUserId": "<actor user id>",          // NEW
  "paymentReference": "BT-20260410-1234"      // NEW
}
```

### Errors

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Actor is not AM or OP |
| `INVOICE_NOT_FOUND` | 404 | No invoice with that id |
| `INVOICE_NOT_CLOSED` | 409 | Invoice is in `OPEN` or `SUPERSEDED` status |
| `INVOICE_ALREADY_PAID` | 409 | Invoice is already `PAID` |
| `INVOICE_PAYMENT_DATE_INVALID` | 400 | `paidAt` is in the future OR before `generatedAt` |
| `VALIDATION_ERROR` | 400 | Body fails Zod validation |

---

## 2. POST /v1/billing/invoices/batch-mark-paid (NEW)

Marks multiple invoices as paid in a single request. Skips already-paid or non-closed invoices without failing.

### Request

```http
POST /v1/billing/invoices/batch-mark-paid
Authorization: Bearer <jwt>
Idempotency-Key: <optional uuid>
Content-Type: application/json

{
  "invoiceIds": ["<id1>", "<id2>", "<id3>", "..."],  // required, non-empty
  "paidAt": "2026-04-10T12:00:00.000Z",               // optional, default now
  "paymentReference": "BT-BATCH-20260410"             // optional, shared across batch
}
```

### Response (200)

```json
{
  "processed": [
    { "id": "<id1>", "status": "PAID" },
    { "id": "<id3>", "status": "PAID" }
  ],
  "skipped": [
    { "id": "<id2>", "reason": "ALREADY_PAID" },
    { "id": "<id4>", "reason": "NOT_CLOSED" },
    { "id": "<id5>", "reason": "NOT_FOUND" }
  ]
}
```

### Semantics

- Each processed invoice produces an **individual audit record** (FR-009). Batch is not logged as a single aggregate event.
- Skipped invoices do NOT abort the batch. They appear in the `skipped` array with the reason.
- If ALL invoices are skipped, the response is still `200` with an empty `processed` array.
- `paidAt` and `paymentReference` are shared across all processed invoices.
- Tenant scope: each invoice is validated individually; OP can only process invoices belonging to their tenant's inspectors.

### Errors

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Actor is not AM or OP |
| `VALIDATION_ERROR` | 400 | Empty array, paidAt in future, etc. |
| `INVOICE_PAYMENT_DATE_INVALID` | 400 | `paidAt` is in the future (shared value) |

**Note**: Per-invoice errors (not found, already paid, not closed) do NOT return HTTP errors — they appear in the `skipped` array.

---

## 3. POST /v1/billing/invoices/:id/reverse-payment (NEW)

Reverses a payment recording, transitioning `PAID → CLOSED`.

### Request

```http
POST /v1/billing/invoices/:invoiceId/reverse-payment
Authorization: Bearer <jwt>
Idempotency-Key: <optional uuid>
Content-Type: application/json

{
  "reason": "Bank transfer was rejected and funds returned"  // required, min length 1, max 1000
}
```

### Response (200)

```json
{
  "id": "<invoiceId>",
  "status": "CLOSED",
  "paidAt": null,
  "paidByUserId": null,
  "paymentReference": null
}
```

### Errors

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Actor is not AM or OP |
| `INVOICE_NOT_FOUND` | 404 | No invoice with that id |
| `INVOICE_NOT_PAID` | 409 | Invoice is not in `PAID` status |
| `VALIDATION_ERROR` | 400 | Missing or empty reason |

---

## 4. GET /v1/billing/invoices/reconciliation-summary (NEW)

Aggregated reconciliation view for a date range.

### Request

```http
GET /v1/billing/invoices/reconciliation-summary?from=2026-04-01&to=2026-04-30&inspectorId=<optional uuid>
Authorization: Bearer <jwt>
```

### Query Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `from` | date (YYYY-MM-DD) | Yes | Inclusive lower bound on `generatedAt` |
| `to` | date (YYYY-MM-DD) | Yes | Inclusive upper bound on `generatedAt` |
| `inspectorId` | UUID | No | Filter to a specific inspector |

### Response (200)

```json
{
  "from": "2026-04-01",
  "to": "2026-04-30",
  "inspectorId": null,
  "currency": "AUD",
  "totalInvoicedAmount": 12500.00,
  "totalPaidAmount": 9800.00,
  "totalUnpaidAmount": 2700.00,
  "paidCount": 14,
  "unpaidCount": 3
}
```

### Invariant

`totalInvoicedAmount === totalPaidAmount + totalUnpaidAmount` (within a single currency scope)

### Errors

| Code | HTTP | When |
|------|------|------|
| `FORBIDDEN` | 403 | Actor is not AM or OP |
| `VALIDATION_ERROR` | 400 | Missing or malformed query params |
| `MULTI_CURRENCY_SCOPE` | 400 | Scope contains invoices in multiple currencies — request must narrow filters |

---

## Unchanged Endpoints

- `GET /v1/billing/invoices` — now returns `paidByUserId` and `paymentReference` when present (optional fields in response schema)
- `GET /v1/billing/invoices/:id` — same addition
- `POST /v1/billing/invoices/generate` — untouched
- `GET /v1/billing/invoices/:id/download` — untouched

## Legacy Routes

The deprecated `/v1/invoices/*` prefix does NOT receive the new endpoints. It remains frozen until the November 2026 sunset. The extended `mark-paid` body is also NOT mirrored to the legacy prefix; legacy clients continue to send `{ paidAt }` only and do not record `paymentReference`.

## Backward Compatibility

- Extended `markInvoicePaidSchema` adds optional fields — existing callers continue to work
- Response schemas add optional `paidByUserId` / `paymentReference` — existing consumers ignore unknown fields
- No breaking changes to any existing endpoint
