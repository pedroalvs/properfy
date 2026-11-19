# Feature Specification: Inspector Program Report (`INSPECTOR_PROGRAM`)

**Feature Branch**: `069-f08-5-program-report`
**Created**: 2026-11-08
**Status**: Draft
**Input**: User description: "inspector program report type" — TASK-F08-5 (`fase2-etapa1/tarefas/F08-tarefas.md`), contract item **03.14**, criteria **03.A4 / 03.A5 / Q18**.

## Overview

Add a new report type **`INSPECTOR_PROGRAM`** to the platform's existing report generator (the same request → queue → XLSX → download flow that already serves `APPOINTMENTS`, `FINANCIAL`, `PERFORMANCE`, `AGENCIES`). The report exports the inspector goals & rewards program: each closed goal period, its participants and achievers, the promised vs. achieved amounts, the reliability index captured at close, and — per reward — the bonus ledger-entry status and the inspector invoice that carries (or reversed) the bonus (Q12, delivered by TASK-F08-6).

The report is **operator-only** (AM/OP). Agencies (CL_ADMIN/CL_USER), inspectors (INSP) and rental tenants (TNT) can neither see nor generate it.

This is the final task in the F08 chain; it consumes contracts already merged by TASK-F08-1 (goals/rewards/closures model), TASK-F08-3 (`describeGoal`) and TASK-F08-6 (`reward_awards.inspector_invoice_id`, `financial_entries.reward_award_id`/`reference_entry_id`, the bonus ledger entry, the invoice sync).

### Multi-tenant scoping (documented exception to root `CLAUDE.md` §7.1)

The inspector program entities (`inspector_goals`, `reward_awards`, `goal_period_closures`) are **platform-scoped — no `tenant_id`** (the inspector is cross-tenant; precedents: `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`, reliability snapshots, goals and rewards). Accordingly the generated `INSPECTOR_PROGRAM` report row is created with **`tenant_id = NULL`** and **`agency_scoped = false`**, and its file lands under `reports/platform/INSPECTOR_PROGRAM/<id>.xlsx` (the existing `platform` folder for a null tenant). Isolation is by **RBAC only** (D8/D12): CL_*/INSP/TNT are rejected before any read. No report row, column or cell carries an agency name, address, coordinate, or any inspector GPS data. (The `Report` row itself is tenant-scoped infrastructure that already supports a null tenant for cross-agency operator runs — this report reuses that, it does not relax the tenant model for agencies.)

### Timezone (DR5)

- **Instants** (`Approved at`, `Paid at`, `Voided at`) render in the **requester's timezone**, exactly as the existing report flow renders instants (display only).
- **Civil dates** (`Period start`, `Period end`, `Achieved on`, `Index snapshot date`) render as stored: period dates are `PLATFORM_TIMEZONE` civil dates; `Achieved on` is the service date in the agency timezone (frozen into the award snapshot at close). The report does not re-derive any civil date.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator generates and downloads the Inspector Program report (Priority: P1)

An Admin Master or Operator opens **Reports**, clicks **Generate Report**, picks **Inspector program** as the type, chooses a date range, and generates. The job produces an XLSX with one worksheet: one row per reward of each closed goal period whose `period_end` falls in the range, plus a row for each closed period that produced no achievers, plus a row for each `SKIPPED_INACTIVE` closure. When ready, they download the file.

**Why this priority**: This is the whole contractual deliverable (03.14) and the only user-facing surface of the task. Everything else (privacy, dialog ergonomics) protects or enables this one journey.

**Independent Test**: With goal closures, awards across every status, a closure without achievers, and a `SKIPPED_INACTIVE` closure seeded, request `INSPECTOR_PROGRAM` for a range covering their `period_end`s as AM/OP, then confirm the downloaded XLSX contains the expected rows, columns and values and the run is marked `READY`.

**Acceptance Scenarios**:

1. **Given** an AM/OP user and a date range covering closed goal periods, **When** they request an `INSPECTOR_PROGRAM` report, **Then** the report is accepted (201), queued, generated, and marked `READY` with a downloadable XLSX. *(03.14)*
2. **Given** a goal period closed with an achiever whose reward was created, **When** the report runs for a range containing that closure's `period_end`, **Then** the XLSX has a row for that reward with the goal snapshot, the achiever's name/email, the result, the index at close, the amount and the reward status. *(03.A4)*
3. **Given** a closed period with **no** achievers, **When** the report runs, **Then** the XLSX has exactly one row for that closure with the goal, participants, promised amount, and empty inspector/award columns.
4. **Given** a goal that was deactivated and later reactivated so some periods were recorded as `SKIPPED_INACTIVE`, **When** the report runs over those periods, **Then** each skipped period appears as one row with Status "Skipped (goal inactive)", Participants 0, Promised 0.00, and empty inspector columns. *(DL2 / L-F08-02)*
5. **Given** a date range with no closures at all, **When** the report runs, **Then** the XLSX contains only the header row, the run is `READY` and `rowCount` is 0.

