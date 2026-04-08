# Data Model: Billing & Ledger

**Feature**: `010-billing-ledger`
**Status**: IMPLEMENTED
**Source**: `apps/backend/prisma/schema.prisma` (`FinancialEntry`, `InspectorInvoice`, `FinancialEntryType`, `FinancialEntryStatus`, `InspectorInvoiceStatus`, `BillingPeriodType`), `apps/backend/src/modules/billing/domain/**`

All timestamps are `timestamptz`. Monetary amounts are `Decimal(12,2)` — never float. Column names follow `snake_case`; Prisma exposes them as `camelCase`.

## Enums

### `FinancialEntryType`

```
TENANT_DEBIT | INSPECTOR_PAYOUT | REFUND | MANUAL_ADJUSTMENT
```

- `TENANT_DEBIT` — what the agency owes the platform for a delivered inspection.
- `INSPECTOR_PAYOUT` — what the platform owes the inspector for the same delivery.
- `REFUND` — a reversal of a specific `TENANT_DEBIT` (always full amount in Phase 1).
- `MANUAL_ADJUSTMENT` — a free-form correction. May reference another entry via `reference_entry_id`.

### `FinancialEntryStatus`

```
PENDING | APPROVED | CANCELLED
```

- `PENDING` — initial state. Awaits two-person approval.
- `APPROVED` — locked in. Participates in invoice totals. Immutable.
- `CANCELLED` — terminal. Not exposed via a use case in Phase 1 (GAP-001).

### `InspectorInvoiceStatus`

```
OPEN | CLOSED | PAID
```

- `OPEN` — reserved for a future "draft invoice" workflow (`model-ready, not yet used`). Current `GenerateInvoiceUseCase` skips `OPEN` and creates invoices directly in `CLOSED`.
- `CLOSED` — sum-final, worker generates PDF. This is the terminal state reachable in Phase 1.
- `PAID` — invoice has been paid. `Model-ready but not operationally reachable in Phase 1` — no endpoint or workflow transitions to this status (GAP-008). The invoice lifecycle is **incomplete**: `OPEN → CLOSED → PAID` is the target; only `→ CLOSED` is implemented.

### `BillingPeriodType`

```
WEEKLY | BIWEEKLY | MONTHLY
```

