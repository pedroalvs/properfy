# Phase 1 — API Contract Deltas

All deltas are expand-only. After the code change, regenerate with `pnpm generate:api` and commit
both `apps/backend` `openapi.json` and `packages/shared/src/api-types.ts`. Every new response field
must be declared in the route's response schema (the serializer strips undeclared fields and throws
on a nullable value typed as required).

## Inspector-program (reward) routes

| Route | Change |
|---|---|
| `POST /v1/inspector-program/awards/:awardId/approve` | Response gains `financialEntryId: string`. Same error set. |
| `POST /v1/inspector-program/awards/:awardId/void` | Action `awards.void`. If the reward is invoiced (`inspector_invoice_id` not null) or `PAID`, requires `awards.void_invoiced` (AM only) → else `403 FORBIDDEN` "Only an Admin Master can void an invoiced reward". Body stays `{ reason: 5–500, inspectorNote?: 1–200 }` `.strict()` (no `recoveryNote`). `409 INVOICE_LINES_CHANGED` does not apply here. |
| `GET /v1/inspector-program/awards`, `GET /v1/inspector-program/summary` | Each award item gains `financialEntryId: string \| null`, `invoice: { id, invoiceNumberDisplay, status } \| null`, `voidedAfterInvoicing: boolean`. `totals.paid` = sum of `PAID` rewards. |

## Financial entry routes

| Route | Change |
|---|---|
| `GET /v1/financial/entries` | `type` accepts `INSPECTOR_BONUS` (AM, OP, INSP). CL → existing `403` on `type=INSPECTOR_BONUS`. Item `tenantId` may be `null`. INSP with no `type` returns payouts **and** bonuses; OP sees the platform bonus via `includePlatformBonus`. |
| `GET /v1/financial/entries/:id` | CL → `404` on a bonus id; INSP → only its own (both `INSPECTOR_PAYOUT`/`INSPECTOR_BONUS`). |
| `GET /v1/financial/entries/summary` (AM/OP) | Gains `totalBonuses`. |
| `POST /v1/financial/entries/:entryId/{void,approve,cancel,refund}`, `PATCH /v1/financial/entries/:entryId` | `409 BONUS_ENTRY_MANAGED_BY_REWARD` "Bonus entries are managed from Goals & rewards." on a bonus entry. |

## Billing / inspector-invoice routes

| Route | Change |
|---|---|
| `POST /v1/inspector/invoices/request`, `GET /v1/inspector/invoices/preview` | Count bonuses in `payoutCount`; request returns `422 INVOICE_NON_POSITIVE_TOTAL` "This period has no amount to invoice." when the period total ≤ 0. |
| `POST /v1/billing/invoices/:invoiceId/approve-draft` | `409 INVOICE_LINES_CHANGED` "Invoice lines changed. Try again." when the linked-reward count ≠ the `BONUS` lines with an original `rewardAwardId`. |
| `GET /v1/billing/invoices/:invoiceId` | `lineItemsSnapshot[i]` gains `kind`, `entryId`, `rewardAwardId`, `description`; `appointmentId`/`appointmentCode` null on a `BONUS` line. |
| `POST /v1/billing/invoices/:invoiceId/mark-paid`, `/batch-mark-paid`, `/:invoiceId/reverse-payment`, `/:invoiceId/reject-draft` | No contract change. Side effect on linked rewards: mark-paid/batch → `PAID`; reverse → `APPROVED`; reject-draft → none. |

**Removed/absent**: there is no reward `mark-paid` route and no `paidOn`/`paymentReference` on the
reward (Q12 removed manual payment from F08-1/3).

## New error codes

| Code | HTTP | Where |
|---|---|---|
| `BONUS_ENTRY_MANAGED_BY_REWARD` | 409 | generic billing actions on a bonus entry |
| `INVOICE_NON_POSITIVE_TOTAL` | 422 | `request-invoice` when period total ≤ 0 |
| `INVOICE_LINES_CHANGED` | 409 | `approve-draft` link-count mismatch |
| `FORBIDDEN` (message "Only an Admin Master can void an invoiced reward") | 403 | OP voiding an invoiced/paid reward |

Declare the new codes in the response schemas of the owning routes so the serializer does not strip
them and the frontends' typed client sees the error shape.

## RBAC matrix

Append to `ROLE_ACTION_MATRIX`: `inspector_program.awards.void_invoiced` → `roles: ['AM']`
(no condition). Append the action, do not reorder existing entries.