### User Story 2 - Reward rows reflect the bonus ledger entry and invoice (Priority: P1)

For each reward row, the report shows the reward lifecycle together with the Q12 financial facts: the ledger entry status, the invoice that carries the bonus, whether the reward was voided after invoicing, and the reversal invoice when a paid reward was later voided.

**Why this priority**: The bonus-in-the-ledger (Q12) is the contractual change that makes the reward auditable end-to-end; the report is the audit surface operations use to reconcile bonuses against inspector invoices.

**Independent Test**: Seed rewards in each lifecycle state (`PENDING`, `APPROVED` un-invoiced, `APPROVED` on a CLOSED invoice, `PAID`, `VOID` before invoicing, `VOID` after paid with a reversal) and assert the Ledger status / Invoice / Paid at / Voided after invoicing / Reversal invoice columns.

**Acceptance Scenarios**:

1. **Given** a `PAID` reward whose bonus rode invoice #42, **When** the report runs, **Then** Invoice = `PINV-000042`, Ledger status = `Approved`, Paid at = the invoice `paid_at`. *(Q12)*
2. **Given** an `APPROVED` reward not yet on any invoice, **When** the report runs, **Then** Invoice is empty and Ledger status = `Approved`. *(Q12)*
3. **Given** a `VOID` reward voided before invoicing, **When** the report runs, **Then** Ledger status = `Voided`, "Voided after invoicing" = `No`. *(DL3)*
4. **Given** a reward voided after it was paid, with a negative reversal entry that later landed on invoice #57, **When** the report runs, **Then** Status = `Voided`, "Voided after invoicing" = `Yes`, Paid at is kept, Reversal invoice = `PINV-000057` (empty until the reversal is invoiced). *(DL3 / Q12)*
5. **Given** a `PENDING` reward, **When** the report runs, **Then** all ledger/invoice columns are empty.
6. **Given** any reward row, **When** the report renders, **Then** **no column shows a raw id** (UUID, invoice id, entry id) — only human-facing labels/numbers. *(`feedback_no_raw_ids_in_ui`)*

### User Story 3 - Agencies and inspectors cannot access the report (Priority: P1)

A CL_ADMIN or CL_USER never sees "Inspector program" as a choice and is rejected by the backend if they craft the request anyway; INSP/TNT have no report access at all.

**Why this priority**: The program data is platform-scoped and cross-tenant (D8/D12). Letting an agency generate it would disclose other agencies' inspector performance and bonuses.

**Independent Test**: As CL_ADMIN request `INSPECTOR_PROGRAM` → 403; confirm the web dialog omits the option for agency roles.

**Acceptance Scenarios**:

1. **Given** a CL_ADMIN or CL_USER, **When** they POST a `INSPECTOR_PROGRAM` report request, **Then** the backend responds 403 with message "Agencies cannot generate the INSPECTOR_PROGRAM report". *(Q18 / D8)*
2. **Given** an agency-role user in the web Generate Report dialog, **When** they open the report-type select, **Then** "Inspector program" is not an option.
3. **Given** `INSPECTOR_PROGRAM`, **When** the agency-report allowlist is evaluated, **Then** it is **not** in `AGENCY_REPORT_TYPES`.

### User Story 4 - The report dialog is tailored to the program report (Priority: P2)

When an operator selects "Inspector program" in the Generate Report dialog, the agency-oriented filters (Agency, Branch, Suburb, Status, Date axis, "Group by property") are hidden, since the program report is platform-wide and ranges on the period, not on an appointment axis. Only the date range is sent. The request is audited.

**Why this priority**: Prevents confusing/ignored inputs and keeps the submitted payload clean; the audit (03.A5) is required for every report request but is already provided by the existing flow.

**Independent Test**: In the dialog, pick "Inspector program" and assert the agency-scoped fields disappear and the submitted payload carries only `fromDate`/`toDate` (plus the forced `dateAxis` default the backend ignores).

**Acceptance Scenarios**:

