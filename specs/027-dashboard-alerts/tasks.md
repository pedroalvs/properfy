# Tasks: Dashboard Alerts (027)

**Feature**: `027-dashboard-alerts`
**Plan**: `./plan.md` · **Spec**: `./spec.md`
**Branch**: `feature/dashboard-alerts` (NEW; off latest `develop`)
**Reference label**: `feat.dashboard.alerts`

## Convention

- Dependency-ordered top-to-bottom.
- `[shared]` `[backend]` `[web]` `[test]` tags.
- TDD: tests precede or co-land with the code they cover. Watch them fail before making them pass.
- Quality gates green at every checkpoint: lint, typecheck, test.

---

## 0. Prerequisite

- [ ] **T-027-001** Confirm `develop` is up to date locally. Create branch `feature/dashboard-alerts` from latest `develop`.

## 1. Shared schemas + types

- [ ] **T-027-101 [shared]** Extend `packages/shared/src/schemas/responses.ts`:
  - Add `inspectorDayCountSchema` (uuid, name, non-negative int, alertLevel enum nullable).
  - Add `inspectorBreakdownsSchema` (three arrays of `inspectorDayCountSchema`).
  - Extend `dashboardStatsResponseSchema.appointmentsByStatus` with `doneThisWeek`, `scheduledThisWeek`, `rejectedTotal` (all `z.number()`).
  - Add `inspectorBreakdowns: inspectorBreakdownsSchema.nullable()` at the top level.
  - Export `InspectorDayCount` and `InspectorBreakdowns` types via `z.infer`.
  - Re-emit `DashboardStatsResponse` (already inferred — no manual edit).
- [ ] **T-027-102 [shared][test]** Add or extend a test in `packages/shared/src/schemas/responses.test.ts` (or wherever schema tests live) asserting:
  - Schema parses a fully-populated AM-shaped payload.
  - Schema parses a CL_ADMIN-shaped payload with `inspectorBreakdowns: null`.
  - Schema rejects a payload where `inspectorBreakdowns` is missing entirely (i.e., the key is required even if nullable).
  - Schema rejects an `alertLevel` outside the enum.
- [ ] **T-027-103 [shared]** Run `pnpm --filter shared test`. All green.
- [ ] **T-027-103a [shared]** Run `pnpm generate:api` from repo root. This regenerates `packages/shared/src/api-types.ts` from the backend's OpenAPI document so the openapi-fetch client picks up `appointmentsByStatus.{doneThisWeek,scheduledThisWeek,rejectedTotal}` and `inspectorBreakdowns`. Commit the regenerated file. Verify with `pnpm typecheck` at root (frontend consumers of `paths['/v1/dashboard/stats']` must compile against the widened response).

## 2. Backend — domain port

- [ ] **T-027-201 [backend]** Extend `apps/backend/src/modules/dashboard/domain/dashboard.repository.ts`:
  - Update `DashboardRepository.getStats(tenantId?: string, includeInspectorBreakdowns?: boolean)` signature.
  - Re-import `DashboardStatsOutput` (or keep import as-is — its shape change happens in step 3).

## 3. Backend — application layer (use case)

- [ ] **T-027-301 [backend]** Extend `apps/backend/src/modules/dashboard/application/use-cases/get-dashboard-stats.use-case.ts`:
  - Extend `DashboardStatsOutput` per data-model.md (3 new scalars + `inspectorBreakdowns: InspectorBreakdowns | null`).
  - Add the `InspectorDayCount` and `InspectorBreakdowns` interface exports.
  - Inside `execute`: compute `const includeInspectorBreakdowns = ['AM', 'OP'].includes(actor.role)` and call `this.repository.getStats(tenantId, includeInspectorBreakdowns)`.
- [ ] **T-027-302 [backend][test]** Create or extend `get-dashboard-stats.use-case.test.ts` (TDD: write first):
  - For each role in `['AM', 'OP']`: stub repo to return `inspectorBreakdowns: { ... }`, verify use case calls repo with `includeInspectorBreakdowns=true`, returns breakdowns in output.
  - For each role in `['CL_ADMIN', 'CL_USER']`: verify use case calls repo with `includeInspectorBreakdowns=false`, returns `inspectorBreakdowns: null`.
  - For each role in `['INSP', 'TNT']`: verify `ForbiddenError` thrown (existing behaviour).
  - Tenant scoping unchanged: CL_* uses `actor.tenantId`; AM/OP uses `undefined`.