Default `BIWEEKLY`. Configurable per inspector in a future iteration (ties to 002#GAP-002 tenant settings).

## Entities

### `financial_entries`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated OR **deterministic** | For auto-generated entries (via `createFinancialEntryId`), the id is SHA-1-derived from `(appointmentId, entryType)`. For manual entries, it's a fresh UUID. |
| `tenant_id` | uuid | no | — | FK → `tenants.id`. |
| `appointment_id` | uuid | yes | — | FK → `appointments.id`. Null on pure tenant-level adjustments. |
| `inspector_id` | uuid | yes | — | FK → `inspectors.id`. Set on `INSPECTOR_PAYOUT` and on adjustments that target a specific inspector. |
| `entry_type` | `FinancialEntryType` | no | — | |
| `amount` | decimal(12,2) | no | — | Always positive; `REFUND` and `MANUAL_ADJUSTMENT` use the sign convention (debit/credit) via entry type, not the sign of the number. |
| `currency` | char(3) | no | — | ISO 4217. Inherited from the tenant at creation time. |
| `status` | `FinancialEntryStatus` | no | `PENDING` | |
| `description` | varchar(500) | no | — | Human-readable label. Set by the use case (e.g., `Inspection service debit`). |
| `effective_at` | timestamptz | no | — | When the entry takes accounting effect. Usually `now()` for auto and adjustment flows. |
| `initiated_by_user_id` | uuid | no | — | FK → `users.id`. `SYSTEM_USER_ID` for auto-generated rows. |
| `approved_by_user_id` | uuid | yes | — | FK → `users.id`. Set on approval. MUST differ from `initiated_by_user_id`. |
| `approved_at` | timestamptz | yes | — | Set on approval. |
| `reference_entry_id` | uuid | yes | — | Self-FK. Set on `REFUND` (points to the source `TENANT_DEBIT`) or `MANUAL_ADJUSTMENT` (points to any reference). |
| `reason` | text | yes | — | Required on refunds and adjustments. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes**

- `(tenant_id)`
- `(appointment_id)`
- `(inspector_id)`
- `(entry_type)`
- `(status)`
- `(effective_at)`
- `(tenant_id, entry_type, status)` — composite for the summary endpoint.

**Invariants**

- `status = APPROVED` ⇒ `approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_user_id ≠ initiated_by_user_id`.
- `entry_type = REFUND` ⇒ `reference_entry_id IS NOT NULL` and the referenced entry is an `APPROVED TENANT_DEBIT`.
- `entry_type = REFUND` ⇒ at most one `REFUND` per `reference_entry_id` at `status ≠ CANCELLED`.
- Auto-generated entries use **deterministic UUIDs** — duplicate inserts are prevented by the primary key.
- `APPROVED` entries are immutable: no field may be updated via the repository.
- `currency` is frozen at creation. A tenant currency change does not retroactively rewrite entries.
- `amount` uses `Decimal(12,2)`; callers must never send JavaScript floats.

### `inspector_invoices`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | generated | PK |
| `inspector_id` | uuid | no | — | FK → `inspectors.id`. |
| `period_start` | date | no | — | Inclusive. |
| `period_end` | date | no | — | Inclusive. |
| `period_type` | `BillingPeriodType` | no | — | |
| `status` | `InspectorInvoiceStatus` | no | `OPEN` | Current use case skips `OPEN` and creates directly in `CLOSED`. |
| `total_amount` | decimal(12,2) | no | `0` | Sum of approved `INSPECTOR_PAYOUT` entries in the period for this inspector. |
| `currency` | char(3) | no | — | Default `AUD` in Phase 1. |
| `file_key` | string | yes | — | Supabase Storage object key for the PDF. Populated asynchronously by the worker. |
| `generated_by_user_id` | uuid | yes | — | FK → `users.id`. |
| `generated_at` | timestamptz | yes | — | |
| `paid_at` | timestamptz | yes | — | Not set by any current endpoint (GAP-008). |
| `notes` | text | yes | — | |
| `created_at`, `updated_at` | timestamptz | no | | |

**Indexes**

- `UNIQUE (inspector_id, period_start, period_end)` — exact-match idempotency guard.
- `(inspector_id, status)`
- `(period_start, period_end)` — used by overlap detection.

**Invariants**

- Exactly one invoice per `(inspector_id, period_start, period_end)` — exact-match requests are idempotent.
- Overlapping but non-identical periods are rejected with `INVOICE_PERIOD_OVERLAP`.
- `total_amount` is the sum of `APPROVED INSPECTOR_PAYOUT` entries whose `effective_at` falls in `[period_start, period_end]` at the moment of generation. Late approvals do not retroactively update the total (GAP-007 for regeneration).
- `status = PAID` requires manual operator action, not yet exposed (GAP-008).

## Domain Logic

### `FinancialEntryEntity` predicates

- `isApproved()` → `status === 'APPROVED'`
- `canBeApproved()` → `status === 'PENDING'`
- `isSelfApproval(approverUserId)` → `approverUserId === initiatedByUserId`

### Deterministic ID helper

```
createFinancialEntryId(appointmentId, entryType):
  hash = sha1(`properfy-financial-entry:${appointmentId}:${entryType}`)
  bytes[6] = (bytes[6] & 0x0f) | 0x50   # version 5 (name-based SHA-1)
  bytes[8] = (bytes[8] & 0x3f) | 0x80   # variant 10
  return uuid(bytes[0..16])
```

The resulting UUID is version-5-like and is stable across runs. Two independent invocations on the same `(appointmentId, entryType)` tuple produce the same id, which becomes the primary key — the database enforces the uniqueness invariant.

## Ports (domain interfaces)

### `IFinancialEntryRepository`

- `save(entry)` — insert. Throws on unique violation (handled gracefully by `CreateFinancialEntriesOnDoneUseCase`).
- `findById(entryId)`
- `findByAppointmentAndType(appointmentId, entryType)` — used by the on-done use case to check existence.
- `findByReferenceEntryIdAndType(referenceEntryId, entryType)` — used by refund to check duplicates.
- `findAll(filters, pagination)` / `count(filters)` — operator list.
- `sumByType(filters)` — used by the summary endpoint.
- `sumApprovedPayoutsForInspectorInPeriod(inspectorId, periodStart, periodEnd)` — used by invoice generation.
- `transitionStatus(entryId, tenantId, fromStatus, toStatus, approvedByUserId?, approvedAt?)` — conditional UPDATE for approvals.

### `IInspectorInvoiceRepository`

- `save(invoice)` — insert.
- `findById(invoiceId)` — with access control at use-case layer.
- `findByInspectorAndPeriod(inspectorId, start, end)` — exact-match idempotency.
- `findOverlapping(inspectorId, start, end)` — overlap detection.
- `findAll(filters, pagination)` / `count(filters)` — operator list.
- `updateFileKey(invoiceId, fileKey)` — called by the worker after PDF generation.

## Relationships

```
tenants (1) [feature 002]
  └── financial_entries (0..*)

appointments (0..*) [feature 006]
  └── financial_entries (0..*, optional FK; auto-generated on DONE+cross-check)

inspectors (1) [feature 008]
  ├── financial_entries (0..*, INSPECTOR_PAYOUT and adjustments)
  └── inspector_invoices (0..*)

financial_entries (self-reference via reference_entry_id for REFUND / MANUAL_ADJUSTMENT chains)
```

## Audit Linkage

Actions emitted via `AuditService`:

- `financial_entry.created` — auto-generated (TENANT_DEBIT and INSPECTOR_PAYOUT), initiator `SYSTEM`.
- `financial_entry.approved` — two-person approval. Before/after status transition.
- `financial_entry.refund_created` — refund creation. Includes `reference_entry_id`.
- `financial_entry.manual_adjustment_created` — manual adjustment creation.
- `invoice.generated` — invoice creation.

No audit on invoice download or list (read-only operations).

## Side Effects Summary

| Use case | Writes | Jobs enqueued | Audit |
|---|---|---|---|
| `CreateFinancialEntriesOnDoneUseCase` | Insert 2 entries (deterministic UUIDs), idempotency cache | — | `financial_entry.created` × 2 |
| `ApproveFinancialEntryUseCase` | Conditional UPDATE to `APPROVED` | — | `financial_entry.approved` |
| `CreateManualAdjustmentUseCase` | Insert 1 entry, idempotency cache | — | `financial_entry.manual_adjustment_created` |
| `CreateRefundUseCase` | Insert 1 entry, idempotency cache | — | `financial_entry.refund_created` |
| `GenerateInvoiceUseCase` | Insert 1 invoice | `billing.generate-invoice-file` | `invoice.generated` |
| `generate-invoice-file.worker.ts` | Update invoice `file_key` | — | — |
| `DownloadInvoiceUseCase` | — | — | — (read-only) |

## Migration History

Phase 1 schema applied in `apps/backend/prisma/migrations/`. Phase 2 changes that would alter enum semantics (e.g., adding `VOID` status, adding `TENANT_INVOICE` entry type, partial refunds) require expand/contract migrations with explicit backfill plans.
