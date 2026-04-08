# Inspector Invoice Endpoints

**Feature**: `010-billing-ledger`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/billing/interfaces/billing.routes.ts`, `packages/shared/src/schemas/billing.ts`

All endpoints require a Bearer JWT. **Two path variants coexist**: `/v1/invoices/*` and `/v1/billing/invoices/*`. Both delegate to the same use cases. New clients should prefer `/v1/billing/invoices/*` (tracked as GAP-010 for future consolidation).

---

## POST `/v1/invoices/generate` (also `/v1/billing/invoices/generate`)

Generate an inspector invoice closing a billing period. Sums approved `INSPECTOR_PAYOUT` entries in the date range and enqueues PDF generation asynchronously.

- **Auth**: required
- **Allowed roles**: AM, OP
- **Audit**: yes (`invoice.generated`)

**Request body** (`generateInvoiceSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `inspectorId` | uuid | yes | |
| `periodStart` | date (`YYYY-MM-DD`) | yes | Inclusive. Interpreted as UTC. |
| `periodEnd` | date (`YYYY-MM-DD`) | yes | Inclusive. Interpreted as UTC. |
| `periodType` | `WEEKLY\|BIWEEKLY\|MONTHLY` | no | Default `BIWEEKLY` (`implementation decision` — dossiê lists all three as options but does not mandate a default). |
| `currency` | string (3 chars) | no | Default `AUD` (`implementation decision` — not specified as default in the dossiê). |

**Response 202** (`invoiceResponseSchema`)

```json
{
  "data": {
    "id": "<uuid>",
    "inspectorId": "<uuid>",
    "periodStart": "2026-04-01",
    "periodEnd": "2026-04-14",
    "periodType": "BIWEEKLY",
    "status": "CLOSED",
    "totalAmount": 4320.00,
    "currency": "AUD",
    "fileKey": null,
    "generatedByUserId": "<uuid>",
    "generatedAt": "ISO-8601",
    "paidAt": null,
    "notes": null,
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  }
}
```

> `fileKey` is `null` on the initial response — the PDF worker populates it asynchronously.

**Idempotency**: an exact-match request (`inspectorId + periodStart + periodEnd`) returns the existing invoice without creating a new row.

**Error codes**: `AUTH_FORBIDDEN`, `INVOICE_PERIOD_OVERLAP` (overlapping but non-identical period), `VALIDATION_ERROR`.

---

## GET `/v1/invoices` (also `/v1/billing/invoices`)

List invoices with filters and pagination.

- **Auth**: required
- **Allowed roles**: AM (any inspector); OP (inspectors eligible for own tenant); INSP (own invoices only)

**Query params** (`listInvoicesQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | |
| `inspectorId` | uuid | AM any; OP scoped to own tenant's eligible inspectors; INSP locked to own. |
| `status` | `OPEN\|CLOSED\|PAID` | |
| `periodFrom`, `periodTo` | date | |
| `sortBy`, `sortOrder` | | |

**Response 200**: paginated invoices (same shape as generate response).

---

## GET `/v1/invoices/:invoiceId` (also `/v1/billing/invoices/:invoiceId`)

Read a single invoice.

- **Auth**: required
- **Allowed roles**: AM, OP; INSP (own invoice)

**Response 200**: full invoice payload.

**Error codes**: `INVOICE_NOT_FOUND`, `AUTH_FORBIDDEN`.

---

## GET `/v1/invoices/:invoiceId/download` (also `/v1/billing/invoices/:invoiceId/download`)

Return a presigned URL to download the invoice PDF.

- **Auth**: required
- **Allowed roles**: AM, OP; INSP (own invoice)

**Response 200** (`invoiceDownloadResponseSchema`)

```json
{
  "data": {
    "url": "https://...",
    "expiresAt": "ISO-8601"
  }
}
```

**Error codes**: `INVOICE_NOT_FOUND`, `AUTH_FORBIDDEN`, `INVOICE_NOT_READY` (invoice not in `CLOSED` or `PAID`), `INVOICE_FILE_NOT_GENERATED` (worker hasn't produced the file yet).