1. **Given** an operator who selected "Inspector program", **When** the dialog renders, **Then** Agency, Branch, Suburb, Status, Date axis and "Group by property" are hidden.
2. **Given** an operator who had an agency pre-selected and then switches the type to "Inspector program", **When** they generate, **Then** the submitted filters contain only the date range (the backend ignores any stray `tenantId`).
3. **Given** any report request, **When** it is accepted, **Then** an audit entry `reportRequested` is written with the report type and the requester. *(03.A5 — provided by the existing flow)*

### Edge Cases

- **Empty range** → header-only sheet, `READY`, `rowCount 0`. *(03.A4 negative)*
- **Goal renamed after close** → reward rows use the immutable snapshot title; a no-achievers row uses the goal's current title.
- **Soft-deleted inspector** → the achiever's name and email still render (frozen on the inspector row, not deleted).
- **Region/service-type/inspector of the goal scope deleted or renamed after close** → `Scope`/`Goal description` use the frozen `scope_label` from the award (or, on a no-achievers row, from the closure); a `null` scope label renders the deleted-scope fallback via `describeGoal` ("… in a deleted region" / "… of a deleted service type"). *(DL13 / L-F08-13)*
- **Void reason vs. inspector note** → "Void reason" (internal, AM/OP) and "Inspector note" are separate columns; both come from the reward. *(DL5)*
- **Invoice payment reversed (`PAID → CLOSED`)** → the reward returns to `APPROVED`: Paid at empties, Invoice is kept. *(Q12)*
- **Range exceeds the max span** → `ReportDateRangeExceededError(12)` (12-month cap, same as the other types).
- **More than the concurrent-report limit already queued** → the existing concurrency guard applies unchanged.

## Requirements *(mandatory)*

### Functional Requirements

**Enum & contract**

- **FR-001**: The system MUST add `INSPECTOR_PROGRAM` to the `ReportType` enum in **both** `packages/shared` (`enums/misc.ts`) and the Prisma schema (`enum ReportType`), via an expand-only migration `ALTER TYPE "ReportType" ADD VALUE 'INSPECTOR_PROGRAM'`.
- **FR-002**: The shared report schemas (`requestReportSchema`, `listReportsQuerySchema`) MUST accept `INSPECTOR_PROGRAM`; the shared report tests MUST assert all **5** report types.
- **FR-003**: Adding the enum value MUST force (via exhaustive `Record<ReportType, …>`) the three code maps to be updated: `MAX_DATE_RANGE_MONTHS` (`INSPECTOR_PROGRAM: 12`), `REPORT_COLUMNS` (`INSPECTOR_PROGRAM_COLUMNS`), and the web `REPORT_TYPE_MAP` (label "Inspector program", a new background token).

**Access control**

- **FR-004**: `INSPECTOR_PROGRAM` MUST be operator-only: it MUST NOT be added to `AGENCY_REPORT_TYPES`; a CL_ADMIN/CL_USER request MUST raise `ReportForbiddenError` ("Agencies cannot generate the INSPECTOR_PROGRAM report"). INSP/TNT have no report surface. *(Q18 / D8)*
- **FR-005**: For `INSPECTOR_PROGRAM`, the request use case MUST force `tenantId = null` and `agencyScoped = false` regardless of any `filters.tenantId` an operator sent.

**Request plumbing (the 2 extra places the code requires)**

- **FR-006**: The request use case MUST set `dateAxisField = 'period_end'` for `INSPECTOR_PROGRAM` (analogous to `'effective_at'` for FINANCIAL), so the stored `filters_json` records the real field the Period ranged on and never leaves `dateAxisField` undefined.
- **FR-007**: The web Generate Report dialog MUST exclude `INSPECTOR_PROGRAM` from the agency-role option list (`AGENCY_REPORT_TYPE_OPTIONS`) and, when it is selected, MUST hide Agency, Branch, Suburb, Status, Date axis and "Group by property", submitting only the date range.

**Data reader**

