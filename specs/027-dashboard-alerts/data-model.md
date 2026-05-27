# Phase 1 — Data Model: Dashboard Alerts (027)

**Scope**: This feature does NOT change the database schema. It only widens the API response shape. This document describes the new TypeScript / Zod shapes introduced.

---

## DB schema changes

**None.** All six new data points are derived from existing tables (`appointments`, `inspectors`) and existing columns (`status`, `scheduled_date`, `updated_at`, `tenant_confirmation_status`, `inspector_id`, `tenant_id`).

### Indexes consulted (REVISED after Planejador round 1)

Actual indexes present today on `appointments` (verified against `apps/backend/prisma/schema.prisma` lines 512-518):

- `(tenant_id, status)` — composite, leading column `tenant_id`.
- `(tenant_id, branch_id)`.
- `(tenant_id, inspector_id)`.
- `(tenant_id, scheduled_date)`.
- `(tenant_id, service_type_id)`.
- `(service_group_id)`.
- `(deleted_at)`.

**Implication for this feature**: every index leads with `tenant_id`. The CL_ADMIN / CL_USER path benefits from these (the `tenantFilter` provides the leading-column equality). The AM/OP path, which is `tenantId = undefined` and thus does NOT supply a leading `tenant_id` predicate, **may fall through to sequential scans** on the appointment table.

This is why `T-027-1203` (EXPLAIN ANALYZE on staging-shaped data) is a hard gate before merge. If AM/OP p95 regresses, the index work is tracked separately as `T-027-1204` (out of scope for this PR). The plan does NOT prescribe new indexes in this PR — it MEASURES first.

---

## Zod schemas (shared package)

Added to `packages/shared/src/schemas/responses.ts`. All additions are colocated with the existing `dashboardStatsResponseSchema` block.

### `inspectorDayCountSchema` (NEW)

```ts
export const inspectorDayCountSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  count: z.number().int().nonnegative(),
  alertLevel: z.enum(['yellow', 'red']).nullable(),
});
```

