# Quickstart — Day Plan (TASK-F04-2)

## Build & verify (inside the worktree)

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
# after schema/route changes:
pnpm --filter backend exec prisma migrate dev --name day_plans   # local apply
pnpm generate:api                                                # regenerate openapi.json + api-types.ts
# gates (full backend suite is the correctness gate):
pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared build
pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test
pnpm --filter backend test:integration:db      # testcontainers, serial
pnpm --filter web typecheck && pnpm --filter pwa typecheck
```

## Primary flows to demo

1. **Publish (00.A2, 01.A1)** — seed 1 agency, 1 inspector with base, 3 confirmed SCHEDULED for tomorrow + 1 unconfirmed ROUTINE; run `appointment.reject-unconfirmed` @19:00 then `day-plan.publish` @19:30 (injected clock, Mapbox stubbed) → PUBLISHED plan with 3 ordered stops, frozen `published_eta`, geometry FeatureCollection, one `ROUTE_PUBLISHED` notice enqueued.
2. **Inspector GET (01.A1/01.A3/00.A5)** — `GET /v1/inspector/day-plans/<tomorrow>` as the inspector → `DayPlanResponse` with origin `BASE`; unchanged fingerprint ⇒ no provider call.
3. **Reorder with stop in progress (SC-007)** — `POST /v1/inspector/appointments/:id/start` (F03), `GET` (stop 1 `executed`), `PUT /:date/order` the remaining two → 200.
4. **Day origin (L-F04-07)** — `PUT /:date/origin` before start → OVERRIDE; after a check-in → 422 `DAY_PLAN_ALREADY_STARTED`, `GET` shows `origin.source LAST_STOP`.
5. **Sheet (01.A6)** — `GET /:date/sheet?format=pdf` and `?format=xlsx` → binaries; `?format=csv` → 400; audit `day_plan.exported`.
6. **AM/OP** — `GET /v1/day-plans/:inspectorId/:date` (no Mapbox), `POST /preview` (weights), `GET /eta-accuracy`.
7. **Purge** — `day-plan.purge-route-data` nulls geometry/matrix/leg of past plans.

## Acceptance → test map

| Criterion | Tests (see spec §Testes primeiro in F04-tarefas.md) |
|---|---|
| 01.A1 | 3, 30 |
| 01.A6 | 15, 21 |
| 00.A2 part | 9, 30 |
| 01.A3/00.A5 | 3 |
| CL/INSP isolation | 17 |
| No Mapbox token | 18 |
| ETA metric (frozen) | 12, 22 |
| Reorder mid-progress | 5, 27b |
| onboardingCompletedAt | 16c |
| Check-out → no provider call | 4 (L-F04-01) |
| `published_at` timezone | 4, 706–707 (L-F04-02) |
| Status-join safety | 4, 24b, 26b (L-F04-04) |
| Infeasible signalled | 9 (L-F04-05) |
| ROUTE_CHANGED effective/10-min | 6 (L-F04-06) |
| LAST_STOP + 422 | 3, 7, 24e (L-F04-07) |
| primaryContact rule | 3b (L-F04-08) |
| Sheet audit/30-day/tz | 15, 24d (L-F04-10) |
| Rate limits & preview range | 13, 24c (L-F04-14) |
| classifyStops/fingerprint Prisma-free | 1, 1b (L-F04-16) |
| BASE_CHANGED STALE | 8, 27a (R-F01-03) |

## Rollout

Staging with `DAY_PLAN_PUBLISH_ENABLED=false` → open plans via `GET` → enable job → prod after Part B (F04-3). Kill switches: `DAY_PLAN_PUBLISH_ENABLED` (job), `DAY_PLAN_ROUTING_PROVIDER=stub` (provider, F04-1). **Go-live prerequisite: Mapbox commercial Order (Plan A, L-F04-03).**
