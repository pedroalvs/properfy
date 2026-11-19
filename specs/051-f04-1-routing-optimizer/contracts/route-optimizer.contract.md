# Contract — Pure route optimizer (shared public surface)

The public surface of `packages/shared/src/route-planning/` (owned by Esteio; consumed by `PlanRouteService` and the PWA reorder). Types are in [../data-model.md](../data-model.md) §3. This file fixes the **behavioral** contract the Vitest suite proves.

## Functions

- `evaluateSequence(input, order, opts?)` → `SequenceEvaluation`. Computes per-stop arrival/service/wait/late and plan departure/finish for `order`. Windows are hard for arrival/start (late when `start > windowEnd`). Applies **forward slack** (delay departure by the largest `d` increasing no lateness, floor `earliestDepartureS`). `opts.legTravelS[i]` overrides leg `i`'s travel (final Directions pass). Throws `RouteOrderMismatchError` if `order` is not exactly the input keys.
- `optimizeRoute(input, opts?)` → `OptimizationResult`. Method by stop count: 0–1 `TRIVIAL`, 2–8 `EXACT` (DFS, provably = brute force), ≥ 9 `HEURISTIC` (nearest-feasible + first-improvement 2-opt, ≤ 50 sweeps, ≥ greedy). `opts.forceMethod` for tests only. Deterministic across shuffled inputs and reruns.
- `insertIntoOrder(input, baseOrder, newKeys)` → `OptimizationResult`. Cheapest insertion of each new key into the surviving prior order; earliest position on ties; `method 'INSERTION'` (or `'FIXED'` when nothing new).
- `compareEvaluations(a, b, rank)` → number. Total order `(totalLateS, costTenths, finishS, lexicographic by rank)`.
- `toWeightTenths(w)` → integer weights `round(weight × 10)`.
- `haversineMeters(a, b)` → meters, `R = 6371008.8`; 0 for identical, 111195 ± 1 for `(0,0)→(0,1)`.
- `selectMatrixProfile(n)` → `'driving-traffic'` (n ≤ 10) | `'driving'` (11–25) | `null` (≥ 26).

## Cost

`costTenths = W_t·totalTravelS + W_w·totalWaitS + W_b·firstLegS`, `W = toWeightTenths(weights)`. `travel` = whole displacement origin→…→last (no return to base); `windowWait` = sum of window waits; `baseProximity` = first origin leg.

## Canonical rank

Stops sorted by `(windowStartS asc, key asc)`; `rank(key)` = position. Used for the lexicographic tie-break and the exact DFS order.

## Worked fixtures (the test contract)

The "line" matrix (O–A–B–C colinear, symmetric) and Examples 1–8, 6b/6c, plus determinism/edge tests 9–22 in spec "Tests first §A" are the binding acceptance fixtures. Highlights:

- Example 1 → `A,B,C`, `EXACT`, departure −600, cost 2400, feasible, finish 9300.
- Example 2 (C 08:00–08:30) → `C,B,A`, cost 4800.
- Example 5 (infeasible) → `A,B`, `feasible false`, `violations [{B,1500}]`, cost 1800.
- Example 7 (10 stops) → `S01…S10`, `HEURISTIC`, finish 20700.
- Example 8 (force HEURISTIC) → 2-opt fixes greedy `P1,P2,P3` → `P2,P1,P3`.
- Exact == brute force over 50 seeded 6-stop instances (test 10); heuristic ≥ greedy over 50 seeded 9–12-stop instances (test 11).
