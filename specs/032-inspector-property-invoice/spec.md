# 032 — Inspector Property Invoice

**Status:** In progress (delivered as 6 sequenced PRs).
**Supersedes:** the inspector-invoice lifecycle portions of 008 (draft entry point), 010 (billing ledger — invoice generation/approval) and 017 (payment reconciliation). Payment reconciliation (`mark-paid` / `reverse-payment` / `batch-mark-paid` / `reconciliation-summary`) is retained as an internal AM/OP capability supporting the PAID badge.

## Concept

> An Inspector Property Invoice is unique per inspector and billing period, regardless of how many agencies or branches contributed payout lines within that period. Agency and branch are line-level attributes only; they do not define invoice ownership or uniqueness.

It is a **platform** document titled **"PROPERTY INVOICE"** (never "Tax Invoice"). No GST/tax, ABN, tax compliance, or external accounting integration is in scope.

## Rules

- **Identity / uniqueness:** `(inspector_id, period_start, period_end)` among ACTIVE statuses. One invoice may contain payout lines from many agencies and branches. Agency/branch are never ownership, identity, or uniqueness.
- **Source of truth:** `financial_entries` where `entryType = INSPECTOR_PAYOUT` **and** `status = APPROVED`, within the period. The invoice never mutates the ledger and never recalculates an already-emitted version.
- **Snapshot:** `line_items_snapshot`, `total_amount`, and `inspector_name` are frozen at **approval**. Before approval, previews are live.
- **Request (INSP):** select a system-computed **closed, cycle-aligned** period → invoice created `PENDING_REVIEW` (no number, no PDF). Fails if: period open/future, not cycle-aligned, no approved payouts, an ACTIVE invoice already exists for the period, or payouts span multiple currencies.
- **Approve (AM/OP):** `PENDING_REVIEW → CLOSED`; assign sequential `invoice_number`; freeze snapshot/total/name; set `issued_at`; enqueue the idempotent PDF job.
- **Reject (AM/OP):** `PENDING_REVIEW → VOID` with a required reason; no hard delete; retained in history.

## Cycles

`WEEKLY` / `FORTNIGHTLY` / `MONTHLY` (`BillingPeriodType`). The cycle comes from `inspectors.billing_cycle` (nullable; the app defaults to `FORTNIGHTLY`). The system computes valid closed periods; the PWA offers a closed-period **selector** (no free-form dates). Period boundaries are evaluated in `Australia/Sydney` (the platform timezone; inspectors have no timezone field).

## Status contract

Persisted enum `InspectorInvoiceStatus` = `PENDING_REVIEW | CLOSED | PAID | VOID` (after cleanup; `OPEN` and `SUPERSEDED` are legacy values removed in the final batch). `PAID` is an internal payment state shown as a complementary badge on Approved invoices.

3-bucket filter (web + PWA): **Pending** = `PENDING_REVIEW`; **Approved** = `CLOSED` or `PAID`; **Rejected** = `VOID`.

## RBAC

| Role | list | view | download | request | approve | reject |
|---|---|---|---|---|---|---|
| AM | ✅ all | ✅ | ✅ | — | ✅ | ✅ |
| OP | ✅ all | ✅ | ✅ | — | ✅ | ✅ |
| INSP | ✅ own | ✅ own | ✅ own | ✅ own | — | — |
| CL_ADMIN | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CL_USER | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Enforced inline via `AuthorizationService.assertRoles` in each use case (not via the shared role matrix). CL roles have no access; their financial surface is the separate 031 agency statement.

## Web backoffice filters

Inspector (owner), Start/End date (invoice period), Status (3 buckets), Agency & Branch (**content** filters — invoices whose `line_items_snapshot` has ≥1 line for that agency/branch; not ownership). No agency gate — AM/OP see all invoices immediately.

## Data model

`inspector_invoices`: `id`, `invoice_number` (int, unique, null until approval; displayed `PINV-000123`), `inspector_id`, `inspector_name` (frozen), `period_type`, `period_start`, `period_end`, `status`, `total_amount`, `currency`, `line_items_snapshot` (jsonb), `file_key`, `issued_at`, `generated_by_user_id`, `drafted_by_inspector_id`, `paid_at`, `paid_by_user_id`, `payment_reference`, `notes`, `created_at`, `updated_at`.

`inspectors`: `billing_cycle` (`BillingPeriodType`, nullable, app-default `FORTNIGHTLY`).

Snapshot line: `serviceDate`, `appointmentId` (internal), `appointmentCode` (display, via `AppointmentCodeFormatter`), `propertyAddress`, `serviceType`, `amount`, `agencyId`, `agencyName`, `branchId`, `branchName`.

## PDF

Title **"PROPERTY INVOICE"**, rendered from the frozen snapshot; per line: service date, appointment code, property address, service type, agency name, branch name, amount. No raw UUIDs, no tax line, total = sum of payouts. Generated asynchronously and idempotently per invoice id.

## Out of scope

GST/tax, ABN/tax compliance, tax invoice, external accounting integration, invoice notifications (email/SMS/push), manual editing of a requested invoice, and any Agency/branch access to inspector invoices.

## Delivery (6 sequenced PRs, each green + staging-safe)

1. **Foundation** — additive schema/enums (`VOID`, `FORTNIGHTLY` rename, `issued_at` rename, `invoice_number`/`inspector_name`/`line_items_snapshot`, `inspectors.billing_cycle`), shared contracts, `formatInvoiceNumber`.
2. **Request flow** — closed-period service + request/preview/available-periods use cases and routes (`/draft` kept alive); **ACTIVE-only partial unique index** replaces the status-agnostic composite unique.
3. **Approval** — snapshot freeze + numbering + "PROPERTY INVOICE" PDF; reject → VOID; remove admin generate & regenerate.
4. **Read RBAC + web** — OP read access, agency/branch content filters, 3-bucket status, remove agency gate, OpenAPI regen.
5. **PWA** — request (closed-period selector) + own-only list/detail/history; retire `/draft`.
6. **Cleanup** — remove `OPEN`/`SUPERSEDED` enum values + `previous_invoice_id`.
