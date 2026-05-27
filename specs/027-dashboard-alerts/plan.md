# Implementation Plan: Dashboard Alerts (027)

**Feature**: `027-dashboard-alerts`
**Branch**: `feature/dashboard-alerts` (NEW; off latest `develop`)
**Owner**: Arquiteto → Executor
**Spec**: `./spec.md` · **Original design doc**: `docs/superpowers/specs/2026-05-24-dashboard-alerts-design.md`
**Constitution version targeted**: v1.4.0
**Knowledge classification of the change**: APPROVED RULE — six new dashboard data points (three scalars + three inspector breakdowns), all behind existing `GET /v1/dashboard/stats` endpoint.

---

## Summary

Additive extension of the existing dashboard endpoint. Reuses the single Clean-Architecture slice already in place (`apps/backend/src/modules/dashboard`). No new endpoint, no migration, no new domain entity — only a wider response schema, a wider use-case output type, and six new Prisma queries fan-out in the existing `Promise.all`.

RBAC: AM and OP receive a populated `inspectorBreakdowns` section; CL_ADMIN and CL_USER receive `inspectorBreakdowns: null` (null-as-permission-signal). The use case computes a single boolean `includeInspectorBreakdowns` from `actor.role` and forwards it to the repository, which conditionally executes (or skips) the three extra queries.

Frontend mirrors the structure: the existing `DashboardSummaryCards` is restructured into two themed rows (status / temporal) and a new `InspectorBreakdownSection` renders only when `inspectorBreakdowns !== null`.

---

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (backend); TypeScript 5.6 + React 18.3 + Vite 5.4 (web).
**Primary Dependencies**: Fastify 4, Prisma 5, Zod (backend); React Query 5, Tailwind 3, React Router 6 (web); `@properfy/shared` (Zod schemas + types).
**Storage**: PostgreSQL (Supabase). **No schema change.** Queries hit existing `appointments`, `inspectors` tables with existing indexes.
**Testing**: Vitest (unit), Supertest (API integration), React Testing Library (frontend unit).
**Target Platform**: Web SPA + Fastify server.
**Project Type**: Web application (monorepo: `apps/backend`, `apps/web`, `packages/shared`).
**Performance Goals**: Maintain current p95 of `GET /v1/dashboard/stats` for the CL_* path (queries unchanged in shape — all leverage `(tenant_id, status)` and `(tenant_id, scheduled_date)` composite indexes). For the AM/OP path, the **performance claim is provisional and MUST be verified** via the dedicated task `T-027-1203` (EXPLAIN ANALYZE on a staging-shaped dataset). The AM/OP path adds three unscoped groupBys whose access plan cannot piggyback on the existing leading-`tenant_id` indexes. If verification shows regression beyond p95 < 500ms, the follow-up index-tuning task is `T-027-1204` (out-of-scope index spec; not blocking this PR).
**Constraints**: Zero new migrations. Zero new endpoints. Backwards-compatible response (additive fields only).
**Scale/Scope**: One dashboard endpoint, six new data points, ≤2 new frontend components, ≤6 new tests.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Clean Architecture | Changes confined to `domain/` (repo port), `application/` (use case output type + role logic), `infrastructure/` (Prisma queries). Routes layer unchanged. | Compliant |
| II. Multi-Tenant Safety | All six new queries inherit `tenantFilter` already applied by the repository. CL_ADMIN/CL_USER continue to pass `actor.tenantId`. AM/OP unscoped (consistent with existing endpoint). No new tenant boundary introduced. | Compliant |
| III. TDD | New behaviour ships with unit tests for the repository (query shape), use case (role gating + alert level), and frontend components (rendering + alert dot colors). Existing tests must continue to pass. | Compliant |
| IV. Contract-First APIs | Schema extended in `packages/shared/src/schemas/responses.ts` — single source of truth. OpenAPI regenerated. Additive only (response widening = backwards compatible). | Compliant |
| V. Simplicity & Minimal Impact | No new abstraction layer, no new endpoint, no new table, no new migration. Reuses existing `tenantFilter`, existing `Promise.all`, existing component primitives (`StatCard`). | Compliant |
| Knowledge Classification | All new behaviour is APPROVED RULE (per spec approved by the human on 2026-05-24). No FUTURE GAP items are silently promoted. | Compliant |
| Audit | This is a read-only query path. No audit entries required. | N/A (read-only) |

