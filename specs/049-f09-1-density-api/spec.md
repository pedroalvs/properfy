# Feature Specification: Execution Density Map API

**Feature Branch**: `049-f09-1-density-api`  
**Created**: 2026-11-02  
**Status**: Draft  
**Input**: User description: "Backend and shared contract for `GET /v1/map/execution-density`: a tenant-scoped read endpoint returning check-in execution density aggregated into a ~100m grid inside Postgres" (source: `fase2-etapa1/tarefas/F09-tarefas.md`, TASK-F09-1)

## Overview

This feature adds a single read-only API endpoint, `GET /v1/map/execution-density`, plus its shared contract (`@properfy/shared`) and a new role-matrix action key. The endpoint returns the geographic density of inspector **check-ins** (the geolocation captured when an inspection execution starts) over a civil-date period, already aggregated into a fixed ~100 m grid with a count per cell. It is the backend half of F09 (contract codes **D.1–D.4**); the `/map` heatmap layer that consumes it is TASK-F09-2.

The defining constraint is **privacy by construction**: no caller — not even Admin Master — ever receives an individual inspector coordinate. Aggregation happens inside Postgres, and the repository port has no method capable of returning raw coordinates. Agency accounts additionally only see cells with at least 3 check-ins (k-anonymity) and are restricted to fixed look-back presets so they cannot isolate a single day's check-in by differencing windows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operators read aggregated check-in density (Priority: P1)

As an Admin Master (AM) or Operator (OP), I open the activity-density view and see where inspection check-ins have clustered across the platform over a chosen period, drawn as a heat grid, so I can understand operational coverage. The exact position of any single inspector is never revealed — every point returned is the fixed center of a ~100 m grid cell, with a count of check-ins in that cell.

**Why this priority**: This is the core deliverable and the minimum viable product. Without it there is no density endpoint at all. It also establishes the aggregation-in-Postgres and cell-center contract that every other story depends on.

**Independent Test**: Call the endpoint as AM with a valid `fromDate`/`toDate` and assert a 200 response whose `cells` are grid-cell centers (≤ 4 decimal places), each with an integer `count ≥ 1`, plus `totalExecutions`, `cellCount`, `excludedWithoutCoordinates`, `truncated`, `minCellCount`, `gridSizeDegrees`, and the echoed dates. Assert no cell object carries any key other than `lat`, `lng`, `count`.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they request density for a civil-date period in the platform timezone (`Australia/Sydney`), **Then** the response counts only executions whose `started_at` falls in that inclusive civil-date window (exact at 23 h / 25 h daylight-saving boundaries), aggregated per grid cell.
2. **Given** executions exist, **When** the response is built, **Then** every returned point is the **center** of its cell (never the average of the real points), so a single-check-in cell cannot reveal the inspector's exact position.
3. **Given** executions whose coordinates are unusable (`(0,0)` or out of range), **When** density is computed, **Then** those executions are excluded from cells and counted in `excludedWithoutCoordinates`.
4. **Given** an abandoned execution (F03 `abandoned_at` set) or a soft-deleted appointment, **When** density is computed, **Then** those executions are excluded entirely; a later restart after re-offer counts once, at the new check-in.
5. **Given** more than 5000 distinct cells match, **When** the response is built, **Then** `cells` is capped at 5000 (ordered by `count` descending, then position) and `truncated` is `true`, while `totalExecutions` still reflects every valid execution in the window.

---

### User Story 2 - Agency users see only their own agency's density, privacy-protected (Priority: P1)

As an Agency Admin (CL_ADMIN) or Agency User (CL_USER), I see the check-in density of **my own agency's** appointments only, aggregated and k-anonymized, so I can gauge where my inspections happen without ever seeing another agency's data or any individual inspector position. I can only choose fixed look-back periods (7, 30 or 90 days ending today).

**Why this priority**: This is the tenant-isolation and privacy guarantee (contract code **D.A3**). It is as critical as US1 because shipping the endpoint without it would leak cross-tenant and individual-location data.

**Independent Test**: Seed two agencies with check-ins in overlapping cells; call as a CL actor of agency T1 and assert the response contains only T1's executions, that any `tenantId` query parameter is ignored, that an `inspectorId` parameter is rejected with 403, that cells with fewer than 3 check-ins are hidden, and that a non-preset period is rejected with 400 `PERIOD_NOT_A_PRESET`.

**Acceptance Scenarios**:

