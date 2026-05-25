# Dashboard Alerts — Design Spec

**Date:** 2026-05-24
**Feature:** `dashboard-alerts`
**Branch:** `feature/dashboard-alerts`

---

## 1. Overview

Extend the Properfy dashboard with six new data points:

| Item | Type | Scope |
|---|---|---|
| Total Rejected (all-time) | Scalar | All roles |
| Scheduled This Week | Scalar | All roles |
| Done This Week | Scalar | All roles |
| Tomorrow's Load by Inspector | List + alerts | AM, OP only |
| Scheduled This Week by Inspector | List | AM, OP only |
| Confirmed This Week by Inspector | List | AM, OP only |

---

## 2. Definitions

| Term | Definition |
|---|---|
| "This week" | Monday 00:00 to Sunday 23:59 of the current calendar week |
| "Tomorrow" | The calendar day after today (local date of the server) |
| "Confirmed" | `status = SCHEDULED` AND `tenant_confirmation_status = CONFIRMED` |
| "Rejected total" | All appointments with `status = REJECTED`, no date filter, all-time |

---

## 3. Alert Thresholds

Applies **only** to `tomorrowByInspector`. Computed server-side.

| count | alertLevel |
|---|---|
| < 15 | `null` |
| 15 – 17 | `"yellow"` |
| ≥ 18 | `"red"` |

---

## 4. Backend Design

### 4.1 Shared Schema (`packages/shared`)

Extend `dashboardStatsResponseSchema` in `responses.ts`:

```ts
// New scalar fields added to appointmentsByStatus object:
doneThisWeek: z.number()
scheduledThisWeek: z.number()
rejectedTotal: z.number()

// New top-level section:
inspectorBreakdowns: z.object({
  tomorrowByInspector: z.array(inspectorDayCountSchema),
  scheduledThisWeekByInspector: z.array(inspectorDayCountSchema),
  confirmedThisWeekByInspector: z.array(inspectorDayCountSchema),
}).nullable()

// New sub-schema:
const inspectorDayCountSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  count: z.number().int().nonnegative(),
  alertLevel: z.enum(['yellow', 'red']).nullable(),
})
```

`inspectorBreakdowns` is `null` for `CL_ADMIN` and `CL_USER` roles.

### 4.2 Use Case (`get-dashboard-stats.use-case.ts`)

- Add `InspectorDayCount` interface to `DashboardStatsOutput`.
- Extend `DashboardStatsOutput.appointmentsByStatus` with `doneThisWeek`, `scheduledThisWeek`, `rejectedTotal`.
- Add `inspectorBreakdowns: { ... } | null` to `DashboardStatsOutput`.
- Pass a boolean `includeInspectorBreakdowns = ['AM', 'OP'].includes(actor.role)` to `repository.getStats(tenantId, includeInspectorBreakdowns)`.

### 4.3 Repository Port (`dashboard.repository.ts`)

```ts
getStats(tenantId?: string, includeInspectorBreakdowns?: boolean): Promise<DashboardStatsOutput>
```

### 4.4 Prisma Repository (`prisma-dashboard.repository.ts`)

Six new queries added to the existing `Promise.all`:

**New scalars (always run):**

1. `doneThisWeek` — `status: DONE`, `updated_at` between Monday 00:00 and Sunday 23:59 of current week. Uses `updated_at` as proxy for "done date" — consistent with existing `doneThisMonth` query.
2. `scheduledThisWeek` — `status: SCHEDULED`, `scheduled_date` between Monday and Sunday of current week.
3. `rejectedTotal` — `status: REJECTED`, no date filter, scoped by `tenantId` if present.

**Inspector breakdowns (conditional on `includeInspectorBreakdowns`):**

4. `tomorrowByInspector` — `status: SCHEDULED`, `tenant_confirmation_status: CONFIRMED`, `scheduled_date = tomorrow`. `groupBy: inspector_id`. Join with `Inspector` for name. Compute `alertLevel` server-side. Sort by `count DESC`.
5. `scheduledThisWeekByInspector` — `status: SCHEDULED`, `scheduled_date` this week. `groupBy: inspector_id`. Join for name. Sort by `count DESC`.
6. `confirmedThisWeekByInspector` — `status: SCHEDULED`, `tenant_confirmation_status: CONFIRMED`, `scheduled_date` this week. `groupBy: inspector_id`. Join for name. Sort by `count DESC`.

When `includeInspectorBreakdowns = false`, the three list queries are skipped and `inspectorBreakdowns` returns `null` directly (no DB round-trip).

**Week range helper** (private method):
```ts
private currentWeekRange(now: Date = new Date()): { from: Date; to: Date }
// Monday 00:00:00.000 -> Sunday 23:59:59.999 of current week, SERVER-LOCAL time.
// Consistent with existing doneThisMonth which uses local Date arithmetic.
// See plan.md §Date-boundary semantics for the canonical convention and the
// documented backend-server-local vs. frontend-browser-local limitation.
```

---

## 5. Frontend Design

### 5.1 Types (`apps/web/src/features/dashboard/types/index.ts`)

Add to `DashboardStats`:
- `appointmentsByStatus.doneThisWeek: number`
- `appointmentsByStatus.scheduledThisWeek: number`
- `appointmentsByStatus.rejectedTotal: number`
- `inspectorBreakdowns: InspectorBreakdowns | null`

New interfaces:
```ts
interface InspectorDayCount {
  inspectorId: string
  inspectorName: string
  count: number
  alertLevel: 'yellow' | 'red' | null
}

interface InspectorBreakdowns {
  tomorrowByInspector: InspectorDayCount[]
  scheduledThisWeekByInspector: InspectorDayCount[]
  confirmedThisWeekByInspector: InspectorDayCount[]
}
```