## 4. Backend — infrastructure (Prisma repository)

- [ ] **T-027-401 [backend]** Extend `apps/backend/src/modules/dashboard/infrastructure/prisma-dashboard.repository.ts`:
  - Add private `currentWeekRange(now: Date = new Date()): { from: Date; to: Date }` helper. **Server-local time**, Monday 00:00:00.000 to Sunday 23:59:59.999. Implementation per `plan.md` §Date-boundary semantics.
  - Add private `tomorrowRange(now: Date = new Date()): { from: Date; to: Date }` helper. **Server-local time**, tomorrow 00:00:00.000 to tomorrow 23:59:59.999.
  - Add private static `computeAlertLevel(count: number): 'yellow' | 'red' | null` helper. `>=18 -> 'red'`, `>=15 -> 'yellow'`, else `null`.
  - Update `getStats(tenantId?, includeInspectorBreakdowns = false)` signature.
  - Add three scalar queries to the existing `Promise.all`: `doneThisWeek` (status DONE, updated_at in current week, tenant scope), `scheduledThisWeek` (status SCHEDULED, scheduled_date in current week, tenant scope), `rejectedTotal` (status REJECTED, no date filter, tenant scope, `deleted_at: null`).
  - When `includeInspectorBreakdowns === true`: add the three groupBy queries to the same `Promise.all`. **EVERY groupBy `where` MUST include `inspector_id: { not: null }` to prevent emitting a null bucket** (the schema requires `inspectorId: z.string().uuid()`):
    - `tomorrowByInspector`: `where: { ...tenantFilter, deleted_at: null, status: 'SCHEDULED', tenant_confirmation_status: 'CONFIRMED', inspector_id: { not: null }, scheduled_date: { gte: tomorrowRange().from, lte: tomorrowRange().to } }`, `by: ['inspector_id']`, `_count: { _all: true }`.
    - `scheduledThisWeekByInspector`: `where: { ...tenantFilter, deleted_at: null, status: 'SCHEDULED', inspector_id: { not: null }, scheduled_date: { gte: currentWeekRange().from, lte: currentWeekRange().to } }`, `by: ['inspector_id']`, `_count: { _all: true }`.
    - `confirmedThisWeekByInspector`: `where: { ...tenantFilter, deleted_at: null, status: 'SCHEDULED', tenant_confirmation_status: 'CONFIRMED', inspector_id: { not: null }, scheduled_date: { gte: currentWeekRange().from, lte: currentWeekRange().to } }`, `by: ['inspector_id']`, `_count: { _all: true }`.
  - Resolve inspector names: collect union of `inspector_id`s from the three lists (`inspector_id` is non-null in the result rows because of the where filter); one `inspector.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })`; build `Map<id, name>`.
  - Build each list: shape rows as `{ inspectorId, inspectorName, count, alertLevel }`. `alertLevel` is computed via `computeAlertLevel(count)` only for `tomorrowByInspector`; the other two lists use `null`. If a row's `inspector_id` is somehow missing from the `findMany` result (shouldn't happen because of FK constraints), exclude the row from the list AND log a warning — do NOT emit a row with an empty `inspectorName`.
  - Sort each list `count DESC`. For ties, secondary sort by `inspectorName ASC` for deterministic output.
  - When `includeInspectorBreakdowns === false`: skip the three groupBy queries; set `inspectorBreakdowns: null` in the return.
  - Return shape matches `DashboardStatsOutput`.
- [ ] **T-027-402 [backend][test]** Create `prisma-dashboard.repository.test.ts` (TDD: write first):
  - Mock `PrismaClient` (factory pattern, returning the methods used: `appointment.count`, `appointment.groupBy`, `appointment.findMany`, `inspector.count`, `inspector.findMany`, etc.). Reuse any existing test helper for mocked Prisma if present in the repo.
  - Assert: with `tenantId='t1'`, the three new scalar queries are called with `where` including `{ tenant_id: 't1', deleted_at: null, status: ... }` and the expected date bounds.
  - Assert: with `includeInspectorBreakdowns=false`, `appointment.groupBy` is NOT called.
  - Assert: with `includeInspectorBreakdowns=true`, `appointment.groupBy` is called three times with the expected `where`/`by`/`_count`.
  - **Assert: each of the three groupBy `where` clauses includes `inspector_id: { not: null }`** (covers Planejador round 1 blocker 4).
  - Assert: `computeAlertLevel` boundaries: 14 -> null, 15 -> 'yellow', 17 -> 'yellow', 18 -> 'red', 25 -> 'red'.
  - Assert: `currentWeekRange` (server-local) on a fixed Monday `now` returns Monday 00:00:00.000 -> Sunday 23:59:59.999; on a Sunday `now`, returns the same Monday/Sunday pair (i.e., always anchored to the current week starting Monday); on a Wednesday `now`, returns the Monday two days prior through the Sunday four days later.
  - Assert: `tomorrowRange` (server-local) on a fixed `now` returns next-day 00:00:00.000 -> next-day 23:59:59.999.
  - Assert: inspector-name resolution merges the right name onto the right id even when the three lists overlap.
  - Assert: tie-breaking by `inspectorName ASC` when two rows have the same count.