1. **Given** a CL_ADMIN of agency T1, **When** they request density (with or without a forged `tenantId` pointing at another agency), **Then** the result is scoped to T1 only; the requested `tenantId` is ignored and never widens scope.
2. **Given** a CL actor, **When** they pass `inspectorId`, **Then** the request is rejected with 403 `AUTH_FORBIDDEN` and no data is read.
3. **Given** a CL actor, **When** a grid cell has fewer than 3 check-ins of their agency, **Then** that cell is hidden from `cells`; a cell with exactly 3 is shown. `minCellCount` in the response is 3 (it is 1 for AM/OP).
4. **Given** a CL actor, **When** the requested period is not one of the presets of 7, 30 or 90 inclusive days ending on today (Sydney), **Then** the request is rejected with 400 `VALIDATION_ERROR` and `details.reason = 'PERIOD_NOT_A_PRESET'`, `details.allowedDays = [7, 30, 90]`; two windows differing by one day are both rejected, so a CL cannot isolate a single day's check-in.
5. **Given** a CL actor whose JWT carries no tenant, **When** they request density, **Then** the request is rejected with 403 `TENANT_SCOPE_REQUIRED` and no data is read.
6. **Given** a CL actor whose visible cells sum to fewer check-ins than their agency's total in the window, **When** the response is built, **Then** `totalExecutions` still reflects the agency's full valid total for the window (an aggregate number with no location), while hidden/low cells are omitted from `cells`.

---

### User Story 3 - Admin/Operator narrow density by agency and inspector (Priority: P2)

As an AM or OP, I filter the density view by a specific agency and/or by the inspector who performed the check-in, so I can investigate a single agency's or inspector's activity footprint.

**Why this priority**: Required by contract code **D.A2**, but it is a refinement on top of the P1 read and isolation guarantees, so it is lower priority than them.

**Independent Test**: With two agencies and two inspectors seeded, call as AM with `tenantId` and `inspectorId` and assert the counted cells change to match only that agency/inspector's executions.

**Acceptance Scenarios**:

1. **Given** an AM/OP actor, **When** they pass `tenantId`, **Then** only that agency's executions are counted; passing a non-existent agency yields an empty result (200, not 404).
2. **Given** an AM/OP actor, **When** they pass `inspectorId`, **Then** only check-ins performed by that inspector are counted (by `inspection_executions.inspector_id`).
3. **Given** an OP actor whose JWT carries no `tenantId`, **When** they pass a `tenantId`, **Then** scope follows the requested `tenantId` (OP is cross-tenant and does not depend on `actor.tenantId`).

---

### Edge Cases