### 5.2 `DashboardSummaryCards` (modified)

Restructure from one 4-column grid to two themed rows:

**Row 1 — Current status** (4 cards):
| Card | Icon | Border color | Value |
|---|---|---|---|
| Draft | `mdi-file-edit-outline` | `#E1BEE7` | `draft` |
| Awaiting Inspector | `mdi-clock-outline` | `#FFE0B2` | `awaitingInspector` |
| Scheduled | `mdi-calendar-check` | `#B3E5FC` | `scheduled` |
| Rejected Total | `mdi-close-circle-outline` | `#FFCDD2` | `rejectedTotal` |

**Row 2 — Temporal performance** (3 cards):
| Card | Icon | Border color | Value |
|---|---|---|---|
| Done This Week | `mdi-check-circle-outline` | `#A5D6A7` | `doneThisWeek` |
| Done This Month | `mdi-check-circle-outline` | `#C8E6C9` | `doneThisMonth` |
| Scheduled This Week | `mdi-calendar-week` | `#B3E5FC` | `scheduledThisWeek` |

Row 2 uses a 3-column grid (`sm:grid-cols-3`). A section label (`text-xs text-text-secondary font-semibold uppercase`) separates the two rows.

### 5.3 `InspectorBreakdownSection` (new component)

**Location:** `apps/web/src/features/dashboard/components/InspectorBreakdownSection.tsx`

**Props:**
```ts
interface Props {
  breakdowns: InspectorBreakdowns
  tomorrowLabel: string // e.g. "Tomorrow — Mon 25 May"
}
```

**Layout:** `grid grid-cols-1 lg:grid-cols-3 gap-4`

**Each card structure:**
- White card with `shadow-sm rounded`
- Header: icon + title (`text-base font-bold text-secondary`)
- List rows: dot indicator · inspector name · count
- Dot colors: `bg-error` (red) · `bg-warning` (yellow) · `bg-gray-300` (ok)
- Count colors: `text-error` (red) · `text-warning` (yellow) · `text-text-primary` (ok)
- Sorted by count descending (server-side)
- Threshold legend in Tomorrow card footer only:
  `🟡 ≥15 · 🔴 ≥18 inspections/day`

**Empty state:** "No inspections" message when list is empty.

### 5.4 `DashboardPage` (modified)

**Approved page section order** (after smoke test, 2026-05-24):

1. `DashboardSummaryCards` — two-row status/temporal grid
2. Quick stats — `sm:grid-cols-3` (Registered Properties · Active Inspectors · Active Service Groups)
3. `InspectorBreakdownSection` (conditional — AM/OP only, when `inspectorBreakdowns !== null`)
4. `RecentAppointmentsList` + `PendingActionsCard` — `lg:grid-cols-5` (3+2 split)

The `InspectorBreakdownSection` block sits between Quick Stats and Recent/Pending:

```tsx
{stats.inspectorBreakdowns && (
  <div className="mt-6">
    <InspectorBreakdownSection
      breakdowns={stats.inspectorBreakdowns}
      tomorrowLabel={tomorrowLabel}
    />
  </div>
)}
```

`tomorrowLabel` computed in `DashboardPage` from `new Date()` — format: `"Tomorrow — Mon 25 May"` (prefix + browser-local date). Not derived from API response.

---

## 6. RBAC Summary

| Role | New scalars | Inspector breakdowns |
|---|---|---|
| AM | ✅ | ✅ |
| OP | ✅ | ✅ |
| CL_ADMIN | ✅ | ❌ (`null`) |
| CL_USER | ✅ | ❌ (`null`) |
| INSP | ❌ (forbidden) | ❌ |
| TNT | ❌ (forbidden) | ❌ |

---

## 7. Testing Strategy

### Backend (Vitest + Supertest)

- Unit tests for `PrismaDashboardRepository`: mock Prisma, verify each new query shape and filters.
- Unit tests for `GetDashboardStatsUseCase`: verify `inspectorBreakdowns = null` for `CL_ADMIN`/`CL_USER`; verify `alertLevel` computation.
- Integration test for `GET /v1/dashboard/stats`: seed appointments for AM and CL_ADMIN, verify response shape and conditional null.

### Frontend (Vitest + React Testing Library)

- `DashboardSummaryCards`: verify new cards render with correct values and links.
- `InspectorBreakdownSection`: render with mock data, verify alert dot colors, empty state, threshold legend visibility.
- `DashboardPage`: verify `InspectorBreakdownSection` renders for AM/OP (`inspectorBreakdowns` present) and is absent when `null`.

---

## 8. Files to Create / Modify

| File | Action |
|---|---|
| `packages/shared/src/schemas/responses.ts` | Extend schema |
| `apps/backend/src/modules/dashboard/application/use-cases/get-dashboard-stats.use-case.ts` | Extend output type + role logic |
| `apps/backend/src/modules/dashboard/domain/dashboard.repository.ts` | Update port signature |
| `apps/backend/src/modules/dashboard/infrastructure/prisma-dashboard.repository.ts` | 6 new queries + week helper |
| `apps/web/src/features/dashboard/types/index.ts` | New interfaces |
| `apps/web/src/features/dashboard/components/DashboardSummaryCards.tsx` | Two-row layout |
| `apps/web/src/features/dashboard/components/InspectorBreakdownSection.tsx` | Create |
| `apps/web/src/features/dashboard/components/index.ts` | Export new component |
| `apps/web/src/features/dashboard/pages/DashboardPage.tsx` | Render new section |
| All corresponding `*.test.tsx` / `*.test.ts` files | TDD |
