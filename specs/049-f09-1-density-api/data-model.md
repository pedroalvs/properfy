# Phase 1 Data Model: Execution Density Map API

No database schema change. This feature reads existing tables and introduces a domain port plus shared contract types. Verified against `origin/develop @ 75166fe6`.

## Read model (existing tables, no change)

### `inspection_executions` (model `InspectionExecution`)

| Column | Type | Role in this feature |
|---|---|---|
| `appointment_id` | `String @unique` | Join key to `appointments`; `@unique` guarantees one row per appointment (reopen counts once — D18) |
| `inspector_id` | `String` | `inspectorId` filter (AM/OP only) |
| `started_at` | `DateTime` | Window filter `[from, toExclusive)`; indexed (`@@index([started_at])`) |
| `start_latitude` | `Decimal(10,7)` NOT NULL | Cell latitude index source |
| `start_longitude` | `Decimal(10,7)` NOT NULL | Cell longitude index source |
| `abandoned_at` | `DateTime?` (TASK-F03-2) | `abandoned_at IS NULL` filter — abandoned check-ins are excluded |
| `resumed_at` | `DateTime?` | Present on reopened rows; **not** read here (reopen keeps original `started_at`/`start_*`) |

No `tenant_id` on this table. Scope is derived through the join.

### `appointments` (model `Appointment`)

| Column | Role |
|---|---|
| `id` (PK) | Join target (`a.id = e.appointment_id`) |
| `tenant_id` | Agency scope predicate (`a.tenant_id = ${tenantId}` when scoped) |
| `deleted_at` | `a.deleted_at IS NULL` filter — soft-deleted appointments excluded |

## Domain port (new)

```ts
// apps/backend/src/modules/inspector-execution/domain/execution-density.reader.ts
export interface ExecutionDensityFilters {
  from: Date;
  toExclusive: Date;
  tenantId?: string;
  inspectorId?: string;
  gridScale: number;   // EXECUTION_DENSITY_GRID_SCALE (1000)
  minCellCount: number;// 1 (AM/OP) or 3 (CL)
  limit: number;       // MAX_EXECUTION_DENSITY_CELLS (5000)
}

export interface ExecutionDensityRow {
  latIndex: number;
  lngIndex: number;
  count: number; // integer >= minCellCount
}

export interface ExecutionDensityReader {
  // PRIVACY INVARIANT: returns only aggregated cell indices + counts and
  // valid/invalid totals. There is deliberately NO method that returns an
  // individual coordinate or a raw execution row. Do not add one and do not
  // "simplify" an implementation into fetch-then-aggregate-in-memory.
  aggregate(
    filters: ExecutionDensityFilters,
  ): Promise<{ rows: ExecutionDensityRow[]; totals: { valid: number; invalid: number } }>;
}
```

The reader requests `limit + 1` rows so the use case can detect truncation (`rows.length > limit`).

## Pure domain functions (new)

```ts
// apps/backend/src/modules/inspector-execution/domain/execution-density-grid.ts
cellCenter(cell: { latIndex: number; lngIndex: number }): { lat: number; lng: number };
toCellIndex(value: string): number;          // exact mirror of FLOOR(coord * 1000); input is a decimal string, never number
periodToInstants(fromDate: string, toDate: string): { from: Date; toExclusive: Date };
minCellCountFor(pinned: string | undefined): number; // pinned ? MIN_CELL_COUNT_CL : MIN_CELL_COUNT_GLOBAL
```

## Shared contract (new)

```ts
// packages/shared/src/schemas/execution-density.ts
EXECUTION_DENSITY_GRID_SCALE = 1000;          // cells per degree
EXECUTION_DENSITY_GRID_DEGREES = 0.001;       // 1 / scale
MAX_EXECUTION_DENSITY_PERIOD_DAYS = 366;
MAX_EXECUTION_DENSITY_CELLS = 5000;
MIN_CELL_COUNT_CL = 3;
MIN_CELL_COUNT_GLOBAL = 1;
EXECUTION_DENSITY_PRESET_DAYS = [7, 30, 90] as const;

executionDensityQuerySchema  // { fromDate, toDate, tenantId?, inspectorId? } with order + 366-day refinements
executionDensityResponseSchema // see contracts/execution-density.openapi.md
isExecutionDensityPreset(range: { fromDate: string; toDate: string }, today: string): boolean;
```

Validation rules encoded in `executionDensityQuerySchema`:

- `fromDate`, `toDate`: `civilDateSchema` (YYYY-MM-DD + calendar check), both required.
- `toDate >= fromDate` (message `toDate must be >= fromDate`).
- inclusive period ≤ 366 days (message `Period must not exceed 366 days`).
- `tenantId`, `inspectorId`: `z.string().uuid().optional()` (empty string rejected).

The preset check (CL-only) is **not** in the schema — it depends on the actor role and "today", so it lives in the use case.

## Role matrix (new entry)

```ts
// packages/shared/src/permissions/role-matrix.ts
'map.execution_density': {
  // inspectorId filter is AM/OP-only; enforced in the use case.
  roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'],
}
```

No `condition` (the `/map` requires no permission flag).