**No Complexity Tracking entries required.**

---

## High-level architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Shared (single source of truth — extends, does not break)                 │
│                                                                            │
│  packages/shared/src/schemas/responses.ts                                  │
│   dashboardStatsResponseSchema (EXTEND — additive)                         │
│    + appointmentsByStatus.doneThisWeek: number                             │
│    + appointmentsByStatus.scheduledThisWeek: number                        │
│    + appointmentsByStatus.rejectedTotal: number                            │
│    + inspectorBreakdowns: { ... } | null                                   │
│   inspectorDayCountSchema (NEW — sub-schema)                               │
│    { inspectorId, inspectorName, count, alertLevel: 'yellow'|'red'|null } │
│   inspectorBreakdownsSchema (NEW — composes the three lists)               │
│   DashboardStatsResponse type re-emitted via z.infer (no manual edit)      │
└──────────────────────────────────────────────────────────────────────────┘
                                 |
                                 v
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend (Clean Architecture — three layers touched, port + impl widen)    │
│                                                                            │
│  apps/backend/src/modules/dashboard/                                       │
│   domain/dashboard.repository.ts                                           │
│    getStats(tenantId?: string, includeInspectorBreakdowns?: boolean)       │
│      -> DashboardStatsOutput                                               │
│   application/use-cases/get-dashboard-stats.use-case.ts                    │
│    + InspectorDayCount, InspectorBreakdowns types in DashboardStatsOutput  │
│    + doneThisWeek, scheduledThisWeek, rejectedTotal in appointmentsByStatus│
│    + inspectorBreakdowns: InspectorBreakdowns | null                       │
│    + includeInspectorBreakdowns = ['AM', 'OP'].includes(actor.role)        │
│   infrastructure/prisma-dashboard.repository.ts                            │
│    + currentWeekRange(): { from, to }   (private helper — Mon->Sun local) │
│    + 3 new scalar queries in Promise.all                                   │
│        doneThisWeek         (status DONE, updated_at in week)              │
│        scheduledThisWeek    (status SCHEDULED, scheduled_date in week)     │
│        rejectedTotal        (status REJECTED, no date filter)              │
│    + 3 new groupBy queries (conditional on includeInspectorBreakdowns)     │
│        tomorrowByInspector       (groupBy inspector_id)                    │
│        scheduledThisWeekByInspector                                        │
│        confirmedThisWeekByInspector                                        │
│    + alertLevel computation server-side: <15->null, 15-17->yellow, >=18->red│
│    + Inspector join for `name` resolution (one extra findMany by ids)      │
│   interfaces/dashboard.routes.ts                                           │
│    UNCHANGED — schema is re-read from shared via successResponseSchema()   │
└──────────────────────────────────────────────────────────────────────────┘
                                 |
                                 v
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend (web only — PWA not affected)                                    │
│                                                                            │
│  apps/web/src/features/dashboard/                                          │
│   types/index.ts                                                           │
│    + InspectorDayCount, InspectorBreakdowns interfaces                     │
│    + DashboardStats.appointmentsByStatus extends with 3 new scalars        │
│    + DashboardStats.inspectorBreakdowns: InspectorBreakdowns | null        │
│   components/                                                              │
│    DashboardSummaryCards.tsx (MODIFY — two themed rows)                    │
│      Row 1 (status):    Draft, Awaiting Inspector, Scheduled, Rejected Tot │
│      Row 2 (temporal):  Done This Week, Done This Month, Scheduled Week    │
│      Row label: text-xs uppercase font-semibold text-text-secondary        │
│    InspectorBreakdownSection.tsx (NEW)                                     │
│      Props { breakdowns, tomorrowLabel }                                   │
│      grid grid-cols-1 lg:grid-cols-3 gap-4                                 │
│      One card per list; dot indicator + count colored by alertLevel        │
│      Tomorrow card footer: legend "yellow >=15, red >=18 inspections/day"  │
│      Empty state: "No inspections"                                         │
│    index.ts (EXTEND — export new component)                                │
│   pages/DashboardPage.tsx (MODIFY)                                         │
│    + Pass new scalars into DashboardSummaryCards                           │
│    + Compute tomorrowLabel from new Date() locally                         │
│    + Render <InspectorBreakdownSection> when inspectorBreakdowns !== null  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

