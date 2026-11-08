# Data Model — Inspector Program Report (`INSPECTOR_PROGRAM`)

This feature adds **one enum value** and **no new table/column**. Everything else is a read model over entities already shipped by F08-1 and F08-6.

## Schema change (expand-only)

### `ReportType` enum

`apps/backend/prisma/schema.prisma`:

```prisma
enum ReportType {
  APPOINTMENTS
  FINANCIAL
  PERFORMANCE
  AGENCIES
  INSPECTOR_PROGRAM   // F08-5
}
```

Migration `prisma/migrations/<YYYYMMDDhhmmss>_report_type_inspector_program/migration.sql`:

```sql
ALTER TYPE "ReportType" ADD VALUE 'INSPECTOR_PROGRAM';
```

Expand-only, idempotent in effect (the value is never used in the same transaction). Mirrored in `packages/shared/src/enums/misc.ts` (`ReportType.INSPECTOR_PROGRAM`).

## Report row (runtime, existing `Report` entity)

| Field | Value for this type |
|---|---|
| `report_type` | `INSPECTOR_PROGRAM` |
| `tenant_id` | `NULL` (platform-scoped) |
| `agency_scoped` | `false` |
| `filters_json` | `{ fromDate, toDate, dateAxis (ignored), groupProperties:false (ignored), dateAxisField: 'period_end' }` |
| `file_key` | `reports/platform/INSPECTOR_PROGRAM/<id>.xlsx` |
| `requested_by_user_id` | the AM/OP user |

## Read model (joins, no new persistence)

```text
GoalPeriodClosure (period_end ∈ [from,to])
  └─ goal: InspectorGoal                          (title, metric, target, scope ids)
RewardAward (goal_id + period_start = closure)    (snapshot + lifecycle + scope_label)
  ├─ inspector: Inspector                         (name, email — kept on soft delete)
  ├─ approved_by / voided_by: User                (name)
  ├─ financial_entry: FinancialEntry              (id, status)   ← Ledger status
  └─ inspector_invoice: InspectorInvoice          (invoice_number, status) ← Invoice / Paid at
FinancialEntry reversal (reference_entry_id = original.id, amount<0)
  └─ InspectorInvoice (status CLOSED|PAID, snapshot contains entryId) ← Reversal invoice
```

### Entity reference (read-only)

- **GoalPeriodClosure** (`goal_period_closures`, platform-scoped): `goal_id`, `period_type`, `period_start`, `period_end`, `participants_count`, `achievers_count`, `promised_amount`, `scope_label`, `index_snapshot_date`, `trigger` (`SCHEDULED|STARTUP|SKIPPED_INACTIVE`), `closed_at`. Uniqueness `(goal_id, period_start)`.
- **RewardAward** (`reward_awards`, platform-scoped): immutable snapshot `goal_title`/`metric`/`comparator`/`target`/`amount`/`scope_label`; result `achieved_value`/`service_count`/`achieved_on`/`index_score_at_close`/`level_at_close`/`index_snapshot_date`; lifecycle `status` (`PENDING|APPROVED|PAID|VOID`), `approved_by_user_id`/`approved_at`, `paid_at`, `voided_by_user_id`/`voided_at`/`void_reason`/`inspector_note`, `inspector_invoice_id`. Uniqueness `(goal_id, inspector_id, period_start)`.
- **FinancialEntry** (`financial_entries`): the original bonus is 1:1 with the reward (`reward_award_id UNIQUE`, `amount>0`); the reversal carries `reference_entry_id` (→ original, `amount<0`). `status`: `PENDING|APPROVED|CANCELLED|VOIDED`.
- **InspectorInvoice** (`inspector_invoices`): `invoice_number` (Int?), `status` (`PENDING_REVIEW|CLOSED|PAID|VOID`), `line_items_snapshot` (Json; bonus lines carry `entryId`), `paid_at`.

## XLSX columns (`INSPECTOR_PROGRAM_COLUMNS`)

| # | Key | Label | Source |
|---|---|---|---|
| 1 | periodType | Period type | closure.period_type |
| 2 | periodStart | Period start | closure.period_start (civil) |
| 3 | periodEnd | Period end | closure.period_end (civil) |
| 4 | goal | Goal | award.goal_title ∥ goal.title (no-achievers/skipped) |
| 5 | goalDescription | Goal description | describeGoal({metric,target,scopeLabel}) |
| 6 | metric | Metric | award.metric ∥ goal.metric |
| 7 | target | Target | award.target ∥ in-force target |
| 8 | scope | Scope | scope_label (award ∥ closure) |
| 9 | perWinner | Per winner (AUD) | award.amount ∥ goalTermsForPeriod amount ∥ '' |
| 10 | participants | Participants | closure.participants_count (0 on skipped) |
| 11 | achievers | Achievers | closure.achievers_count |
| 12 | promised | Promised (AUD) | closure.promised_amount (0 on skipped) |
| 13 | inspector | Inspector | inspector.name ∥ '' |
| 14 | inspectorEmail | Inspector email | inspector.email ∥ '' |
| 15 | result | Result | award.achieved_value (+ unit) ∥ '' |
| 16 | jobsInPeriod | Jobs in period | award.service_count ∥ '' |
| 17 | achievedOn | Achieved on | award.achieved_on (civil) ∥ '' |
| 18 | indexAtClose | Index at close | award.index_score_at_close ∥ '' |
| 19 | levelAtClose | Level at close | award.level_at_close ∥ '' |
| 20 | status | Status | REWARD_AWARD_STATUS_LABELS ∥ "No achievers" ∥ "Skipped (goal inactive)" |
| 21 | amount | Amount (AUD) | award.amount ∥ '' |
| 22 | approvedBy | Approved by | approved_by.name ∥ '' |
| 23 | approvedAt | Approved at | award.approved_at (instant, requester tz) ∥ '' |
| 24 | ledgerStatus | Ledger status | financial_entry.status humanised ∥ '' |
| 25 | invoice | Invoice | formatInvoiceNumber(inspector_invoice.invoice_number) ∥ '' |
| 26 | paidAt | Paid at | award.paid_at (instant, requester tz) ∥ '' |
| 27 | voidedAt | Voided at | award.voided_at (instant, requester tz) ∥ '' |
| 28 | voidReason | Void reason | award.void_reason ∥ '' |
| 29 | inspectorNote | Inspector note | award.inspector_note ∥ '' |
| 30 | voidedAfterInvoicing | Voided after invoicing | Yes/No (VOID & inspector_invoice_id!=null) ∥ '' |
| 31 | reversalInvoice | Reversal invoice | formatInvoiceNumber(reversal's invoice number) ∥ '' |

**Invariant**: no column renders a raw UUID/id or any coordinate.
