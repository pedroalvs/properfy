# Phase 0 Research — F06-1 Tenant Arrival ETA Foundation

All product decisions are closed in `fase2-etapa1/tarefas/F06-tarefas.md` (D1–D19, L-F06-01..11). This file records only the technical decisions and the one real reconciliation (F04 Plan B).

## R1 — F04 contract reconciliation against live `develop` (the only NEEDS CLARIFICATION)

**Finding.** The task file's snapshot (`042a9674`) predates the merged F04 **Plan B** PRs (#1337/#1339/#1340, now on `origin/develop` @ `d8c71acf`). Verified in the worktree:

- `packages/shared/src/route-planning/evaluate-sequence.ts` still exports `evaluateSequence(input, order, { legTravelS })` with the **same** signature and forward-slack behaviour; `OptimizerInput`/`OptimizerStop`/`DEFAULT_ROUTE_WEIGHTS` unchanged in `types.ts`; `earliestDepartureS` honoured as the departure floor.
- `packages/shared/src/schemas/day-plan.ts` **no longer exports** `toOptimizerInput`, `buildLegOverrides` or a `routingInput` field (Plan B removed the persisted routing cache). Plan→`OptimizerInput` construction + the `legTravelS` passes now live in backend `apps/backend/src/modules/day-plan/application/services/plan-route.service.ts`, which builds `travelS`/`matrixIndex`/`earliestDepartureS` and calls `evaluateSequence(input, order, { legTravelS })`.
- `day_plan_stops.travel_s` is still persisted per stop (the per-leg arriving travel seconds) and `day_plan_stops.service_start_at`/`published_service_start_at` are still the frozen/fresh plan starts.

**Decision.** `projectStopEta` does **not** depend on `routingInput` or on the removed helpers. It builds its own `OptimizerInput` from the plan-reader rows exactly as the task's Algorithm §A step 3 already prescribes: `stops` = pending `OptimizerStop`s, `travelS` = a square zero matrix (never read — every leg is overridden), `originIndex` from anchor/origin presence, `earliestDepartureS = max(anchorEnd ?? now, now)`, `weights = DEFAULT_ROUTE_WEIGHTS`; `legTravelS[i] = pending[i].travelS` (the saved `travel_s`), then `evaluateSequence(input, order, { legTravelS })`.

**E12 coherence test (reconciled).** Instead of the removed `evaluateSequence(toOptimizerInput(plan, now), order, { legTravelS: buildLegOverrides(order, plan.routingInput) })`, the coherence invariant is asserted two ways on the A/B/C fixture:
1. For `now ≤ departure` and no `LATE_NOTICE`, the pending projected starts equal the plan's stored `day_plan_stops.service_start_at` (what F04's `PlanRouteService` wrote) — E1.
2. For a later `now` (E1b/E2), the pending starts equal a direct `evaluateSequence(optimizerInput, order, { legTravelS })` built with `earliestDepartureS = max(anchorEnd ?? now, now)` from the same rows — i.e. the predictor reproduces the exact `evaluateSequence` computation F04 would run for that `now`. This preserves the "one predictor, one answer" rule regardless of F04's internal reshaping.

**Alternatives considered.** Re-introducing a `toOptimizerInput` helper in shared — rejected: it would duplicate `PlanRouteService`'s construction and re-create the coupling Plan B removed; the predictor already owns its construction from raw rows (which is also how F05 is told to build `EtaPlanInput`, L-F06-07).

## R2 — Departure rule (single predictor)

**Decision.** `earliestDepartureS = max(anchorEnd ?? now, now)` (never `now − travelS`). Rationale: identical to F04's today-recompute floor (`earliestDepartureS` in `OptimizerInput`), so the tenant SMS, the inspector app and Live Day all show the same arrival. The `LATE_NOTICE` floor (D18) is the only extra rule the tenant/F05 projection applies, because `LATE_NOTICE` does not mark the plan STALE.

## R3 — ETA band clipping (Achado 1)

**Decision.** Lower-clip always (window start and `ceil5(now)`); upper-clip only while the rounded centre is still inside the window. A running-late prediction is past the window end, so upper-clipping would show a time that will not happen (or an empty band). Degenerate fallback `{ from: ceil5(now), to: from + H }` when `from > to`. Centre rounding is absolute (multiple of 300 s, half-up); Australian offsets are 30-min multiples so absolute rounding coincides with local.

## R4 — Classification & opt-out (L-F06-03)

**Decision.** `OPERATIONAL` class (consent-checked per channel, never protected). No per-message STOP footer (Spam Act 2003 factual-service exemption). The stop mechanism is a manual AM/OP opt-out reusing the existing `operator_override` `ConsentChangeSource` enum value — so **no migration**. `RecordConsentOptOutUseCase` mirrors `OverrideConsentUseCase` (same deps, same RBAC, `assertTenantScope`), normalizes the recipient exactly as `SendNotificationUseCase` does before `findByScope`, and is idempotent when already opted-out.

## R5 — No migration, no send (FR-024/FR-025)

**Decision.** Templates arrive via `syncPlatformTemplates` at boot (6 rows, `tenant_id NULL`, `OPERATIONAL`); config via the `PLATFORM_SETTINGS_REGISTRY` (defaults in code, `enabled:false`); the agency flag via `settings_json`; dedupe (F06-2) via the deterministic UUID v5 id + `created_at` count; opt-out via the existing enum. No schema change. Nothing is dispatched in this PR; `TenantCronTick`, the send pipeline (beyond an additive SMS cost log) and the daily SMS cap are untouched.

## R6 — `CreateNotificationOutput.created` ripple (project memory: usecase output shape change → grep all mocks)

**Decision.** Change `CreateNotificationOutput` to `{ notificationId; created }`. The backend `tsconfig` excludes `tests/`, so untyped mocks will keep compiling with the old shape and silently drift — therefore grep **all** ~24 test mocks + 15 `src/` callers (lists enumerated in the task file) and update every mock to the new shape; no existing caller reads `created`, so behaviour is unchanged. Proven green by backend typecheck + `pnpm --filter backend test`.

## R7 — Shared-package lint gate (project memory: shared change → lint transitive workspaces)

**Decision.** Because the change touches `packages/shared` and regenerates `api-types.ts`, run full **lint** (not just typecheck + test) of backend AND both frontends the diff reaches — an unused-var is lint-only and passes typecheck locally but fails CI. Gates run inside the worktree via a subagent returning a condensed summary.