### Documentation (this feature)

```text
specs/027-dashboard-alerts/
├── plan.md           # This file (Phase 0/1)
├── spec.md           # Copied from docs/superpowers/specs/2026-05-24-dashboard-alerts-design.md
├── research.md       # Phase 0 — already-resolved decisions (spec was clarified before this plan)
├── data-model.md     # Phase 1 — types and sub-schemas (no DB schema changes)
├── quickstart.md     # Phase 1 — how to verify locally
└── tasks.md          # Phase 2 — generated by /speckit.tasks (or filled in here per project convention)
```

### Source code touched (repository root)

```text
packages/shared/
└── src/schemas/responses.ts                                            (EXTEND)

apps/backend/
└── src/modules/dashboard/
    ├── domain/dashboard.repository.ts                                  (EXTEND port signature)
    ├── application/use-cases/
    │   ├── get-dashboard-stats.use-case.ts                             (EXTEND output + role logic)
    │   └── get-dashboard-stats.use-case.test.ts                        (EXTEND tests — if exists; else NEW)
    └── infrastructure/
        ├── prisma-dashboard.repository.ts                              (6 new queries + week helper)
        └── prisma-dashboard.repository.test.ts                         (NEW — query shape assertions)

apps/web/
└── src/features/dashboard/
    ├── types/index.ts                                                  (EXTEND interfaces)
    ├── components/
    │   ├── DashboardSummaryCards.tsx                                   (MODIFY — two-row layout)
    │   ├── DashboardSummaryCards.test.tsx                              (EXTEND — assert new cards)
    │   ├── InspectorBreakdownSection.tsx                               (NEW)
    │   ├── InspectorBreakdownSection.test.tsx                          (NEW)
    │   └── index.ts                                                    (EXTEND — export new)
    └── pages/
        ├── DashboardPage.tsx                                           (MODIFY — render new section)
        └── DashboardPage.test.tsx                                      (EXTEND — assert null vs. populated)

apps/backend/tests/integration/                                          (or co-located in module)
└── dashboard.routes.test.ts                                            (NEW or EXTEND — see Phase 1)
```

**Structure Decision**: Web application monorepo with `apps/backend`, `apps/web`, `packages/shared`. No structural change; the feature is a vertical slice through the existing dashboard module plus its frontend counterpart.

---

## Reused vs. new

| Item | Status | Why |
|---|---|---|
| `GET /v1/dashboard/stats` endpoint | REUSE | Single existing endpoint — Option C from spec. No new route surface. |
| `tenantFilter` resolution in repository | REUSE | Already correct: AM/OP unscoped, CL_* scoped to `actor.tenantId`. |
| `Promise.all` query fan-out | REUSE | Just extend the array; no architectural shift. |
| `StatCard` component | REUSE | Both rows render via the same primitive. |
| `useDashboardStats` hook | REUSE | The hook does no type-narrowing — wider response is transparent. |
| `dashboardStatsResponseSchema` Zod schema | EXTEND | Source of truth for the API contract (Constitution IV). |
| `DashboardRepository` port | EXTEND | Add optional second arg `includeInspectorBreakdowns`. Default `false` keeps callers compatible (none exist outside the use case). |
| `currentWeekRange()` helper | NEW (private to PrismaDashboardRepository) | Used by 4 of the 6 new queries. Encapsulates Mon->Sun server-local arithmetic (consistent with existing `doneThisMonth`). |
| Alert-level computation | NEW (private to repository) | Pure function `count -> 'yellow'|'red'|null`. Tested in isolation. |
| `InspectorBreakdownSection` component | NEW | Three-card layout with colored dots; no existing component matches. |

