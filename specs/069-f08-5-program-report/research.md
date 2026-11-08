# Research — Inspector Program Report (`INSPECTOR_PROGRAM`)

All items below were resolvable from the task doc, the merged F08-1/F08-3/F08-6 code, and the existing report module. No `NEEDS CLARIFICATION` remain.

## D1 — "Reversal invoice" resolution

**Decision**: Find the reversal entry via `financial_entries.reference_entry_id = <original bonus entry id>` (`entry_type = INSPECTOR_BONUS`, `amount < 0`), then find the invoice carrying it with a Prisma JSON-containment filter: `inspectorInvoice.findFirst({ where: { status: { in: ['CLOSED','PAID'] }, line_items_snapshot: { array_contains: [{ entryId: reversalId }] } } })`; render `formatInvoiceNumber(invoice_number)`. Empty until the reversal is invoiced.

**Rationale**: `financial_entries` has no `inspector_invoice_id` column, and the reversal carries `reference_entry_id` (not `reward_award_id`), so the only link from a reversal entry to its invoice is the invoice's `line_items_snapshot` (which stores each bonus line with `entryId`, per the F08-6 `invoiceSnapshotLineSchema`). The schema ships a GIN index `inspector_invoices_line_items_snapshot_gin` (JsonbPathOps) precisely to back snapshot CONTENT filters. Prisma `array_contains` compiles to the jsonb `@>` containment operator, so `[{entryId: X}]` matches a line object that contains at least `entryId: X`.

**Alternatives considered**: (a) `$queryRaw` with `@>` — rejected: the task forbids `$queryRaw` in the reader and Prisma expresses this natively. (b) Adding an `inspector_invoice_id`/`reward_award_id` to the reversal entry — rejected: out of scope (F08-6 owns the ledger model; this is a read-only report) and would change merged behaviour.

## D2 — Instant timezone (DR5)

**Decision**: Render `Approved at` / `Paid at` / `Voided at` with `formatInstantDateTime(value, filters.timezone)` — the **requester's timezone** resolved by `ProcessReportJobUseCase.timezoneResolver` for platform runs; falls back to `PLATFORM_TIMEZONE` when absent. Civil-date columns use `formatCivilDate(value)` (no tz) since period dates are stored civil `PLATFORM_TIMEZONE` dates and `achieved_on` is a frozen civil date.

**Rationale**: DR5 (L-X00-03) states report instants are shown in the requester's timezone (display only). `filters.timezone` is already plumbed into the reader by the process-job use case; passing it to the formatter satisfies DR5 exactly.

**Note / latent inconsistency**: the existing readers (`getAppointmentRows`, `getFinancialRows`) call `formatInstant*` **without** `filters.timezone`, so they currently render in `PLATFORM_TIMEZONE` regardless. This new reader deliberately passes `filters.timezone` (DR5). Fixing the sibling readers is **out of scope** (Constitution §V — change only what the task requires); noted for a possible follow-up.

### Civil-date display format (decision)

Civil-date columns render via the shared `formatCivilDate` → **`dd/mm/yyyy`** (e.g. `11/03/2026`), the exact format every other report type already uses (Appointments "Scheduled Date", Financial "Entry Date"). The task's test sketch wrote `YYYY-MM-DD` illustratively ("civil dates as recorded"); rendering the Inspector Program sheet in a *different* date format than the rest of the report suite would be an inconsistency in the same product surface. This is a formatting-consistency call (not a product decision), so the reader + its DB test assert `dd/mm/yyyy`.

## D3 — Period range bound on `period_end`

**Decision**: Select closures with `period_end` in `[fromDate, toDate]` (inclusive, civil-date comparison). Store `dateAxisField = 'period_end'` in the report's `filters_json` (mirroring FINANCIAL's `'effective_at'`).

**Rationale**: Task place +1. A closure "belongs" to the report range by when its period ended; `period_end` is a `@db.Date` compared directly against the civil-date filter strings — no instant/tz conversion.

## D4 — Row ordering (P9)

**Decision**: Rows are grouped per closure in the closure's order (`period_start` asc, then goal title); within a closure, award rows follow the P9 ranking: value desc → `index_score_at_close` desc (nulls last) → `achieved_on` asc → `inspector_id`. Reuse the inspector-program domain comparator (`compareAwardsForRanking`, `domain/ordering.ts`) if it is importable from the report module; otherwise inline the identical comparator in the reader.

**Rationale**: P9 defines the AM/OP list order; the report must match the Rewards panel's ordering for homologation. `compareAwardsForRanking` is the single source already used by the reward list.

## D5 — `Per winner` and `Promised`

**Decision**: `Per winner` = the award snapshot `amount` on an award row; on a no-achievers row, `goalTermsForPeriod(goal, period)` reward amount (the terms in force that period); empty on a `SKIPPED_INACTIVE` row. `Promised` = the closure `promised_amount` (P10). `goalTermsForPeriod` is the backend helper `apps/backend/src/modules/inspector-program/domain/goal-periods.ts`.

**Rationale**: P10 + L-F08-02. The award amount is frozen; the no-achievers row has no award, so the goal's in-force terms give the per-winner figure.

## D6 — Scope / Goal description

**Decision**: `Scope` = the frozen `scope_label` (award snapshot; closure's on a no-achievers row). `Goal description` = `describeGoal({ metric, target, scopeLabel })` (shared `lib/goal-copy.ts`). A `null` scope label uses `describeGoal`'s built-in deleted-scope fallback.

**Rationale**: DL13. The region/service-type may be deleted after close; the frozen label is the only safe source; `describeGoal` already handles null.

## D7 — Enum migration safety

**Decision**: `ALTER TYPE "ReportType" ADD VALUE 'INSPECTOR_PROGRAM';` in a dedicated expand migration; the value is not used in the same transaction.

**Rationale**: Postgres forbids using a freshly-added enum value in the same transaction. The report request writes `report_type = INSPECTOR_PROGRAM` only at runtime (long after the migration committed), so this is safe. Rollback leaves the value unused (harmless); the generated files expire by the 30-day retention.

## D8 — `Ledger status` source

**Decision**: `Ledger status` = the bonus `financial_entry.status` (the entry linked by `reward_award_id`), humanised; empty when there is no entry (PENDING reward, before F08-6 mints the entry at approval). The report selects `financial_entry: { select: { id: true, status: true } }` (extends the F08-6 reward include, which only selected `id`).

**Rationale**: Task algorithm — "Ledger status = status of the INSPECTOR_BONUS entry (`reward_award_id`)". The entry is minted inside the approval CAS (F08-6), so a PENDING reward has none.

## D9 — No example in seed

**Decision**: No seed report for this type.

**Rationale**: Explicit task constraint ("Sem relatório de exemplo no seed").