- [ ] **T-027-403 [backend]** Run `pnpm --filter backend test`. All green.

## 5. Backend — route layer (no code change, contract test MANDATORY)

- [ ] **T-027-501 [backend][test]** Verify `apps/backend/src/modules/dashboard/interfaces/dashboard.routes.ts` requires NO change (the route already uses `successResponseSchema(dashboardStatsResponseSchema)` from shared; widening the schema is transparent).
- [ ] **T-027-502 [backend][test]** **MANDATORY** (made mandatory per Planejador round 1) — Extend `apps/backend/tests/integration/dashboard/dashboard.routes.test.ts`:
  - Add a test case mocking AM context where `mockGetDashboardStatsExecute` returns a payload INCLUDING the new scalars and a populated `inspectorBreakdowns` object (with at least one row each in the three lists, alertLevels covering null/yellow/red on the Tomorrow list).
  - Add a test case mocking a CL_ADMIN context where `mockGetDashboardStatsExecute` returns a payload INCLUDING the new scalars and `inspectorBreakdowns: null`.
  - For BOTH test cases, parse `res.body` through `successResponseSchema(dashboardStatsResponseSchema)` from `@properfy/shared` and assert `.success === true`. This proves the Fastify response schema accepts the widened contract end-to-end and catches any drift between the route's declared schema and the use case's output type.
  - Existing tests must continue to pass with the new scalars added to `mockStats`.

## 6. Quality gate — backend

- [ ] **T-027-601 [backend]** `pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test`. All green.

## 7. Frontend — types

- [ ] **T-027-701 [web]** Extend `apps/web/src/features/dashboard/types/index.ts` per data-model.md (add `InspectorDayCount`, `InspectorBreakdowns`; extend `DashboardStats.appointmentsByStatus` with 3 scalars; add `inspectorBreakdowns: InspectorBreakdowns | null` at the top level).

## 8. Frontend — DashboardSummaryCards (restructure)

- [ ] **T-027-801 [web][test]** Extend `apps/web/src/features/dashboard/components/DashboardSummaryCards.test.tsx` (TDD: write first):
  - Assert Row 1 renders 4 cards with labels Draft, Awaiting Inspector, Scheduled, Rejected Total (and the corresponding values from props).
  - Assert Row 2 renders 3 cards with labels Done This Week, Done This Month, Scheduled This Week.
  - Assert Row 2 has a section label element (e.g., look for the uppercase secondary-text label) ABOVE the row.
  - Existing "renders all cards / links" tests remain green.
- [ ] **T-027-802 [web]** Modify `apps/web/src/features/dashboard/components/DashboardSummaryCards.tsx`:
  - Extend the props interface to include `rejectedTotal: number`, `doneThisWeek: number`, `scheduledThisWeek: number`.
  - Render two `<div>` rows. Row 1 uses `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`. Row 2 uses `grid grid-cols-1 sm:grid-cols-3 gap-4`.
  - Between rows, render the small section label per spec §5.2.
  - Use existing `StatCard` for all cards. Border colors and icon classes per spec §5.2.
  - Compute the `href` for the new cards using the existing date-range helpers (`weekRange()` analogous to `monthRange()`; the `rejectedTotal` card links to `/appointments?status=REJECTED` with no date filter).

## 9. Frontend — InspectorBreakdownSection (new)

- [ ] **T-027-901 [web][test]** Create `apps/web/src/features/dashboard/components/InspectorBreakdownSection.test.tsx` (TDD: write first):
  - With mocked `breakdowns`, all three cards render with their titles.
  - Inspector rows render: name, count, dot, count color all match `alertLevel` (`red` -> `bg-error` / `text-error`; `yellow` -> `bg-warning` / `text-warning`; `null` -> `bg-gray-300` / `text-text-primary`).
  - Empty list (e.g., `tomorrowByInspector: []`) renders "No inspections" text.
  - The threshold legend is present on the Tomorrow card AND ABSENT on the other two cards.
  - `tomorrowLabel` prop appears in the Tomorrow card header.
