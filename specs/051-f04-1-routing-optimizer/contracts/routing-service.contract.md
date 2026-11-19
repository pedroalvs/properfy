# Contract — `IRoutingService`, `IRoutingRateLimiter`, `PlanRouteService`

Internal TypeScript contracts (not HTTP). Verbatim from TASK-F04-1.

## `modules/day-plan/domain/routing.service.ts`

```ts
export interface RoutePoint { lat: number; lng: number }
export type RoutingProviderName = 'MAPBOX' | 'STUB';
export type MatrixProfile = 'driving-traffic' | 'driving' | 'haversine';

export interface RoutingMatrix {
  provider: RoutingProviderName;
  profile: MatrixProfile;
  durationsS: number[][];              // integers
  distancesM: number[][];              // integers
  nullPairs: Array<[number, number]>;  // provider pairs with no route
}
export interface RoutingLeg {
  provider: RoutingProviderName;
  durationS: number;
  distanceM: number;
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> }; // [lng, lat], 5 decimals
}
export interface RoutingCallOptions { maxWaitMs?: number; signal?: AbortSignal }

export interface IRoutingService {
  /** Pairwise travel times, ORDERING ONLY (never final ETAs). Throws RoutingProviderError. */
  matrix(points: RoutePoint[], opts?: RoutingCallOptions): Promise<RoutingMatrix>;
  /** Fixed-order route for ONE leg (2 points) or more; departAt = departure from points[0]. */
  directions(points: RoutePoint[], opts?: RoutingCallOptions & { departAt?: Date }): Promise<RoutingLeg>;
}
export class RoutingProviderError extends Error {
  constructor(readonly code: 'TIMEOUT' | 'RATE_LIMITED' | 'CIRCUIT_OPEN' | 'TOO_MANY_COORDINATES' | `HTTP_${number}` | `PROVIDER_CODE_${string}` | 'NETWORK', message: string);
}
export class RoutingDeferredError extends Error {
  constructor(readonly reason: 'RATE_LIMITED' | 'DEADLINE' | 'PROVIDER_ERROR', readonly cause?: unknown);
}
```

## `modules/day-plan/domain/routing-rate-limiter.ts`

```ts
export type RoutingRateBucket = 'matrix:driving-traffic' | 'matrix:driving' | 'directions';
export interface IRoutingRateLimiter {
  /** Takes 1 token, waiting up to maxWaitMs (polling every 250 ms). false = budget not available in time. */
  acquire(bucket: RoutingRateBucket, maxWaitMs: number): Promise<boolean>;
  /** Empties the bucket (after a provider 429) so every instance backs off. */
  drain(bucket: RoutingRateBucket): Promise<void>;
}
```

## `MapboxRoutingService` behavior (adapter)

- Matrix URL `directions-matrix/v1/mapbox/{profile}/{coords}?annotations=duration,distance&access_token={token}`; profile from `selectMatrixProfile(points.length)`; null → `TOO_MANY_COORDINATES`. Timeout 8000 ms.
- Directions URL `directions/v5/mapbox/driving-traffic/{coords}?geometries=geojson&overview=full&steps=false[&depart_at=YYYY-MM-DDThh:mm:ssZ]&access_token={token}`; `depart_at` sent iff `departAt ≥ now + 60 s`. Timeout 5000 ms.
- `IRoutingRateLimiter.acquire(bucket, maxWaitMs)` before each call (`maxWaitMs` 3000 interactive / 60000 job). HTTP 429 → `drain(bucket)`.
- `CircuitBreaker('mapbox-routing', 5 failures, 60 s)` per process, shared by matrix+directions. No internal retry.
- Token never logged or embedded in an error message (only `api/profile/outcome/status`).

## `StubRoutingService`

- `STUB_ROAD_FACTOR = 1.3`, `STUB_SPEED_MPS = 40 / 3.6`. `durationS = round(haversine × 1.3 / STUB_SPEED_MPS)`, `distanceM = round(haversine × 1.3)`, profile `'haversine'`, provider `'STUB'`, straight `LineString [from, to]`.

## `DynamicRoutingService implements IRoutingService` (`dynamic-providers.ts`)

- `resolver.getConfig('mapbox')` per call; null → stub; else `MapboxRoutingService(accessToken)` cached per token. Receives the limiter and the provider mode (`DAY_PLAN_ROUTING_PROVIDER`): `stub` → always the stub, config not read.

## `PlanRouteService` (`application/services/plan-route.service.ts`)

```ts
export interface PlanRouteStopInput {
  appointmentId: string;
  location: RoutePoint | null;     // property coordinate; null = none
  windowStartAt: Date; windowEndAt: Date;
  serviceMinutes: number;
}
export type PlanRouteMode =
  | { kind: 'OPTIMIZE' }
  | { kind: 'FIXED_ORDER'; order: string[] }
  | { kind: 'PRESERVE_ORDER'; order: string[] };   // prior manual order; new stops by insertion
export interface StoredRoutingMatrix {
  provider: RoutingProviderName; profile: MatrixProfile;
  points: Array<{ key: string; lat: number; lng: number }>; // key = 'origin' | appointmentId
  travelS: number[][];
}
export interface PlanRouteInput {
  origin: RoutePoint | null;
  stops: PlanRouteStopInput[];             // reorderable only
  earliestDepartureAt: Date | null;
  weights: RouteWeights;
  mode: PlanRouteMode;
  cachedMatrix?: StoredRoutingMatrix;      // reorder reuse (same stop set)
  interactive: boolean;                    // true: maxWaitMs 3000, deadline 12000; false: 60000/60000
  strict: boolean;                         // true (job attempts 1–2): limit/deadline/error → RoutingDeferredError
  now: Date;
}
export interface PlanRouteResult {
  method: OptimizerMethod;
  order: string[];
  optimizedOrder: string[] | null;
  departureAt: Date | null; finishAt: Date | null;
  stops: Array<{
    appointmentId: string; sequence: number;
    arrivalAt: Date; serviceStartAt: Date; serviceEndAt: Date;
    travelS: number; distanceM: number | null; waitS: number; lateS: number;
    approximate: boolean; missingCoordinates: boolean;
  }>;
  totals: { driveS: number; waitS: number; serviceS: number; lateS: number; distanceM: number | null };
  feasible: boolean; violations: Array<{ appointmentId: string; lateS: number }>;
  geometry: DayPlanGeometry | null;         // FeatureCollection<LineString> (TASK-F04-2 names the type)
  matrix: StoredRoutingMatrix | null;       // null when < 2 reorderable coordinate stops
  provider: RoutingProviderName;            // 'STUB' if any part used the stub
  matrixProfile: MatrixProfile | null;
  approximate: boolean;
  approximateReason: 'NO_PROVIDER' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'DEADLINE' | 'TOO_MANY_COORDINATES' | 'NO_ROUTE' | null;
  legs: Array<{ fromKey: string; toKey: string; travelS: number; approximate: boolean }>;
  usage: { matrixElements: number; directionsCalls: number };
}
```

`DayPlanGeometry` = `FeatureCollection` of `LineString` with `properties { fromSequence, toSequence, approximate }` (`fromSequence 0` = origin). This task defines the inline shape it returns; TASK-F04-2 owns the persisted/named type.
