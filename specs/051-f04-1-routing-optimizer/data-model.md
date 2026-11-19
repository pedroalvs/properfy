# Phase 1 — Data Model: TASK-F04-1

## 1. `service_types` — new column (persisted)

| Column | Type | Null | Default | Constraint | Semantics |
|---|---|---|---|---|---|
| `default_duration_minutes` | `Int` | no | `45` | SQL CHECK `BETWEEN 5 AND 480` (SQL only) | Expected time at each stop of this type; the optimizer adds it to travel. |

- Prisma: `default_duration_minutes Int @default(45)`. No index. CHECK not modeled in Prisma (no drift).
- Expand-only: NOT NULL with a constant default → no table rewrite (Postgres 11+).
- Tenancy: unchanged. Service types are a platform catalog; this task adds no per-row tenant scoping.

## 2. `routing_rate_limit_buckets` — new table (persisted, platform-scoped)

| Column | Type | Null | Default | Semantics |
|---|---|---|---|---|
| `bucket` | `VarChar(50)` PK | no | – | `matrix:driving-traffic` \| `matrix:driving` \| `directions` |
| `tokens` | `Decimal(10,4)` | no | – | available tokens |
| `capacity` | `Int` | no | – | 25 / 50 / 250 |
| `refill_per_minute` | `Int` | no | – | 25 / 50 / 250 (below Mapbox 30 / 60 / 300) |
| `refilled_at` | `DateTime` | no | `now()` | last refill, **database** clock only |

- Migration: `CREATE TABLE` + `INSERT` the three rows with `tokens = capacity`.
- **No `tenant_id`** — platform infrastructure (one Mapbox token per environment), precedent `cron_job_runs`/`IntegrationSetting`. Documented exception to CLAUDE.md §7.1 (recorded in spec Assumptions).
- Prisma: `model RoutingRateLimitBucket { bucket String @id @map("bucket") @db.VarChar(50); tokens Decimal @db.Decimal(10,4); capacity Int; refillPerMinute Int @map("refill_per_minute"); refilledAt DateTime @map("refilled_at"); @@map("routing_rate_limit_buckets") }`.

## 3. Shared optimizer types (not persisted — `packages/shared/src/route-planning/types.ts`)

```ts
export interface RouteWeights { travel: number; windowWait: number; baseProximity: number } // 0–10, step 0.1
export const DEFAULT_ROUTE_WEIGHTS: RouteWeights = { travel: 1, windowWait: 1, baseProximity: 1 };
export const ROUTE_OPTIMIZER_EXACT_MAX_STOPS = 8;
export const ROUTE_MATRIX_TRAFFIC_MAX_COORDINATES = 10;
export const ROUTE_MATRIX_MAX_COORDINATES = 25;

export interface OptimizerStop {
  key: string;                // appointmentId
  windowStartS: number;       // integer (epoch s in backend/PWA; relative in fixtures)
  windowEndS: number;         // if < windowStartS, treated as windowStartS
  serviceS: number;           // integer ≥ 0 (duration × 60)
  matrixIndex: number | null; // row/col in travelS; null = no coordinate
}
export interface OptimizerInput {
  stops: OptimizerStop[];            // reorderable only
  travelS: number[][];               // integers ≥ 0, square
  originIndex: number | null;        // index of origin in travelS; null = no origin
  earliestDepartureS: number | null; // today: max(now, end of executed prefix); else null
  weights: RouteWeights;
}
export interface EvaluatedStop {
  key: string; sequence: number;     // 1-based within reorderable
  arrivalS: number; serviceStartS: number; serviceEndS: number;
  travelS: number; waitS: number; lateS: number;
}
export interface SequenceEvaluation {
  order: string[];
  departureS: number | null;         // origin departure; null without origin or stops
  finishS: number | null;            // end of last service
  stops: EvaluatedStop[];
  totalTravelS: number; totalWaitS: number; totalLateS: number; firstLegS: number;
  costTenths: number;
  feasible: boolean;                 // totalLateS === 0
  violations: Array<{ key: string; lateS: number }>;
}
export type OptimizerMethod = 'TRIVIAL' | 'EXACT' | 'HEURISTIC' | 'INSERTION' | 'FIXED';
export interface OptimizationResult extends SequenceEvaluation { method: OptimizerMethod }

export function evaluateSequence(input: OptimizerInput, order: string[], opts?: { legTravelS?: Array<number | null> }): SequenceEvaluation;
export function optimizeRoute(input: OptimizerInput, opts?: { forceMethod?: 'EXACT' | 'HEURISTIC' }): OptimizationResult;
export function insertIntoOrder(input: OptimizerInput, baseOrder: string[], newKeys: string[]): OptimizationResult;
export function compareEvaluations(a: SequenceEvaluation, b: SequenceEvaluation, rank: Map<string, number>): number;
export function toWeightTenths(w: RouteWeights): { travel: number; windowWait: number; baseProximity: number };
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number; // R = 6371008.8 m
export function selectMatrixProfile(coordinates: number): 'driving-traffic' | 'driving' | null;
export class RouteOrderMismatchError extends Error { readonly code = 'ROUTE_ORDER_MISMATCH' }
```

## 4. Backend routing ports/types (not persisted — `modules/day-plan/domain`)

`IRoutingService`, `RoutePoint`, `RoutingProviderName`, `MatrixProfile`, `RoutingMatrix`, `RoutingLeg`, `RoutingCallOptions`, `RoutingProviderError`, `RoutingDeferredError`; `IRoutingRateLimiter`, `RoutingRateBucket`. Application types: `PlanRouteStopInput`, `PlanRouteMode`, `StoredRoutingMatrix`, `PlanRouteInput`, `PlanRouteResult`. Full shapes in [contracts/routing-service.contract.md](./contracts/routing-service.contract.md).

## 5. State / lifecycle

- No entity lifecycle here. The rate-bucket row is mutated in place (token refill/consume/drain); it is never deleted. No day-plan state machine (TASK-F04-2).