| Field | Type | Notes |
|---|---|---|
| `inspectorId` | UUID | Primary key of the inspector. |
| `inspectorName` | string | Display name resolved server-side. If the inspector record is missing from the name-resolution `findMany` (shouldn't happen in practice — FK guarantees existence), the row is **excluded from the list and a warning is logged** (see `tasks.md` T-027-401). The schema never carries an empty `inspectorName`. |
| `count` | non-negative int | Number of appointments in the bucket (day or week). |
| `alertLevel` | `'yellow' \| 'red' \| null` | Only populated on `tomorrowByInspector`; always `null` on the two week-based lists. |

### `inspectorBreakdownsSchema` (NEW)

```ts
export const inspectorBreakdownsSchema = z.object({
  tomorrowByInspector: z.array(inspectorDayCountSchema),
  scheduledThisWeekByInspector: z.array(inspectorDayCountSchema),
  confirmedThisWeekByInspector: z.array(inspectorDayCountSchema),
});
```

Each list is non-nullable but may be empty. Sort order: `count DESC` (server-side).

### `dashboardStatsResponseSchema` — extended block

```ts
export const dashboardStatsResponseSchema = z.object({
  appointmentsByStatus: z.object({
    draft: z.number(),
    awaitingInspector: z.number(),
    scheduled: z.number(),
    doneThisMonth: z.number(),
    // NEW
    doneThisWeek: z.number(),
    scheduledThisWeek: z.number(),
    rejectedTotal: z.number(),
  }),
  recentAppointments: z.array(/* unchanged */),
  pendingActions: z.object({/* unchanged */}),
  quickStats: z.object({/* unchanged */}),
  // NEW
  inspectorBreakdowns: inspectorBreakdownsSchema.nullable(),
});
```

### Type re-emission

`DashboardStatsResponse` is regenerated automatically via `z.infer<typeof dashboardStatsResponseSchema>`. No manual type edit.

Also export:

```ts
export type InspectorDayCount = z.infer<typeof inspectorDayCountSchema>;
export type InspectorBreakdowns = z.infer<typeof inspectorBreakdownsSchema>;
```

---

## Backend application-layer types (`DashboardStatsOutput`)

Located in `apps/backend/src/modules/dashboard/application/use-cases/get-dashboard-stats.use-case.ts`. Mirrors the shared shape — kept in sync manually since this is the use-case-internal type (the boundary to the route layer is the shared Zod schema).

```ts
export interface InspectorDayCount {
  inspectorId: string;
  inspectorName: string;
  count: number;
  alertLevel: 'yellow' | 'red' | null;
}

export interface InspectorBreakdowns {
  tomorrowByInspector: InspectorDayCount[];
  scheduledThisWeekByInspector: InspectorDayCount[];
  confirmedThisWeekByInspector: InspectorDayCount[];
}

export interface DashboardStatsOutput {
  appointmentsByStatus: {
    draft: number;
    awaitingInspector: number;
    scheduled: number;
    doneThisMonth: number;
    doneThisWeek: number;        // NEW
    scheduledThisWeek: number;   // NEW
    rejectedTotal: number;       // NEW
  };
  recentAppointments: Array<{/* unchanged */}>;
  pendingActions: {/* unchanged */};
  quickStats: {/* unchanged */};
  inspectorBreakdowns: InspectorBreakdowns | null;  // NEW
}
```

---

## Frontend types (web)

Located in `apps/web/src/features/dashboard/types/index.ts`. Mirrors the shared / use-case shape.

```ts
export interface InspectorDayCount {
  inspectorId: string;
  inspectorName: string;
  count: number;
  alertLevel: 'yellow' | 'red' | null;
}

export interface InspectorBreakdowns {
  tomorrowByInspector: InspectorDayCount[];
  scheduledThisWeekByInspector: InspectorDayCount[];
  confirmedThisWeekByInspector: InspectorDayCount[];
}

export interface DashboardStats {
  appointmentsByStatus: {
    draft: number;
    awaitingInspector: number;
    scheduled: number;
    doneThisMonth: number;
    doneThisWeek: number;        // NEW
    scheduledThisWeek: number;   // NEW
    rejectedTotal: number;       // NEW
  };
  recentAppointments: RecentAppointment[];
  pendingActions: PendingActions;
  quickStats: QuickStats;
  inspectorBreakdowns: InspectorBreakdowns | null;  // NEW
}
```

---

## Repository port

Located in `apps/backend/src/modules/dashboard/domain/dashboard.repository.ts`.

```ts
export interface DashboardRepository {
  getStats(
    tenantId?: string,
    includeInspectorBreakdowns?: boolean,
  ): Promise<DashboardStatsOutput>;
}
```

- `tenantId`: same semantics as today (undefined for AM/OP, present for CL_*).
- `includeInspectorBreakdowns`: default `false`. When `false`, the implementation MUST set `inspectorBreakdowns: null` and SHOULD skip the three groupBy queries (no DB round-trip).

---

## State transitions

**None.** This feature is read-only. It does not affect the appointment state machine.

---

## Validation rules

Inherited from the existing endpoint:

- Endpoint is `preHandler: authenticate`. JWT must be valid.
- `actor.role` must be one of `AM`, `OP`, `CL_ADMIN`, `CL_USER`. INSP and TNT raise `ForbiddenError` (existing behaviour, unchanged).
- For CL_ADMIN / CL_USER, `actor.tenantId` is required (existing behaviour).

New, feature-specific:

- `alertLevel` is server-computed; clients MUST trust the server value and not recompute.
- `inspectorBreakdowns === null` MUST be treated by the frontend as "do not render the inspector section" — not as "the lists are empty".
- **`inspector_id` is nullable in `appointments`** (`appointments.inspector_id String?`). All three groupBy queries MUST include `inspector_id: { not: null }` in their `where` clause to prevent emitting a `null` bucket that would violate `inspectorDayCountSchema.inspectorId` (which requires a UUID). This is verified by `prisma-dashboard.repository.test.ts` (see `tasks.md` T-027-402).
- **Date boundaries** for `currentWeekRange()` and `tomorrowRange()` are computed in **server-local time** (Node `new Date()` arithmetic), matching the existing `doneThisMonth` convention and the spec definition of "Tomorrow" as "the local date of the server". UTC is NOT used. See `plan.md` §Date-boundary semantics.
