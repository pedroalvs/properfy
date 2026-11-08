# Quickstart — Inspector Program (backend + shared)

## Build & generate

```bash
pnpm --filter @properfy/shared build          # enums/lib/schemas/settings/role-matrix
pnpm --filter backend exec prisma generate      # after schema.prisma edit
pnpm --filter backend exec prisma migrate dev --name inspector_program   # apply locally; verify no Unsupported() index dropped
pnpm generate:api                               # OpenAPI -> api-types (commit both)
```

## Tests (TDD order — write before code)

Shared (Vitest): `enums/inspector-program.test.ts`, `lib/inspector-level.test.ts`, `platform-settings.test.ts` (inspectorProgram), `schemas/inspector-program.test.ts`.
Backend domain (Vitest, also `TZ=America/Los_Angeles`): `goal-periods.test.ts`, `evaluate-goal.test.ts`, `participants.test.ts`, `streak.test.ts`, `ordering.test.ts`, `promised-summary.test.ts`, `messages-run-at.test.ts`.
Backend application: `close-goal-periods.use-case.test.ts`, `reward-award-actions.use-case.test.ts`, `goal-crud.use-case.test.ts`, `standing-progress.test.ts`.
Backend F07 extension: `reliability-metrics.service.test.ts` (regression + scope + `completedServiceDates`).
Region guard: `service-region/delete-service-region.use-case.test.ts` (new 409).
Routes (Supertest): `inspector-program.routes.test.ts` + worker test.
DB (testcontainers + PostGIS): `reliability-facts.reader.db.test.ts` (scope), `inspector-program.repository.db.test.ts` (uniques, CHECKs, CAS, `findParticipations`, `index_snapshot_date`).

```bash
pnpm --filter @properfy/shared test
pnpm --filter backend typecheck && pnpm --filter backend lint
pnpm --filter backend test                     # unit + supertest (excludes :db)
pnpm --filter backend test:integration         # tests 14, 18
pnpm --filter backend test:integration:db      # tests 16, 17 (testcontainers)
```

## Manual smoke (local)

1. Seed an active `VOLUME ≥ 10` weekly goal starting a past Monday with ≥ 2 inspectors having ≥ 10 DONE in the closed week.
2. Trigger the job (`STARTUP` enqueue or set the clock past 04:45): expect one `GoalPeriodClosure` and one `PENDING` award per achiever; `GET /v1/inspector-program/summary?periodType=WEEKLY&periodStart=<Mon>` sums them.
3. `POST …/awards/:id/approve` with `Idempotency-Key` → `APPROVED`; repeat same key → same response, no new write; second approver → `409`.
4. `POST …/awards/:id/void` with `{ reason }` → `VOID`; a `PAID` award (hand-set) → `409`; `POST …/mark-paid` → `404`.
5. `DELETE /v1/service-regions/:id` on a region used by an active `REGION_VOLUME` goal → `409 SERVICE_REGION_HAS_ACTIVE_GOALS`.
6. As `CL_ADMIN`/`INSP`/`TNT`: every admin route → `403`.

## Verification gate (before PR)

`pnpm --filter @properfy/shared build test`; `pnpm --filter backend typecheck lint test`; `test:integration` + `test:integration:db` (via subagent, condensed summary); `pnpm generate:api` committed; `git diff --stat origin/develop... | tail -1` < 150.