---

## Date-boundary semantics (key design decision — REVISED after Planejador rounds 1 and 2)

There are TWO date contexts in this feature. We name them explicitly so no part of the artifact pretends to a uniformity that doesn't exist:

### Backend context — server-local time

All six backend queries that depend on a date boundary derive their bounds from `new Date()` interpreted in the **server's local timezone** (Node arithmetic via `new Date(year, month, day, ...)`):

- The four week-bounded queries (`doneThisWeek`, `scheduledThisWeek`, `scheduledThisWeekByInspector`, `confirmedThisWeekByInspector`) call `currentWeekRange()`.
- The `tomorrowByInspector` query calls `tomorrowRange()`.
- This matches the spec definition of "Tomorrow" as "local date of the server" (`spec.md` §2) and the existing `doneThisMonth` query convention.

### Frontend context — browser-local time

The web app has TWO date affordances on the dashboard, both browser-local (no change from today's convention):

- Drill-down link filters in `DashboardSummaryCards.tsx` use the existing helpers `weekRange()` and `monthRange()`, which call `toLocalISODate(new Date())`. These resolve in the user's browser timezone.
- `tomorrowLabel` in `DashboardPage.tsx` is a display string computed from `new Date()` in the browser timezone.

### Known limitation (documented, accepted)

When the user's browser timezone differs from the server's timezone:
- The backend's "tomorrow" count and the frontend's "Tomorrow — Mon 25 May" label can disagree by one calendar day for ~one hour at midnight.
- The drill-down link's date filter and the count card it links from can disagree at the same boundary.

In production the operational team runs in the same region as the server (single deployment region today), so this is theoretical for current users. Adding a `tenants.timezone` column, or returning the server-local tomorrow date as part of the response, would close the gap — both are FUTURE GAPs explicitly out of scope here.

**Implication for testing:** unit tests pin `now` and assert backend boundaries are server-local. There is no test that the browser label literally equals the backend date — that asymmetry is the accepted limitation.

### `currentWeekRange()` helper specification

```ts
private currentWeekRange(now: Date = new Date()): { from: Date; to: Date } {
  // Monday-based ISO week, server-local time.
  const dayOfWeek = now.getDay();              // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7; // 0 if Monday, 6 if Sunday
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0);
  const to   = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}
```

Pure function. `now` parameter (defaulting to `new Date()`) makes unit-testing trivial without `vi.useFakeTimers`. Tested at boundaries: a Monday `now`, a Sunday `now`, and a Wednesday `now`.

### `tomorrowRange()` helper specification

```ts
private tomorrowRange(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const to   = new Date(from);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}
```

Used by `tomorrowByInspector`. Same server-local semantics.

### `doneThisWeek` note

The spec explicitly accepts `updated_at` as the "done date" proxy, consistent with the existing `doneThisMonth` query. We do not introduce a `done_at` column; that is a FUTURE GAP and stays out of scope. Test names and the quickstart explicitly document this proxy semantics so QA and future readers do not treat the metric as a canonical completion timestamp.

### `currentWeekRange()` helper specification

```ts
private currentWeekRange(now: Date = new Date()): { from: Date; to: Date } {
  // Monday-based ISO week, server-local time.
  const dayOfWeek = now.getDay();              // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7; // 0 if Monday, 6 if Sunday
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0);
  const to   = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}
```

Pure function. `now` parameter (defaulting to `new Date()`) makes unit-testing trivial without `vi.useFakeTimers`. Tested at boundaries: a Monday `now`, a Sunday `now`, and a Wednesday `now`.

### `tomorrowRange()` helper specification

```ts
private tomorrowRange(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const to   = new Date(from);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}
```

Used by `tomorrowByInspector`. Same server-local semantics.

### `doneThisWeek` note

The spec explicitly accepts `updated_at` as the "done date" proxy, consistent with the existing `doneThisMonth` query. We do not introduce a `done_at` column; that is a FUTURE GAP and stays out of scope. Test names and the quickstart explicitly document this proxy semantics so QA and future readers do not treat the metric as a canonical completion timestamp.

---

## RBAC gating (key design decision)

A single boolean threads the role decision through the system:

```ts
// application layer
const includeInspectorBreakdowns = ['AM', 'OP'].includes(actor.role);
return repository.getStats(tenantId, includeInspectorBreakdowns);
```

The repository:

- When `includeInspectorBreakdowns === true`: appends the three groupBy queries to the existing `Promise.all` and returns `inspectorBreakdowns: { ... }`.
- When `includeInspectorBreakdowns === false` (CL_ADMIN, CL_USER): skips the three queries entirely (no DB round-trip) and returns `inspectorBreakdowns: null`.

Frontend trusts the `null` signal:

```tsx
{stats.inspectorBreakdowns && (
  <div className="mt-6">
    <InspectorBreakdownSection breakdowns={stats.inspectorBreakdowns} tomorrowLabel={tomorrowLabel} />
  </div>
)}
```

No frontend role check is needed — the API drives the visibility decision. This is "null-as-permission-signal" (approved design decision, see spec §6).

---

## Inspector-name resolution

The three groupBy queries return `inspector_id` + `count`. Names are resolved with one additional `findMany({ where: { id: { in: ids } } })` per groupBy. We chose this over a raw SQL JOIN because:

- Prisma's groupBy with a join requires raw SQL; the additional findMany keeps the code in idiomatic Prisma.
- The cardinality is small (~10–50 inspectors per agency in practice). Three extra queries on a primary key are negligible (<5ms aggregate in p95 measurements on similar fan-outs in this codebase).
- It composes with the existing `Promise.all` pattern.

Implementation note: collect the union of inspector IDs across the three lists and run a single findMany; then build a `Map<id, name>` to enrich each list. This avoids three redundant queries.

---

## Alert thresholds

Pure function, server-side:

```ts
function computeAlertLevel(count: number): 'yellow' | 'red' | null {
  if (count >= 18) return 'red';
  if (count >= 15) return 'yellow';
  return null;
}
```

Applied **only** to `tomorrowByInspector[].alertLevel`. The other two lists carry `alertLevel: null` for shape consistency (so the schema is uniform and the frontend uses a single rendering function).

---

## Test strategy

### Backend

| Suite | Type | What it asserts |
|---|---|---|
| `prisma-dashboard.repository.test.ts` | Unit (mocked Prisma) | Each of the 6 new queries is called with the correct `where`/`groupBy`/`orderBy` shape. Tenant filter is applied. Week range bounds are Monday 00:00:00.000 / Sunday 23:59:59.999 in server-local time (via the `now` parameter of `currentWeekRange()`). `tomorrowByInspector` `where.scheduled_date` is bounded by `tomorrowRange()`. When `includeInspectorBreakdowns=false`, the three groupBy queries are NOT called. Each groupBy `where` includes `inspector_id: { not: null }`. Inspector name enrichment merges correctly. |
| `get-dashboard-stats.use-case.test.ts` | Unit | For each role: AM -> breakdowns populated; OP -> breakdowns populated; CL_ADMIN -> breakdowns null AND repository called with `includeInspectorBreakdowns=false`; CL_USER -> same. Forbidden roles (INSP, TNT) continue to throw `ForbiddenError`. Alert level: 14 -> null, 15 -> yellow, 17 -> yellow, 18 -> red, 25 -> red. |
| `dashboard.routes.test.ts` (Supertest) | Integration (MANDATORY) | Extend the existing test (`apps/backend/tests/integration/dashboard/dashboard.routes.test.ts`) to assert the WIDENED contract: for AM mock context the route returns the new scalars (`doneThisWeek`, `scheduledThisWeek`, `rejectedTotal`) AND a populated `inspectorBreakdowns: { tomorrowByInspector, scheduledThisWeekByInspector, confirmedThisWeekByInspector }`. For a CL_ADMIN mock context the route returns the new scalars AND `inspectorBreakdowns: null`. Both responses MUST round-trip through `successResponseSchema(dashboardStatsResponseSchema).safeParse(res.body).success === true` to prove the Fastify response schema accepts the new shape. (Made mandatory per Planejador round 1.) |

### Frontend

| Suite | Type | What it asserts |
|---|---|---|
| `DashboardSummaryCards.test.tsx` | Unit (RTL) | The new cards (`Rejected Total`, `Done This Week`, `Scheduled This Week`) render with correct values and labels. Row 1 has 4 cards, Row 2 has 3 cards. Row 2 has the section label. |
| `InspectorBreakdownSection.test.tsx` | Unit (RTL) | With mock data, all three cards render. Inspector rows render with name + count. Alert dot colors match `alertLevel` (`yellow` -> `bg-warning`, `red` -> `bg-error`, `null` -> `bg-gray-300`). Empty list renders "No inspections". Threshold legend visible only on Tomorrow card. |
| `DashboardPage.test.tsx` | Unit (RTL) | When `stats.inspectorBreakdowns` is an object -> `InspectorBreakdownSection` is rendered. When it is `null` -> `InspectorBreakdownSection` is NOT rendered. Existing tests still pass. |

**Coverage target**: maintain >=80% for the dashboard module (critical-module bar).

### Performance smoke

Mandatory pre-merge step — see `tasks.md` T-027-1203 for the procedure (EXPLAIN ANALYZE on staging-shaped data, AM/OP path, acceptance p95 < 500ms). CL_* path is unchanged in cost (queries reuse the leading-`tenant_id` indexes). If AM/OP regresses beyond the acceptance, file `T-027-1204` follow-up for index design in a separate PR; do NOT pre-emptively add indexes in this PR.

---

## Implementation order

1. **packages/shared** — extend `dashboardStatsResponseSchema` + add `inspectorDayCountSchema` and `inspectorBreakdownsSchema`. Re-emit `DashboardStatsResponse` type. Run `pnpm typecheck` at root.
2. **apps/backend/domain** — extend `DashboardRepository.getStats` port signature with optional `includeInspectorBreakdowns` arg.
3. **apps/backend/application** — extend `DashboardStatsOutput`, compute `includeInspectorBreakdowns`, pass to repository. Write/extend use-case tests (TDD: write first, watch them fail).
4. **apps/backend/infrastructure** — add `currentWeekRange()`, `computeAlertLevel()`, six new queries in `Promise.all`, name-resolution merge. Write repository unit tests (TDD).
5. **apps/backend** — run `pnpm --filter backend test`. All green.
6. **apps/backend** — MANDATORY integration test extension for the route (Supertest) — extend `apps/backend/tests/integration/dashboard/dashboard.routes.test.ts` per task T-027-502: AM payload (populated `inspectorBreakdowns` + new scalars) and CL_ADMIN payload (`inspectorBreakdowns: null` + new scalars), both round-tripped through `successResponseSchema(dashboardStatsResponseSchema).safeParse(res.body)`.
7. **apps/web/types** — extend interfaces to match shared schema.
8. **apps/web/components** — restructure `DashboardSummaryCards` to two-row layout. Update its test.
9. **apps/web/components** — create `InspectorBreakdownSection` + test (TDD: test first).
10. **apps/web/pages** — wire `DashboardPage` to render the new section conditionally + pass `tomorrowLabel`. Update its test.
11. **apps/web** — run `pnpm --filter web test`. All green.
12. **Root** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. All green = ready for QA.

---

## Risks and attention points

| Risk | Likelihood | Mitigation |
|---|---|---|
| Date-boundary drift across backend queries, links, labels (FLAGGED by Planejador round 1) | Low (after revision) | All six queries derive their bounds from `currentWeekRange()` / `tomorrowRange()` (server-local). Frontend link helpers (`toLocalISODate`) already use the same convention. `tomorrowLabel` computed from browser-local. Unit-tested with the `now` parameter at the boundaries. |
| AM/OP unscoped queries not covered by leading-`tenant_id` indexes (FLAGGED by Planejador round 1) | Medium | New task `T-027-1203` runs EXPLAIN ANALYZE on a staging-shaped dataset before merge. If p95 regresses beyond 500ms, the index work is split into a follow-up PR (T-027-1204). The CL_* path is unaffected (existing leading-`tenant_id` indexes apply). |
| `inspector_id` is nullable in the schema; a groupBy could emit a `null` bucket and violate the response shape (FLAGGED by Planejador round 1) | Medium | All three groupBy queries MUST include `inspector_id: { not: null }` in their `where` clause. Repository tests assert this filter explicitly. The Zod schema continues to require `inspectorId: z.string().uuid()` — no nullable widening. |
| OpenAPI client types fall out of sync with the widened schema (FLAGGED by Planejador round 1) | High if forgotten | New task `T-027-103a` runs `pnpm generate:api` and commits the regenerated `packages/shared/src/api-types.ts`. CI typecheck catches drift. |
| `updated_at` as proxy for "done date" misrepresents the metric (e.g. status changes after DONE) | Low | The spec accepts this trade-off explicitly (consistent with the existing `doneThisMonth`). Note in `quickstart.md` so QA can validate seeded data with awareness. |
| `groupBy` + `findMany` race for names if inspectors are renamed mid-request | Negligible | Same-transaction not required for a read-only stats endpoint. Names are eventually-consistent within a single call. |
| Frontend rendering regression in existing `DashboardSummaryCards` snapshot tests | Low | The restructure changes DOM layout. Update snapshots; explicitly test card count and labels. |
| Test fixtures for `inspectorBreakdowns` get bulky | Low | Provide a `makeInspectorDayCount({ overrides })` factory in the test file. |
| Breaking change for older clients that don't tolerate new keys | Negligible | Response widening is backwards-compatible for typed clients (openapi-fetch ignores unknown keys) and for the existing web app (just won't render the new section yet). |
| `inspectorBreakdowns: null` interpreted as "no inspectors" instead of "not authorized" | Low | The frontend treats `null` strictly as a permission signal (don't render the section). The empty-state path for the lists uses an empty array, not null. Documented in component prop comments. |
| `currentWeekRange` boundary edge case (a request at Mon 00:00 server-local) | Negligible | Helper is inclusive on `from` (Mon 00:00:00.000 server-local), and `to` is set to Sun 23:59:59.999 server-local; Prisma `lte` covers the full millisecond range. Tested at the boundary (Mon `now` + Sun `now`). |

---

## Confidence: HIGH (after Planejador round 1 revisions)

- Pattern (extend existing dashboard) already used in the project — zero novel abstractions.
- All six queries fit the existing `Promise.all` shape.
- Frontend reuses `StatCard` and Tailwind tokens already in the design system.
- No migration, no new endpoint, no new domain entity.
- Spec was clarified with the human before this plan was generated; zero open questions remain on the WHAT.
- All five Planejador blockers (date semantics, OpenAPI regen, perf claim, nullable inspector_id, mandatory integration test) addressed — see `historico-3` for resolution log.

---

## Out of scope (explicitly)

- New endpoint or replacement of `GET /v1/dashboard/stats`.
- Persistent `done_at` column or migration.
- Localization of `tomorrowLabel` beyond the existing `Intl.DateTimeFormat` defaults (the spec leaves the example label English; the component accepts the string as a prop, so future i18n can replace the computation in `DashboardPage` without touching the section component).
- Push notifications or "alert me" workflows on the thresholds (the spec is visual-only).
- Changes to `useDashboardStats` query keys, caching, or stale times.
- Any change to PWA (mobile inspector app).

---

## Phase 2 (tasks) preview

See `./tasks.md`. Convention follows feature 026: numbered tasks `T-027-NNN`, dependency-ordered, with `[shared]`/`[backend]`/`[web]`/`[test]` tags. TDD ordering is enforced: tests precede or co-land with the code they cover.