- **FR-008**: A new read port method `getInspectorProgramRows(filters)` MUST be added to `IReportDataReader` and dispatched from the process-report job's `switch` (`case 'INSPECTOR_PROGRAM'`).
- **FR-009**: The reader MUST select `goal_period_closures` whose `period_end` is within `[fromDate, toDate]`, joined to their goal; and the `reward_awards` of those closures (matched on `goal_id` + `period_start`), joined to the inspector, the approving/voiding users, the 1:1 bonus `financial_entry` (for its id and status), and the `inspector_invoice` (for its number and status). It MUST use Prisma (no `$queryRaw`).
- **FR-010**: Per closure, the reader MUST emit: one row per reward ordered by the P9 ranking (value desc → index desc nulls last → achieved_on asc → inspector_id); OR, when the closure has no awards, one "no achievers" row; OR, when `trigger = 'SKIPPED_INACTIVE'`, one "Skipped (goal inactive)" row with Participants 0 and Promised 0.00.
- **FR-011**: Reward rows MUST derive: `Invoice` = `formatInvoiceNumber(inspector_invoice.invoice_number)`; `Ledger status` = the bonus `financial_entry.status` (humanised, e.g. `Approved`/`Voided`); `Paid at` = the reward `paid_at`; `Voided after invoicing` = (`status = 'VOID'` AND `inspector_invoice_id` is not null) → `Yes`/`No`; `Reversal invoice` = the CLOSED/PAID invoice whose snapshot carries the negative reversal entry (the entry with `reference_entry_id` = the original bonus entry id), empty until that reversal is invoiced. *(DL3 / Q12)*
- **FR-012**: `Scope` and `Goal description` MUST use the frozen `scope_label` (award snapshot, or the closure's on a no-achievers row) passed to the shared `describeGoal({ metric, target, scopeLabel })`; a `null` scope label uses `describeGoal`'s deleted-scope fallback. *(DL13)*
- **FR-013**: `Per winner` MUST be the award's snapshot `amount`; on a no-achievers row, the goal terms in force for that period (`goalTermsForPeriod`); empty on a skipped row. `Promised` MUST be the closure's `promised_amount`. *(P10)*
- **FR-014**: `Void reason` and `Inspector note` MUST be separate columns, both from the reward. *(DL5)*
- **FR-015**: Instant columns (`Approved at`, `Paid at`, `Voided at`) MUST render in the requester's timezone; civil-date columns MUST render as stored (`YYYY-MM-DD` or the report's civil-date format). No column may expose a raw id or any coordinate. *(DR5, `feedback_no_raw_ids_in_ui`)*

**Columns (XLSX)**

- **FR-016**: `INSPECTOR_PROGRAM_COLUMNS` MUST be, in order: Period type · Period start · Period end · Goal · Goal description · Metric · Target · Scope · Per winner (AUD) · Participants · Achievers · Promised (AUD) · Inspector · Inspector email · Result · Jobs in period · Achieved on · Index at close · Level at close · Status · Amount (AUD) · Approved by · Approved at · Ledger status · Invoice · Paid at · Voided at · Void reason · Inspector note · Voided after invoicing · Reversal invoice. Status values include "Skipped (goal inactive)".

**Web presentation**

- **FR-017**: The reports list and generate dialog MUST render the new type via `REPORT_TYPE_MAP` (chip label "Inspector program", new CSS token `--color-report-type-inspector-program` with text contrast ≥ 4.5:1). `ReportTypeChip`/`ReportFilters` derive from the map, so they pick it up automatically.
- **FR-018**: The OpenAPI contract and `api-types.ts` MUST be regenerated (`pnpm generate:api`) so the typed client knows the new enum value; both `openapi.json` and `api-types.ts` MUST be committed.

**Documentation**

- **FR-019**: `apps/backend/CLAUDE.md` MUST record that adding a `ReportType` touches 12 places (the table), and the three workspace CLAUDE.md files changed by this PR MUST be updated (root §13.11).

### The 12 integration points

| # | Place | File | Change |
|---|---|---|---|
| 1 | Prisma enum + migration | `apps/backend/prisma/schema.prisma` (`enum ReportType`) | add `INSPECTOR_PROGRAM`; migration `…_report_type_inspector_program` with `ALTER TYPE … ADD VALUE` |
| 2 | Shared enum | `packages/shared/src/enums/misc.ts` | `INSPECTOR_PROGRAM: 'INSPECTOR_PROGRAM'` |
| 3 | Max period | `report.constants.ts` (`MAX_DATE_RANGE_MONTHS`) | `INSPECTOR_PROGRAM: 12` |
| 4 | Columns | `report.constants.ts` (`REPORT_COLUMNS`) | `INSPECTOR_PROGRAM_COLUMNS` |
| 5 | Agency types | `report-access.ts` (`AGENCY_REPORT_TYPES`) | **not** included (comment + test) |
| 6 | Job switch | `process-report-job.use-case.ts` | `case 'INSPECTOR_PROGRAM'` → `getInspectorProgramRows` |
| 7 | Port | `report-data-reader.ts` (`IReportDataReader`) | `getInspectorProgramRows(filters)` |
| 8 | Implementation | `prisma-report-data-reader.ts` | the Prisma query + row mapping |
| 9 | Web map | `apps/web/src/lib/status-colors.ts` (`REPORT_TYPE_MAP`) | label + token |
| 10 | Token + api-types | `apps/web/src/styles/tokens.css`; `openapi.json` + `api-types.ts` | `--color-report-type-inspector-program`; regenerate types |
| +1 | Request | `request-report.use-case.ts` | `dateAxisField = 'period_end'`, tenant forced to `null` |
| +2 | Dialog | `GenerateReportDialog.tsx` | exclude from agency options; hide agency-scoped fields when selected |

