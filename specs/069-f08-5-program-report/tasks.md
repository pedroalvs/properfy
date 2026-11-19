# Tasks: Inspector Program Report (`INSPECTOR_PROGRAM`)

**Feature**: `069-f08-5-program-report` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

TDD is mandatory (Constitution §III): every implementation task is preceded by a failing test. Build order follows the dependency chain shared → prisma → backend → web → contract → docs. Paths are repo-relative to the worktree root.

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green (deps installed, `prisma generate` run, `@properfy/shared` + `@properfy/frontend-standards` built, affected workspaces typecheck+lint clean) — delegated to the setup subagent; do not re-run the full suite here.

## Phase 2: Foundational (blocking prerequisites for all stories)

- [ ] T002 [P] Update `packages/shared/src/schemas/report.test.ts`: change the three "4 report types" assertions (`requestReportSchema accepts`, `listReportsQuerySchema accepts`, `list filters`) to 5 types including `INSPECTOR_PROGRAM` (RED).
- [ ] T003 Add `INSPECTOR_PROGRAM: 'INSPECTOR_PROGRAM'` to `ReportType` in `packages/shared/src/enums/misc.ts`, then `pnpm --filter @properfy/shared build` (makes T002 GREEN).
- [ ] T004 Add `INSPECTOR_PROGRAM` to `enum ReportType` in `apps/backend/prisma/schema.prisma`; create migration `apps/backend/prisma/migrations/<YYYYMMDDhhmmss>_report_type_inspector_program/migration.sql` with `ALTER TYPE "ReportType" ADD VALUE 'INSPECTOR_PROGRAM';`; run `pnpm --filter backend exec prisma generate`.

**Checkpoint**: the enum value exists in shared types + Prisma client; `Record<ReportType, …>` maps now fail to compile until filled (T008) — this is expected and drives the next phase.

## Phase 3: User Story 1 — Operator generates & downloads the report (Priority: P1)

**Goal**: An AM/OP produces an XLSX with one row per reward of each in-range closure, plus no-achievers and `SKIPPED_INACTIVE` rows; empty range → header-only READY.

**Independent test**: Seed closures/awards (minus the bonus-ledger cases, which are US2), request the report as AM, assert rows/columns/order and `READY`/`rowCount`.

### Tests (write first — RED)

> Report tests live in `apps/backend/tests/unit/report/` and `apps/backend/tests/integration/report/` (not colocated in `src/`). The reader integration test uses the real-Postgres `setupDbHarness()` yet is under `tests/integration/report/`, so it runs in the **default `pnpm test`** (only `tests/integration/db/**` is excluded) — **not** `test:integration:db`.

