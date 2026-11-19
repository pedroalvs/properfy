# Implementation Plan: Inspector Program Report (`INSPECTOR_PROGRAM`)

**Branch**: `069-f08-5-program-report` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/069-f08-5-program-report/spec.md`

## Summary

Add a fifth `ReportType`, `INSPECTOR_PROGRAM`, to the existing report request → pg-boss job → XLSX → signed-download pipeline. It is operator-only (AM/OP), platform-scoped (`tenant_id = NULL`, `agency_scoped = false`), and exports one XLSX worksheet of inspector goal periods: per-reward rows (goal snapshot, achiever, result, index at close, amount, lifecycle) plus no-achievers and `SKIPPED_INACTIVE` rows, with the Q12 bonus ledger/invoice columns (TASK-F08-6). The change spans the 12 documented integration points; the technical approach reuses the existing reader pattern (Prisma, no `$queryRaw`) and the F08-6 reward↔invoice↔entry join.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6 (PostgreSQL/Supabase), Zod 3, ExcelJS (XLSX), pg-boss 9; React 18 + Vite 5 (web); `@properfy/shared`
**Storage**: PostgreSQL; Supabase Storage for the generated `.xlsx` (`reports/platform/INSPECTOR_PROGRAM/<id>.xlsx`)
**Testing**: Vitest. Backend report tests live in `apps/backend/tests/unit/report/` and `apps/backend/tests/integration/report/`. The reader integration test (`tests/integration/report/prisma-report-data-reader.integration.test.ts`) uses the real-Postgres `setupDbHarness()` **but runs in the default `pnpm test`/`test:integration`** (only `tests/integration/db/**` is excluded). Web uses Vitest component tests (no Playwright needed here).
**Target Platform**: Linux server (API on Fly.io), browser (web on Vercel)
**Project Type**: Web (monorepo: `apps/backend`, `apps/web`, `packages/shared`)
**Performance Goals**: Inherits the async-report pattern — generation runs off the request thread in a pg-boss worker; no synchronous latency target. A single Prisma query set per report (bounded by the ≤ 12-month range).
**Constraints**: No `$queryRaw` in the reader (Prisma query builder + typed JSON filter for the reversal invoice); 12-month max span; expand-only migration; PR ≤ 150 files.
**Scale/Scope**: ~17 changed files; one new enum value; one reader method; one column set; the web dialog + chip wiring.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture** — PASS. New port method `getInspectorProgramRows` on the domain port `IReportDataReader`; implemented in `infrastructure/prisma-report-data-reader.ts`; dispatched from the application `ProcessReportJobUseCase`. Request-time plumbing stays in `request-report.use-case.ts`. No inward-pointing dependency is violated; no business logic in routes.
- **II. Multi-Tenant Safety** — PASS **with a documented exception** (see Complexity Tracking). The report reads platform-scoped inspector-program entities (`inspector_goals`/`reward_awards`/`goal_period_closures`, no `tenant_id` — the F08 exception to root §7.1, precedent F07/F08-1/F08-6). The report row is `tenant_id = NULL`, `agency_scoped = false`; isolation is **RBAC-only**: `assertReportTypeAllowed` rejects CL_ADMIN/CL_USER (403) and INSP/TNT have no report surface. The request is audited (`reportRequested`) with the resolved null tenant. No agency, address, coordinate or raw id appears in any cell.
- **III. TDD** — PASS. Tests are written first (shared schema, request use case, process-job use case, DB reader integration, web dialog). The reader's DB behaviour is covered by a real-DB testcontainers test.
- **IV. Contract-First** — PASS. The enum value is added to the shared Zod source; `openapi.json` + `api-types.ts` are regenerated and committed; CI `contract-freshness` gates it.
- **V. Simplicity** — PASS. Reuses the whole existing report pipeline; the only new logic is one reader method and a column set. No new abstraction, flag, or endpoint.

**Branching note**: the constitution §Development Workflow says "develop on `staging`"; the live project workflow (root `CLAUDE.md` §12, and the assigned role) targets **`develop`**. Per constitution §Governance, explicit session/user instructions take precedence — this PR targets `develop`. No violation.

## Project Structure

### Documentation (this feature)

```text
specs/069-f08-5-program-report/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (reversal lookup, instant tz, migration safety)
├── data-model.md        # Phase 1 — read model + the enum migration
├── quickstart.md        # Phase 1 — how to generate & verify
├── contracts/
│   └── report-inspector-program.md   # the OpenAPI delta (enum value, 201/403)
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/
├── src/enums/misc.ts                     # [2] ReportType += INSPECTOR_PROGRAM
├── src/schemas/report.test.ts            # 4 → 5 report-type assertions
├── openapi.json                          # [10] regenerated
└── src/api-types.ts                      # [10] regenerated

apps/backend/
├── prisma/schema.prisma                  # [1] enum ReportType += INSPECTOR_PROGRAM
├── prisma/migrations/<ts>_report_type_inspector_program/migration.sql   # [1] ADD VALUE
├── src/modules/report/
│   ├── domain/report.constants.ts        # [3] MAX_DATE_RANGE_MONTHS; [4] REPORT_COLUMNS + INSPECTOR_PROGRAM_COLUMNS
│   ├── domain/report-data-reader.ts      # [7] IReportDataReader.getInspectorProgramRows
│   ├── application/report-access.ts      # [5] AGENCY_REPORT_TYPES (NOT included) + comment
│   ├── application/use-cases/request-report.use-case.ts   # [+1] dateAxisField='period_end', tenant null
│   ├── application/use-cases/process-report-job.use-case.ts # [6] switch case
│   └── infrastructure/prisma-report-data-reader.ts        # [8] getInspectorProgramRows impl
├── tests/unit/report/{request-report,process-report-job,report-access}.use-case.test.ts  # unit tests
├── tests/integration/report/prisma-report-data-reader.integration.test.ts               # reader DB test (extended)
└── CLAUDE.md                             # [doc] "adding a ReportType touches 12 places" table

apps/web/
├── src/lib/status-colors.ts              # [9] REPORT_TYPE_MAP
├── src/styles/tokens.css                 # [10] --color-report-type-inspector-program
├── src/features/reports/components/GenerateReportDialog.tsx   # [+2] exclude from agency options; hide fields
└── CLAUDE.md                             # [doc] decision note
```

**Structure Decision**: Monorepo web layout. The change is confined to the `report` backend module, the `reports` web feature, and the shared enum/contract — no new module, no cross-module port (the reader reaches `reward_awards`/`financial_entries`/`inspector_invoices` directly through Prisma, as the Financial reader already reaches `financial_entries`).

## Implementation phasing (build order)

Follow the task's dependency order so each layer typechecks against the previous:

1. **Shared** — add the enum value (`misc.ts`), update `report.test.ts` (5 types). `pnpm --filter @properfy/shared build`.
2. **Prisma** — add the enum value, generate the migration, `prisma generate`.
3. **Backend** — `MAX_DATE_RANGE_MONTHS`, `INSPECTOR_PROGRAM_COLUMNS` + `REPORT_COLUMNS`, the `report-access` comment/guard, `request-report` plumbing, the `switch` case, the port method, the Prisma reader. Tests first (red → green).
4. **Web** — `REPORT_TYPE_MAP` label + token, `tokens.css`, `GenerateReportDialog` field-hiding + agency-option exclusion. Tests first.
5. **Contract** — `pnpm generate:api` (OpenAPI + api-types), commit both.
6. **Docs** — the three workspace CLAUDE.md updates.

## Reader design (place #8 — `getInspectorProgramRows`)

One method, Prisma only. Steps:

1. **Closures in range**: `goalPeriodClosure.findMany({ where: { period_end: { gte, lte } }, include: { goal: true }, orderBy: [{ period_start: 'asc' }, { goal: { title: 'asc' } }] })`. The range bound uses civil-date comparison on `period_end` (a `@db.Date`); `fromDate`/`toDate` are the civil strings from `filters` — no timezone math (period dates are stored civil `PLATFORM_TIMEZONE` dates).
2. **Awards of those closures**: `rewardAward.findMany({ where: { goal_id: { in }, period_start: { in } }, include: { inspector, approved_by, voided_by, financial_entry: { select: { id, status } }, inspector_invoice: { select: { invoice_number, status } } } })`, grouped in memory by `${goal_id}|${period_start}` (the closure identity). Order each group by the P9 comparator (reuse the inspector-program `compareAwardsForRanking` if importable, else inline the same order: value desc → index desc nulls last → achieved_on asc → inspector_id).
3. **Reversal invoices** (only when some award is VOID-after-invoicing): collect the original bonus `financial_entry.id`s of those awards; `financialEntry.findMany({ where: { entry_type: 'INSPECTOR_BONUS', reference_entry_id: { in: originalIds } }, select: { id, reference_entry_id } })` → the reversal entries; then for each reversal, find its invoice `inspectorInvoice.findFirst({ where: { status: { in: ['CLOSED','PAID'] }, line_items_snapshot: { array_contains: [{ entryId: reversalId }] } }, select: { invoice_number } })`. Batchable; empty until the reversal is invoiced. (This is the one JSON-filter query; it uses the existing `inspector_invoices_line_items_snapshot_gin` GIN index.)
4. **Row emission** per closure (ordered by step 1):
   - `trigger === 'SKIPPED_INACTIVE'` → one row: Status "Skipped (goal inactive)", Participants 0, Promised 0.00, Per winner/Inspector/award columns empty; Goal/Goal description/Metric/Target/Scope from the goal + closure `scope_label`.
   - awards present → one row per award (ranked).
   - no awards, not skipped → one "no achievers" row: closure-level columns, Per winner = `goalTermsForPeriod(goal, period)` reward amount, Promised = `promised_amount`, inspector/award columns empty.
5. **Cell formatting**:
   - civil dates (`Period start/end`, `Achieved on`, `Index snapshot date`) → `formatCivilDate` (stored civil date, no tz).
   - instants (`Approved at`, `Paid at`, `Voided at`) → `formatInstantDateTime(value, filters.timezone)` — **requester timezone (DR5)**; falls back to `PLATFORM_TIMEZONE` when the resolver gave none.
   - amounts → 2-dp numbers (AUD), like the Financial reader's `round2`.
   - `Invoice`/`Reversal invoice` → `formatInvoiceNumber(invoice_number)` (`PINV-000042`).
   - `Ledger status` → the bonus `financial_entry.status` humanised (`APPROVED`→`Approved`, `VOIDED`→`Voided`, `PENDING`→`Pending`, `CANCELLED`→`Cancelled`); empty when there is no entry (PENDING reward).
   - `Status` → `REWARD_AWARD_STATUS_LABELS[status]` for award rows (PENDING renders "Pending review"), "Skipped (goal inactive)" / "No achievers" for the synthetic rows.
   - `Voided after invoicing` → `status === 'VOID' && inspector_invoice_id != null ? 'Yes' : 'No'` (empty on non-reward rows).
   - **No raw id, no coordinate** in any cell.

## Request plumbing (place +1)

In `request-report.use-case.ts`: `const dateAxisField = reportType === 'FINANCIAL' ? 'effective_at' : reportType === 'INSPECTOR_PROGRAM' ? 'period_end' : REPORT_DATE_AXIS_FIELD[filters.dateAxis];`. For `INSPECTOR_PROGRAM`, `resolveReportTenantScope` already returns the operator's requested tenant or null; add an explicit force so a stray `filters.tenantId` from an operator is dropped (`effectiveTenantId = reportType === 'INSPECTOR_PROGRAM' ? null : resolveReportTenantScope(...)`), and `agencyScoped` stays false for operators. CL_* are already rejected by `assertReportTypeAllowed` before this point.

## Dialog (place +2)

In `GenerateReportDialog.tsx`: add `isInspectorProgram = reportType === ReportType.INSPECTOR_PROGRAM`; exclude it from `AGENCY_REPORT_TYPE_OPTIONS` (alongside `AGENCIES`); gate the Agency, Branch, Suburb, Status, Date-axis and "Group by property" fields with `!isInspectorProgram`; in `handleSubmit`, send only `fromDate`/`toDate` (+ the harmless default `dateAxis`) when inspector-program. The submitted payload must omit `tenantId`/`branchId`/`suburb`/`status`/`groupProperties`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Platform-scoped report (`tenant_id = NULL`, no tenant predicate on the program reads) — a documented exception to Constitution §II / root `CLAUDE.md` §7.1 | The inspector program entities are platform-scoped by design (the inspector is cross-tenant; F08 precedent, approved by the plan/client). The report over them cannot carry a tenant. | A tenant-scoped report would be meaningless (goals/rewards have no agency) and would leak cross-agency inspector data if forced onto one tenant. RBAC (AM/OP-only, CL_* 403) is the isolation boundary, matching F07/F08-1/F08-6. |
| Reader reaches `reward_awards`/`financial_entries`/`inspector_invoices` directly (no cross-module port) | The report reader already reaches `financial_entries` directly for the FINANCIAL report; adding a cross-module read port for one report would be heavier than the pattern it joins. | A dedicated inspector-program read port would duplicate the F08-6 reward reader for a read-only export with no behaviour; the Prisma query is self-contained and tested against a real DB. |