### Key Entities

- **Report** (existing): the generation job row. For this type: `report_type = INSPECTOR_PROGRAM`, `tenant_id = NULL`, `agency_scoped = false`, `filters_json = { fromDate, toDate, dateAxis(ignored), dateAxisField: 'period_end' }`, file at `reports/platform/INSPECTOR_PROGRAM/<id>.xlsx`.
- **GoalPeriodClosure** (read): one closure per `(goal, period)`; carries `period_start/end`, `participants_count`, `achievers_count`, `promised_amount`, `scope_label`, `index_snapshot_date`, `trigger`. A `SKIPPED_INACTIVE` closure has 0 participants and no awards.
- **RewardAward** (read): immutable goal snapshot + result + lifecycle; links to the 1:1 bonus `FinancialEntry` and (once invoiced) an `InspectorInvoice`.
- **FinancialEntry** (read): the `INSPECTOR_BONUS` original (`reward_award_id`) gives the Ledger status; the reversal (`reference_entry_id` → original, `amount < 0`) resolves the Reversal invoice via the invoice snapshot.
- **InspectorInvoice** (read): `invoice_number` → `formatInvoiceNumber`; `status`; `line_items_snapshot` (for reversal-invoice resolution).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An AM/OP can generate and download the `INSPECTOR_PROGRAM` XLSX with goals, rewards and the index at close. *(03.14)*
- **SC-002**: A reward created by the daily closure job appears in the XLSX when its period's `period_end` is in range. *(03.A4)*
- **SC-003**: A CL_ADMIN/CL_USER cannot see the option nor generate the report (403); INSP/TNT have no report access. *(Q18)*
- **SC-004**: Every report request is audited (`reportRequested`). *(03.A5)*
- **SC-005**: `03.A3` (anonymous ranking) does **not** apply — this is an AM/OP report that legitimately names inspectors.
- **SC-006**: All 12 integration points are covered by a test or by the compiler (`Record<ReportType, …>` forces #3, #4, #9); no raw id or coordinate appears in any cell.
- **SC-007**: The committed `openapi.json` and `api-types.ts` are fresh (CI `contract-freshness` passes).

## Assumptions

- **A1**: `describeGoal` lives in `packages/shared` (`lib/goal-copy.ts`, added by TASK-F08-3) and is callable from the backend reader. *(verified)*
- **A2**: `formatInvoiceNumber` (`packages/shared/src/utils/format-invoice-number.ts`) is the single source of the `PINV-000042` display format. *(verified)*
- **A3**: TASK-F08-1 (model + `goalTermsForPeriod`) and TASK-F08-6 (`reward_awards.inspector_invoice_id`, `financial_entries.reward_award_id`/`reference_entry_id`, bonus ledger entry, invoice sync) are merged on `develop`. *(verified: PRs #1358, #1361)*
- **A4**: `ReportType` is a dynamic enum value only (`ADD VALUE`); it is never used in the same migration transaction, so the expand migration is safe. Rollback leaves the value unused (harmless).
- **A5 (premise, DR5)**: When the reward was voided before paying, `Paid at` is empty; when voided after paying, `Paid at` is kept (the frozen `reward_awards.paid_at`), following the F08-6 lifecycle. No manual payment date exists (Q12 removed `paidOn`/`payment_reference`/`recovery_note`).
- **A6 (premise)**: The "Reversal invoice" is resolved by locating the CLOSED/PAID `inspector_invoice` whose `line_items_snapshot` contains the reversal entry (`entryId`), using a Prisma JSON containment filter backed by the existing GIN index `inspector_invoices_line_items_snapshot_gin`; it is empty while the reversal has not yet been invoiced. This is the only path, because `financial_entries` carries no `inspector_invoice_id` and the reversal carries no `reward_award_id`.
- **A7**: There is **no** example report in the seed for this type (explicitly out of scope).

## Out of scope

Multiple worksheets, charts, per-goal/per-inspector filters, daily index history, an agency-facing variant, a seed example, and any manual-payment column (removed by Q12). `03.A3` anonymous ranking does not apply to this operator report.