- [ ] T005 [US1] In `apps/backend/tests/unit/report/request-report.use-case.test.ts` add: `INSPECTOR_PROGRAM` as AM/OP → `tenantId null`, `agencyScoped false`, `dateAxisField 'period_end'` even when `filters.tenantId` is set, and an audit `reportRequested` is logged (SC-004); `> 12 months` → `ReportDateRangeExceededError(12)`.
- [ ] T006 [US1] In `apps/backend/tests/unit/report/process-report-job.use-case.test.ts` add: an `INSPECTOR_PROGRAM` report dispatches to `getInspectorProgramRows`, resolves `INSPECTOR_PROGRAM_COLUMNS`, and an empty result → header-only sheet, `READY`, `rowCount 0`.
- [ ] T007 [US1] Extend `apps/backend/tests/integration/report/prisma-report-data-reader.integration.test.ts` with a new `describe('getInspectorProgramRows …')` (reuses the file's real-DB harness): 2 goals, 3 closures with `period_end` in range (+ 1 out of range excluded), a closure with no achievers, a `SKIPPED_INACTIVE` closure → one row per reward ordered by P9, one "No achievers" row, one "Skipped (goal inactive)" row (Participants 0, Promised 0.00); civil dates `YYYY-MM-DD`; **no** agency/address/coordinate column; no raw id.

### Implementation (GREEN)

- [ ] T008 [P] [US1] In `apps/backend/src/modules/report/domain/report.constants.ts`: add `INSPECTOR_PROGRAM: 12` to `MAX_DATE_RANGE_MONTHS`, define `INSPECTOR_PROGRAM_COLUMNS` (the 31 columns from data-model.md), and add the `REPORT_COLUMNS.INSPECTOR_PROGRAM` entry.
- [ ] T009 [P] [US1] In `apps/backend/src/modules/report/domain/report-data-reader.ts`: add `getInspectorProgramRows(filters): Promise<Record<string, unknown>[]>` to `IReportDataReader`.
- [ ] T010 [US1] In `apps/backend/src/modules/report/application/use-cases/process-report-job.use-case.ts`: add `case 'INSPECTOR_PROGRAM': rows = await this.dataReader.getInspectorProgramRows(filters); break;`.
- [ ] T011 [US1] In `apps/backend/src/modules/report/application/use-cases/request-report.use-case.ts`: set `dateAxisField = 'period_end'` for `INSPECTOR_PROGRAM` and force `effectiveTenantId = null` for it (operator `filters.tenantId` ignored).
- [ ] T012 [US1] In `apps/backend/src/modules/report/infrastructure/prisma-report-data-reader.ts`: implement `getInspectorProgramRows` — closures-in-range query (`period_end` ∈ range, include goal, order by `period_start`,title), awards grouped by `(goal_id,period_start)` ordered by P9 (reuse/mirror `compareAwardsForRanking`), emit reward / no-achievers / skipped rows; civil via `formatCivilDate`, instants via `formatInstantDateTime(value, filters.timezone)`, amounts 2-dp, `describeGoal` for Goal description, `goalTermsForPeriod` for the no-achievers Per winner. (Bonus-ledger columns are stubbed empty here and filled in US2.)

**Checkpoint**: US1 rows render; the reader DB test (US1 assertions) passes.

## Phase 4: User Story 2 — Reward rows reflect bonus ledger & invoice (Priority: P1)

**Goal**: Each reward row shows Ledger status, Invoice, Paid at, Voided after invoicing, Reversal invoice (Q12).

**Independent test**: Seed rewards across every lifecycle state incl. void-after-paid with a reversal; assert the five Q12 columns.

### Tests (RED)

- [ ] T013 [US2] Extend the same `tests/integration/report/prisma-report-data-reader.integration.test.ts` program-report block: `PAID` on invoice 42 → Invoice `PINV-000042`, Ledger status `Approved`, Paid at = invoice paid_at; `APPROVED` un-invoiced → Invoice empty, Ledger status `Approved`; `VOID` pre-invoice → Ledger status `Voided`, "Voided after invoicing" `No`; `VOID` after paid + reversal on invoice 57 → "Voided after invoicing" `Yes`, Paid at kept, Reversal invoice `PINV-000057` (empty before the reversal is invoiced); `PENDING` → ledger/invoice columns empty; assert **no raw id** in any cell.

### Implementation (GREEN)

- [ ] T014 [US2] In `prisma-report-data-reader.ts` `getInspectorProgramRows`: include `financial_entry: { select: { id, status } }` and `inspector_invoice: { select: { invoice_number, status } }`; batch-resolve reversal invoices (`financialEntry.findMany` by `reference_entry_id ∈ original ids`, then `inspectorInvoice.findFirst` with `line_items_snapshot: { array_contains: [{ entryId }] }`, status CLOSED/PAID); map Ledger status (humanised entry status), Invoice (`formatInvoiceNumber`), Paid at, Voided after invoicing, Reversal invoice.

**Checkpoint**: the full reader DB test passes (US1 + US2).

## Phase 5: User Story 3 — Agencies/inspectors cannot access (Priority: P1)

**Goal**: CL_* get 403 and never see the option; INSP/TNT have no report access.

### Tests (RED)

- [ ] T015 [US3] In `apps/backend/tests/unit/report/request-report.use-case.test.ts`: CL_ADMIN and CL_USER requesting `INSPECTOR_PROGRAM` → `ReportForbiddenError` with message "Agencies cannot generate the INSPECTOR_PROGRAM report".
- [ ] T016 [US3] Create `apps/backend/tests/unit/report/report-access.test.ts`: assert `INSPECTOR_PROGRAM` is **not** in `AGENCY_REPORT_TYPES` and that `assertReportTypeAllowed` throws for an agency actor but is a no-op for AM/OP.

### Implementation (GREEN)

- [ ] T017 [US3] In `apps/backend/src/modules/report/application/report-access.ts`: leave `INSPECTOR_PROGRAM` out of `AGENCY_REPORT_TYPES` and add a comment stating it is operator-only (platform-scoped, D8). (No functional change beyond the comment + the test proving the default-deny.)

## Phase 6: User Story 4 — Dialog tailored to the program report (Priority: P2)

**Goal**: Selecting "Inspector program" hides agency-scoped fields and submits only the date range; the type renders with its chip/token; agency roles never see the option.

### Tests (RED)

- [ ] T018 [US4] In `apps/web/src/features/reports/components/GenerateReportDialog.test.tsx` (create/extend): AM/OP see "Inspector program", CL_* do not; when selected, Agency/Branch/Suburb/Status/Date-axis/"Group by property" are hidden and submit sends only `fromDate`/`toDate`; `REPORT_TYPE_MAP` has 5 keys.

### Implementation (GREEN)

- [ ] T019 [P] [US4] In `apps/web/src/lib/status-colors.ts`: add `[ReportType.INSPECTOR_PROGRAM]: { bg: 'var(--color-report-type-inspector-program)', text: 'var(--color-text-primary)', label: 'Inspector program' }` to `REPORT_TYPE_MAP`.
- [ ] T020 [P] [US4] In `apps/web/src/styles/tokens.css`: add `--color-report-type-inspector-program: #FFF9C4;` (text contrast ≥ 4.5:1) in the report-type token block.
- [ ] T021 [US4] In `apps/web/src/features/reports/components/GenerateReportDialog.tsx`: add `isInspectorProgram`; exclude `INSPECTOR_PROGRAM` from `AGENCY_REPORT_TYPE_OPTIONS`; gate Agency/Branch/Suburb/Status/Date-axis/"Group by property" with `!isInspectorProgram`; in `handleSubmit`, emit only the date range for the type.

## Phase 7: Polish & Cross-Cutting

- [ ] T022 Regenerate the contract: `pnpm generate:api`; commit both `packages/shared/openapi.json` and `packages/shared/src/api-types.ts` (CI `contract-freshness`).
- [ ] T023 [P] Update CLAUDE.md docs: `apps/backend/CLAUDE.md` (add the "adding a ReportType touches 12 places" table under the report module); `apps/web/CLAUDE.md` (reports decision note for the new type/dialog); `packages/shared/CLAUDE.md` (misc-enum `ReportType` note). Keep within the existing sections.
- [ ] T024 Run full gates inside the worktree via a subagent (condensed summary): `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test` (**this runs the new reader integration test** — it is under `tests/integration/report/`, not excluded); `pnpm --filter backend test:integration:db` (full-suite completeness — exercises the existing `tests/integration/db` suite; this PR adds none there); `pnpm --filter web typecheck lint test`; `git diff --stat origin/develop... | tail -1` (< 150 files).

## Dependencies & order

- **T002/T003 → everything** (shared enum is the type source).
- **T004 → backend tasks** (Prisma client knows the value).
- **T008 is forced by the compiler** (the `Record<ReportType,…>` maps won't compile without it) — do it early in Phase 3.
- **T009 (port) → T010 (switch) and T012 (impl)**.
- **T012 → T014** (same method; US2 extends US1's reader).
- **US3 (T015–T017)** depends only on T003/T011 (the request path).
- **US4 (T018–T021)** depends only on T003 + api-types (T022 can run before or after US4 typecheck; regenerate before the final web typecheck).
- **T022 before T024** (web/shared typecheck sees fresh api-types).

## Parallel opportunities

- T019 and T020 (web token + map) are independent files → `[P]`.
- Within Phase 3, T008/T009 touch different files → `[P]`; T012 waits on T009.
- US3 and US4 can proceed in parallel once the backend request path (T011) and shared enum (T003) exist.

## MVP

User Story 1 + User Story 3 (generate the report for AM/OP; deny agencies) is the minimal shippable slice; US2 (bonus columns) and US4 (dialog polish) complete the contract item 03.14 as specified.
