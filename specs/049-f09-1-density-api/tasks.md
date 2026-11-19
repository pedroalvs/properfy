# Tasks: Execution Density Map API

**Feature**: `049-f09-1-density-api` | **Branch**: `049-f09-1-density-api`
**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/execution-density.openapi.md`, `quickstart.md`

TDD is mandatory (constitution III). Every test task is written and seen failing before its implementation task. Test IDs (S/M/G/U/D/R) map to the tables in `fase2-etapa1/tarefas/F09-tarefas.md` TASK-F09-1 and are reproduced in `contracts/` + `quickstart.md`.

**Shared-file discipline** (do not hand-resolve conflicts): `api-types.ts` + `openapi.json` are always **regenerated** (`pnpm generate:api`); `role-matrix.ts` gets an **appended** action; one PR, no migration.

---

## Phase 1: Setup

- [x] T001 Confirm worktree baseline green (`origin/develop @ 75166fe6`, deps installed, prisma generated, `@properfy/shared` + `@properfy/frontend-standards` built, backend + shared typecheck/lint clean) — done via the setup subagent; re-run only if drift is suspected.

---

## Phase 2: Foundational (blocking prerequisites for all user stories)

The shared contract and the pure grid domain are consumed by every story's use case and tests, so they come first.

### Shared contract (P1 / P1a)

- [x] T002 [P] Write `packages/shared/src/schemas/execution-density.test.ts` with S1–S15 (query validation: required dates, calendar check, order, 366-day cap, uuid; response shape incl. `minCellCount`; constants `EXECUTION_DENSITY_GRID_SCALE=1000`, `EXECUTION_DENSITY_GRID_DEGREES=0.001`, `MAX_EXECUTION_DENSITY_PERIOD_DAYS=366`, `MAX_EXECUTION_DENSITY_CELLS=5000`, `MIN_CELL_COUNT_CL=3`, `MIN_CELL_COUNT_GLOBAL=1`, `EXECUTION_DENSITY_PRESET_DAYS=[7,30,90]`; `isExecutionDensityPreset` S14/S15). See it fail.
- [x] T003 Implement `packages/shared/src/schemas/execution-density.ts`: `executionDensityQuerySchema`, `executionDensityResponseSchema`, the constants, and `isExecutionDensityPreset(range, today)` (pure; uses `addCivilDays` from `utils/local-date.ts`). Green T002.
- [x] T004 Export the new module from `packages/shared/src/schemas/index.ts` (and ensure constants/helper reach the package barrel `src/index.ts`).
- [x] T005 [P] Write `role-matrix.test.ts` additions M1 (`ROLE_ACTION_MATRIX['map.execution_density']` = `{ roles: ['AM','OP','CL_ADMIN','CL_USER'] }`, no `condition`) and M2 (`can('INSP'|'TNT', …)=false`; `can('CL_USER', …)=true`) in `packages/shared/src/permissions/role-matrix.test.ts`. See it fail.
- [x] T006 Append the `'map.execution_density'` action to `ROLE_ACTION_MATRIX` in `packages/shared/src/permissions/role-matrix.ts` with the comment "inspectorId filter is AM/OP-only; enforced in the use case". Green T005.
- [x] T007 `pnpm --filter @properfy/shared build` + `pnpm --filter @properfy/shared test` (backend and web resolve `@properfy/shared` from `dist`).

### Pure backend domain (P3)

- [x] T008 [P] Write `apps/backend/tests/unit/inspector-execution/execution-density-grid.test.ts` with G1–G8: `cellCenter` (centers, ≤4 decimals, floor on negatives), `toCellIndex` (exact decimal-string FLOOR mirror, G5/G5a boundary points, G5b string-only type), `cellCenter`→real-point distance ≤75 m (G6), `periodToInstants` on the 23 h (G7) and 25 h (G8) Sydney DST days. See it fail.
- [x] T009 Implement `apps/backend/src/modules/inspector-execution/domain/execution-density-grid.ts`: `cellCenter`, `toCellIndex(value: string): number` (integer decimal-point shift, no float `Math.floor`), `periodToInstants` (via `parseDateInTimezone`/`nextCivilDay` + `PLATFORM_TIMEZONE`), `minCellCountFor(pinned)`. Green T008.
- [x] T010 Create the port `apps/backend/src/modules/inspector-execution/domain/execution-density.reader.ts` (`ExecutionDensityFilters`, `ExecutionDensityRow`, `ExecutionDensityReader.aggregate`) with the privacy-invariant doc comment (no method returns raw coordinates/rows).

**Checkpoint**: shared contract published to `dist`; pure grid math + port compile and their unit tests pass. User-story phases can start.

---

## Phase 3: User Story 1 — Operators read aggregated check-in density (Priority: P1) 🎯 MVP

**Goal**: AM/OP get a 200 with grid-cell centers + counts, exclusions and truncation correct, no raw coordinate anywhere.

**Independent test**: Call as AM with a valid period; assert cells are centers (≤4 decimals, `count≥1`), the totals/`truncated`/`excludedWithoutCoordinates` fields, and that each cell has exactly `lat/lng/count`.

- [x] T011 [US1] Write `apps/backend/tests/unit/inspector-execution/get-execution-density.use-case.test.ts` covering the US1 cases with a fake reader that records filters: U1 (AM no filters → Sydney instants), U10 (assembly: centers, order, `totalExecutions`, `cellCount`, `truncated:false`, echo), U11 (`limit+1` rows → `cells.length=5000`, `truncated:true`, `totalExecutions=valid total`), U12 (empty rows + invalid totals → `excludedWithoutCoordinates`), U13 (cell keys exactly `['lat','lng','count']`), U14 (AM/OP `minCellCount:1`), U18 (AM count:1 visible), U22 (`EXECUTION_DENSITY_ROLES` sorted == matrix roles sorted). See it fail.
- [x] T012 [US1] Implement `apps/backend/src/modules/inspector-execution/application/use-cases/get-execution-density.use-case.ts`: role gate (`EXECUTION_DENSITY_ROLES = APPOINTMENT_LIST_ROLES`), `requireTenantScope`, scope via `resolveAppointmentListTenantScope`, `periodToInstants`, `minCellCount` by scope, `reader.aggregate`, assembly (re-filter `count>=minCellCount`, truncation, `cellCenter`, totals, echo). Injectable `now: () => Date`. Green the US1 subset of T011.
- [x] T013 [US1] Write `apps/backend/tests/integration/db/execution-density.integration.test.ts` US1 cases (testcontainers, serial): seed e1–e9; D1 (no tenant: cell A=4, B=1, invalid=1, e5/e6/e8 excluded), D6 (single-day boundary e9), D7 (empty window), D8 (in-progress still counts), D9 (restarted execution counts once at new cell), D10 (`limit=1` → returns `limit+1` rows, ordered `count DESC, latIndex, lngIndex`), D11 (rows carry only `latIndex/lngIndex/count`), D16 (grid-boundary points: SQL index == `toCellIndex`). See it fail.
- [x] T014 [US1] Implement `apps/backend/src/modules/inspector-execution/infrastructure/prisma-execution-density.reader.ts`: `$queryRaw` aggregate (`FLOOR(coord * ${scale}::int)::int`, join, window `[from,toExclusive)`, `abandoned_at IS NULL`, `deleted_at IS NULL`, valid-coord predicate, `GROUP BY 1,2`, `HAVING >= ${minCellCount}::int`, `ORDER BY 3 DESC,1,2`, `LIMIT ${limit+1}::int`) + totals query (`COUNT(*) FILTER`), run in `Promise.all`; conditional `Prisma.sql` fragments for `tenantId`/`inspectorId`. Green T013 US1 cases.
- [x] T015 [US1] Write `apps/backend/tests/integration/inspector-execution/execution-density.routes.test.ts` US1 cases (Supertest + `createMockContainer`): R1 (AM 200 envelope + use case called with parsed query), R2 (401 no token / validation-before-auth note), R3 (`toDate<fromDate` 400), R4 (400-day 400), R7 (extra cell key stripped by response serializer). See it fail.
- [x] T016 [US1] Implement the route `apps/backend/src/modules/inspector-execution/interfaces/execution-density.routes.ts` (`ExecutionDensityRouteContainer`, `createAuthMiddleware`, `schema.querystring`+`response 200`, `safeParse`→`ValidationError`, `success()`), add the `executionDensity` key to `AppContainer` in `apps/backend/src/main/container.ts` (wire use case + Prisma reader + `jwtService` + `tenantRepo`), register in `apps/backend/src/main/routes.ts`, and add the `executionDensity` key to `apps/backend/tests/helpers/mock-container.ts`. Green T015 US1 cases.

**Checkpoint**: endpoint works end-to-end for AM/OP platform-wide reads; MVP demonstrable.

---

## Phase 4: User Story 2 — Agency users see only their own agency's density, privacy-protected (Priority: P1)

**Goal**: CL scoped to own agency; `tenantId` ignored; `inspectorId`→403; cells `<3` hidden; non-preset period→400 `PERIOD_NOT_A_PRESET`; no-tenant JWT→403.

**Independent test**: as CL of T1, assert own-agency-only, ignored `tenantId`, `inspectorId` 403, k-anonymity, preset enforcement.

- [x] T017 [US2] Add use-case cases to `get-execution-density.use-case.test.ts`: U4 (CL_ADMIN no tenant → JWT tenant), U5 (CL_USER forged `tenantId` ignored), U6 (CL + `inspectorId` → 403, reader not called), U7 (CL no-tenant JWT → `TENANT_SCOPE_REQUIRED`), U8 (INSP → 403 before scope helper), U9 (TNT → 403), U15 (CL `minCellCount:3`), U16 (CL re-filter drops a `count:2` row), U17 (CL `count:3` shown), U19 (CL `totalExecutions` = full recorte incl. hidden), U20 (CL non-preset → `PERIOD_NOT_A_PRESET` with fixed clock `2026-11-03T14:30:00Z`), U21 (CL presets accepted), U21a (AM/OP 1-day-diff windows both allowed — proves the CL-only guard). See them fail.
- [x] T018 [US2] Extend the use case for the CL branches: `inspectorId` 403 when pinned; preset guard `isExecutionDensityPreset(query, civilDateInTimezone(now(), PLATFORM_TIMEZONE))` → `ValidationError(..., { reason:'PERIOD_NOT_A_PRESET', allowedDays:[7,30,90] })`; `inspectorId: pinned ? undefined : query.inspectorId`. Green T017.
- [x] T019 [US2] Add DB cases to `execution-density.integration.test.ts`: D2 (`tenantId:T1` excludes e4/T2 — D.A3), D3 (`tenantId:T2` only e4), D12 (CL k: A shown, B hidden), D13 (B=2 hidden), D14 (B=3 shown), D15 (same seed, `minCellCount:1` → B=2 shown), D17 (`DONE→REJECTED` counts — T4 seed), D18 (reopened counts once at original cell — T4). See them fail; green against the reader (already honors `tenantId`/`minCellCount`), adding any missing reader behavior.
- [x] T020 [US2] Add route cases to `execution-density.routes.test.ts`: R5 (INSP mock → 403 `AUTH_FORBIDDEN`), R6 (CL + `inspectorId` → 403), R8 (inactive agency → 401/403 from middleware), R9 (CL non-preset mock → 400 `error.details.reason==='PERIOD_NOT_A_PRESET'`). Green.

**Checkpoint**: tenant isolation (D.A3), k-anonymity, preset lock, and RBAC fully enforced and tested.

---

## Phase 5: User Story 3 — AM/OP narrow by agency and inspector (Priority: P2)

**Goal**: `tenantId`/`inspectorId` measurably change the AM/OP result; OP does not depend on `actor.tenantId`.

**Independent test**: as AM with `tenantId`+`inspectorId`, assert the counted cells match only that agency/inspector.

- [x] T021 [US3] Add use-case cases U2 (AM `tenantId:T1`,`inspectorId:I1` → reader gets both) and U3 (OP JWT no tenant, `tenantId:T2` → reader gets T2) to the use-case test. Green (behavior already in T012; assert the wiring).
- [x] T022 [US3] Add DB cases D4 (`tenantId:T1`,`inspectorId:I2` → only B, invalid=1) and D5 (`tenantId:T1`,`inspectorId:I1` → A=3) to the integration test. Green against the reader's conditional fragments.

**Checkpoint**: D.A2 proven; all three stories complete.

---

## Phase 6: Polish & Cross-Cutting

- [x] T023 Regenerate the contract: `pnpm generate:api` (backend `generate:openapi` → shared `generate:types`); commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` (CI `contract-freshness` gate). Never hand-edit.
- [x] T024 [P] Update `apps/backend/CLAUDE.md`: new endpoint under §6, the privacy rules (aggregation in SQL, cell center never mean, k=3 CL / preset-only with documented residual risk, integer-scaling index, port has no raw-row method), and the "measures check-ins not completed services" semantics (`DONE→REJECTED` + reopened count).
- [x] T025 [P] Update `packages/shared/CLAUDE.md` §5: new `execution-density.ts` schema module, its constants, `isExecutionDensityPreset`, and the `map.execution_density` role-matrix key.
- [ ] T026 Run gates inside the worktree (via subagent, condensed summary): `pnpm --filter @properfy/shared build && test`; `pnpm --filter backend typecheck && lint && test`; `pnpm --filter backend exec vitest run -c vitest.integration-db.config.ts tests/integration/db/execution-density.integration.test.ts`; `git status --porcelain` empty; `git diff --stat origin/develop... | tail -1` (<150, expected ~21).
- [ ] T027 Commit (Conventional, no AI/Claude refs), push `049-f09-1-density-api`, open PR → `develop` with the D.A1/D.A2/D.A3→tests table, the privacy note, the preset residual-risk note (L-F09-01), the check-in-semantics note (L-F09-02), the new matrix key (L-F09-09), and the staging `EXPLAIN ANALYZE` figure.

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → Phases 3/4/5 → Phase 6** (sequential checkpoints).
- Phase 2 (foundational) blocks all stories: the shared `dist` (T007) and the port/grid (T009/T010) are prerequisites.
- US1 (Phase 3) is the MVP and builds the use case + reader + route that US2/US3 extend. US2 and US3 therefore depend on US1's T012/T014/T016 existing, then add branches/tests. They are not independently deployable before US1, but each is independently *testable* against the shared artifact.
- Phase 6 T023 depends on the route (T016) existing; T026/T027 are last.

## Parallel opportunities

- T002 ‖ T005 (different shared test files); T008 ‖ (T002/T005) (backend vs shared).
- Within a story the test task precedes its impl task (TDD), so they are not parallel; across stories the DB-test additions (T019/T022) touch the same file and must be sequential.
- T024 ‖ T025 (different CLAUDE.md files).

## MVP scope

User Story 1 (Phase 3) alone — the AM/OP aggregated read with privacy-safe cell centers, truncation and exclusions — is a demonstrable, shippable MVP. US2 (tenant isolation + privacy for CL) is equally P1 and required before real multi-tenant exposure; US3 (P2) is a refinement.

## Format validation

All tasks use `- [ ] [TaskID] [P?] [Story?] description + file path`. Setup/Foundational/Polish carry no story label; US1/US2/US3 tasks carry `[US1]`/`[US2]`/`[US3]`.