- **No executions in the window**: 200 with `cells: []`, `totalExecutions: 0`.
- **CL with only low-count cells**: 200 with `cells: []`, `totalExecutions > 0`, `minCellCount: 3`; the UI (TASK-F09-2) explains why nothing is drawn.
- **Execution still in progress** (`finished_at` null): still counted — the check-in happened.
- **Appointment that went `DONE → REJECTED`** (`DONE_REJECTED`, "marked done but not executed") or was reopened: counts — the layer measures **check-ins recorded, not services completed**. A reopened appointment counts once, at the original `started_at` coordinates (the idempotent start and the reopen preserve the original geolocation).
- **Period in the future**: valid; returns empty.
- **Period over 366 days**: 400 `VALIDATION_ERROR`; within the cap, cells are truncated at 5000 with `truncated: true`.
- **CL at the Sydney day boundary**: a request built just before midnight whose `toDate` arrives after midnight is rejected with 400 `PERIOD_NOT_A_PRESET` (the server's "today" has advanced); the server offers no "yesterday" tolerance — the client re-anchors (TASK-F09-2).
- **Inspector who changed or serves several agencies**: scope is by the **appointment's** agency, so a CL only sees check-ins tied to its own appointments.
- **Grid boundary points** (exactly on a grid line, and 1e-7 to either side): the SQL cell index and the pure TypeScript mirror agree point for point.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose `GET /v1/map/execution-density` returning check-in density aggregated into a fixed grid of 1000 cells per degree (`EXECUTION_DENSITY_GRID_DEGREES = 0.001`, ~100 m), with a count per cell. The grid is fixed (independent of map zoom) so the same execution always falls in the same cell.
- **FR-002**: The endpoint MUST require a Bearer JWT and reject unauthenticated requests with 401, applying the same active-agency middleware used by existing map/dashboard routes.
- **FR-003**: The endpoint MUST accept `fromDate` and `toDate` as required `YYYY-MM-DD` civil dates interpreted in `PLATFORM_TIMEZONE` (`Australia/Sydney`), with `toDate >= fromDate` and an inclusive period no longer than `MAX_EXECUTION_DENSITY_PERIOD_DAYS` (366 days). Invalid dates, wrong order, or over-long periods MUST return 400 `VALIDATION_ERROR`.
- **FR-004**: The endpoint MUST accept optional `tenantId` and `inspectorId` (both uuid) query parameters. For AM/OP they restrict the result to that agency and/or that check-in inspector. For CL actors, `tenantId` MUST be ignored (scope is always the JWT tenant) and `inspectorId` MUST be rejected with 403.
- **FR-005**: Access MUST be limited to roles `AM`, `OP`, `CL_ADMIN`, `CL_USER`; `INSP` and `TNT` MUST receive 403 `AUTH_FORBIDDEN`. The role check MUST happen before tenant-scope resolution so that an unsupported role returns 403, not a 500.
- **FR-006**: The result MUST be scoped per agency via the join `appointments.id = inspection_executions.appointment_id` on `appointments.tenant_id` (there is no `tenant_id` on `inspection_executions`). AM/OP read across agencies; CL_ADMIN/CL_USER are pinned to their JWT tenant; a CL JWT without a tenant MUST yield 403 `TENANT_SCOPE_REQUIRED`.
- **FR-007**: No response MUST ever contain an individual inspector coordinate. Every returned point MUST be the fixed center of its grid cell (4 decimal places), never the mean of the underlying points. Each cell object MUST contain exactly the keys `lat`, `lng`, `count` (`count` an integer ≥ 1). The response-schema serializer MUST strip any undeclared key as a second barrier.
- **FR-008**: Aggregation MUST happen inside Postgres. The repository port MUST NOT expose any method that returns individual coordinates or raw rows; it returns only `(latIndex, lngIndex, count)` plus valid/invalid totals. This privacy guarantee MUST be documented on the port interface so it is not "simplified" into fetch-then-aggregate-in-memory.
- **FR-009**: The cell index MUST be computed in Postgres with integer scaling (`FLOOR(coordinate * 1000)`), kept in `numeric` for `Decimal(10,7)` columns, never by dividing the column by a JS float parameter (which would bind as `float8` and diverge at grid lines). A pure TypeScript mirror `toCellIndex` MUST reproduce the SQL index exactly from the decimal string, including at boundary points and in negatives (`FLOOR`, not `ROUND`/`TRUNC`).
- **FR-010**: Executions MUST be excluded from the density when: coordinates are `(0,0)` or out of valid range (counted in `excludedWithoutCoordinates`); the execution is abandoned (`abandoned_at` not null); or the appointment is soft-deleted. All other executions in the window MUST count regardless of appointment status (in progress, finished, later reverted to `REJECTED`/`DRAFT`). A reopened/restarted execution MUST count once.
- **FR-011**: For CL actors the system MUST hide grid cells with fewer than `MIN_CELL_COUNT_CL` (3) check-ins; AM/OP use `MIN_CELL_COUNT_GLOBAL` (1). The threshold MUST be chosen by **scope type** (pinned tenant → 3), not by an explicit role list, so a future pinned role inherits k = 3. The count threshold MUST be applied in SQL (`HAVING`) and re-filtered in the use case as defense in depth.
- **FR-012**: For CL actors, in addition to the 366-day cap, the requested period MUST be exactly one of the presets of 7, 30 or 90 inclusive days ending on today in Sydney (`EXECUTION_DENSITY_PRESET_DAYS = [7, 30, 90]`), validated in the use case against an injectable clock. A non-preset period MUST return 400 `VALIDATION_ERROR` with `details.reason = 'PERIOD_NOT_A_PRESET'` and `details.allowedDays = [7, 30, 90]`. AM/OP keep free periods within the 366-day cap.
- **FR-013**: The response MUST cap `cells` at `MAX_EXECUTION_DENSITY_CELLS` (5000), setting `truncated: true` when more cells existed, while `totalExecutions` still reflects every valid execution in the window (including executions in hidden or truncated cells). Cells MUST be ordered by `count` descending, then by position.
- **FR-014**: The shared package MUST export the query schema, the response schema (including `minCellCount`), the constants (`EXECUTION_DENSITY_GRID_SCALE`, `EXECUTION_DENSITY_GRID_DEGREES`, `MAX_EXECUTION_DENSITY_PERIOD_DAYS`, `MAX_EXECUTION_DENSITY_CELLS`, `MIN_CELL_COUNT_CL`, `MIN_CELL_COUNT_GLOBAL`, `EXECUTION_DENSITY_PRESET_DAYS`) and the pure helper `isExecutionDensityPreset(range, today)` (used by both this use case and TASK-F09-2). The generated `api-types.ts` and `openapi.json` MUST be regenerated and committed so TASK-F09-2 can consume the contract.
- **FR-015**: A new role-matrix action `map.execution_density` MUST be added with `roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER']` and no condition (the `/map` requires no permission flag). The constant the use case uses for its role gate MUST equal `ROLE_ACTION_MATRIX['map.execution_density'].roles`, proven by a test. The same key MUST be used as the `requireTenantScope` label.
- **FR-016**: The period MUST be converted to instants with the shared timezone helpers (`parseDateInTimezone` + `nextCivilDay`) as a half-open interval `[from, toExclusive)`, correct on 23 h / 25 h days; the system MUST NOT use `new Date('YYYY-MM-DD')` for business rules.
- **FR-017**: This PR MUST update the backend and shared `CLAUDE.md` files (the endpoint, the privacy rules, the "measures check-ins not completed services" semantics, the preset-only residual-risk note, the integer-scaling index rule, the new schema/constants/helper, and the new role-matrix key).

### Key Entities *(include if feature involves data)*

- **InspectionExecution** (existing table `inspection_executions`): the check-in geolocation source. Has `appointment_id` (unique), `inspector_id`, `started_at`, `start_latitude`/`start_longitude` (`Decimal(10,7)`, NOT NULL), nullable `finish_*`, and `abandoned_at` (added by TASK-F03-2). It has **no `tenant_id`**; scope is derived through the join to `appointments`. No schema change in this feature.
- **Appointment** (existing): supplies `tenant_id` (agency scope) and `deleted_at` (soft-delete filter) via the join. Not modified.
- **ExecutionDensityReader** (new domain port): aggregation-only contract returning `{ rows: [{ latIndex, lngIndex, count }], totals: { valid, invalid } }`; deliberately has no method returning individual coordinates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (D.A1)**: The endpoint returns only executions whose `started_at` falls in the requested civil-date period in Sydney, with exact inclusive boundaries (including 23 h/25 h daylight-saving days). The 30-day default lives in the web layer (TASK-F09-2), not here.
- **SC-002 (D.A2)**: `tenantId` and `inspectorId` measurably change the result for AM/OP, restricting it to the chosen agency and/or check-in inspector.
- **SC-003 (D.A3)**: A CL actor of one agency never sees another agency's points; the requested `tenantId` is ignored and `inspectorId` is rejected with 403. No actor receives an individual coordinate; CL cannot see cells with fewer than 3 check-ins and is limited to the 7/30/90-day presets ending today, so it cannot differentiate one-day windows.
- **SC-004 (RBAC)**: `ROLE_ACTION_MATRIX['map.execution_density']` exists with roles `['AM','OP','CL_ADMIN','CL_USER']` and matches the roles the use case accepts; `INSP`/`TNT` get 403.
- **SC-005 (check-in semantics)**: Appointments that went `DONE → REJECTED` and reopened appointments are counted as check-ins (they are not excluded as "not completed").
- **SC-006 (privacy at the DB boundary)**: Rows leaving Postgres carry only `latIndex`, `lngIndex`, `count` — no raw coordinate reaches the application layer, verified by the real-database integration test.
- **SC-007 (performance)**: A 366-day, no-agency query stays within acceptable latency using the existing `inspection_executions(started_at)` index and the `appointments` PK join, with no new index or migration in this PR; a candidate covering index is recorded as a follow-up only if a staging `EXPLAIN ANALYZE` exceeds ~200 ms.

## Assumptions

- **Premise (Q6, pending — decisoes.md)**: Q6 concerns only contract *wording* ("over the map of delivery 01") and does not change this implementation. The spec assumes the plan's recommendation: the density endpoint is independent of the F00 pin window and keeps its own period. No behavior depends on Q6's resolution.
- **Tenant-scope exception documented (CLAUDE.md §7.1)**: `inspection_executions` has no `tenant_id`, but this endpoint is **tenant-scoped** (not a platform-scoped inspector entity): scope is enforced through the `appointments.tenant_id` join. This is the documented case where the subject (an agency's appointments) is tenant-owned even though the execution row itself has no tenant column. An integration test proves a CL actor of one agency cannot read another agency's density (D.A3 / FR-006).
- **TASK-F03-2 is merged on `develop`** (`inspection_executions.abandoned_at`), verified at `origin/develop @ 75166fe6`. Without it the aggregation query does not compile against the database; the filter MUST NOT be removed to ship earlier.
- **X02-1 permanent geocoding is merged**: property/branch coordinates are permanent, but this endpoint reads execution check-in coordinates, not property coordinates, so no dependency on geocoding behavior beyond the column shapes.
- All agencies run in `Australia/Sydney` (`PLATFORM_TIMEZONE`); the project is Sydney-only, so the civil-date → instant conversion uses the platform timezone for every tenant.
- The endpoint ships without a consumer until TASK-F09-2; it can reach production alone (code-only, no migration, no new env, no seed).
- k-anonymity threshold (3 for CL) and the preset-only restriction for CL were decided by the dev (2026-10-28 / 2026-10-29, L-F09-01); the residual risk that differencing the 7/30/90 presets still reveals day-band aggregates (8–30, 31–90) without isolating a single day is accepted and documented.