- [ ] **T-027-902 [web]** Create `apps/web/src/features/dashboard/components/InspectorBreakdownSection.tsx`:
  - Props per spec §5.3.
  - Layout: `grid grid-cols-1 lg:grid-cols-3 gap-4`.
  - Three cards: Tomorrow's Load, Scheduled This Week, Confirmed This Week. Card primitive: white, `shadow-sm rounded` (consistent with other dashboard cards).
  - Header: mdi icon (consistent set) + title `text-base font-bold text-secondary`.
  - Rows: `flex items-center justify-between` with dot + name on the left and count on the right.
  - Dot color rules per spec.
  - Legend: only on Tomorrow card, in the footer.
  - Empty state: when the list is empty, render a centered muted text "No inspections".
- [ ] **T-027-903 [web]** Extend `apps/web/src/features/dashboard/components/index.ts` to export `InspectorBreakdownSection`.

## 10. Frontend — DashboardPage wiring

- [ ] **T-027-1001 [web][test]** Extend `apps/web/src/features/dashboard/pages/DashboardPage.test.tsx` (TDD: write first):
  - Mock `useDashboardStats` to return data with `inspectorBreakdowns: { ... }` -> assert `InspectorBreakdownSection` is rendered.
  - Mock to return `inspectorBreakdowns: null` -> assert `InspectorBreakdownSection` is NOT rendered (queryBy null).
  - Mock to return data with the new scalars -> assert the new cards are rendered.
- [ ] **T-027-1002 [web]** Modify `apps/web/src/features/dashboard/pages/DashboardPage.tsx`:
  - Pass `rejectedTotal`, `doneThisWeek`, `scheduledThisWeek` from `stats.appointmentsByStatus` into `DashboardSummaryCards`.
  - Compute `tomorrowLabel` from `new Date()` using existing date utilities (e.g., `Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(tomorrow)`).
  - Render `{stats.inspectorBreakdowns && <div className="mt-6"><InspectorBreakdownSection breakdowns={stats.inspectorBreakdowns} tomorrowLabel={tomorrowLabel} /></div>}` after the existing layout's grid block.

## 11. Quality gate — frontend

- [ ] **T-027-1101 [web]** `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`. All green.

## 12. Repo-wide gate

- [ ] **T-027-1201** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. All green.
- [ ] **T-027-1202** Manual smoke per `./quickstart.md` §2–4. Visual checks confirmed.
- [ ] **T-027-1203 [backend][perf]** **MANDATORY before merge** (added per Planejador round 1). Performance verification for the AM/OP path: run `EXPLAIN ANALYZE` (or wrap the endpoint with `console.time` in a staging dataset >= 200 appointments + >= 10 inspectors) hitting `GET /v1/dashboard/stats` as AM. Record the actual timings for the three new groupBy queries and the three new scalar queries. Acceptance: AM/OP path p95 < 500ms on staging-shaped data. If regression beyond that, do NOT block merge — open follow-up `T-027-1204` and document the measured numbers in the PR description so the reviewer can make an informed call.
- [ ] **T-027-1204 [backend][perf][followup]** OPEN ONLY IF `T-027-1203` shows regression. NOT scoped to this PR. Tracks: evaluate adding `appointments(status, scheduled_date)`, `appointments(status, updated_at)`, or `appointments(status)` partial indexes to support unscoped AM/OP queries. Index design + migration in a separate PR after measuring.

## 13. Handoff to QA / PR

- [ ] **T-027-1301** Push branch; open PR titled `feat(dashboard): alerts — rejected/this-week scalars + per-inspector breakdowns (027)`.
- [ ] **T-027-1302** Link spec `specs/027-dashboard-alerts/spec.md` and plan in the PR body.
- [ ] **T-027-1303** Notify the Revisor via the pipeline note.

---

## Out of scope (do NOT include in this PR)

- `done_at` column or any migration.
- PWA changes.
- Notification triggers tied to thresholds.
- Tenant-local timezone handling for the week or tomorrow boundary (the convention is server-local on the backend and browser-local on the frontend; see plan.md §Date-boundary semantics for the documented limitation).
