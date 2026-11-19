# Contract — `POST /v1/inspector/day-plans/:date/order/preview`

**Actor**: `INSP` (own `inspectorId` only). **Auth**: inspector JWT. **Persists**: nothing.
**Rate limit**: 30 requests / minute / inspector (application-level, standard Fastify rate-limit error envelope). Mapbox provider calls additionally governed by the shared Postgres token-bucket limiter.

## Purpose

Server-side evaluation of a candidate stop order, recomputing the Mapbox Matrix **on demand** (no stored matrix). Returns per-stop ETAs and totals so the PWA (from PR-B) can preview a reorder without the raw matrix. `etaSource` is always `'MATRIX'` (L-F04-03 Plan B variant).

## Path params

- `date` — civil date (`YYYY-MM-DD`) in the inspector's timezone.

## Request body — `previewDayPlanOrderRequestSchema`

Mirrors `saveDayPlanOrderRequestSchema` so the PWA reuses the same payload:

```ts
{
  appointmentIds: string[]  // uuid[], 1..DAY_PLAN_MAX_STOPS_PER_ORDER, unique — the candidate order
  basedOnVersion: number    // int ≥ 1 — the plan version the candidate is based on (drift detection)
}
```

## Response 200 — `previewDayPlanOrderResponseSchema`

```ts
{
  etaSource: 'MATRIX'
  approximate: boolean
  approximateReason: 'NO_PROVIDER'|'RATE_LIMITED'|'PROVIDER_ERROR'|'DEADLINE'|'TOO_MANY_COORDINATES'|'NO_ROUTE' | null
  departureAt: string | null   // instant ISO
  finishEta: string | null     // instant ISO
  totals: { driveS: int, waitS: int, serviceS: int, lateS: int, distanceM: int | null }
  feasible: boolean
  violations: { appointmentId: string, lateS: int }[]
  stops: {
    appointmentId: string, sequence: int, eta: string | null,
    travelS: int, waitS: int, lateS: int
  }[]   // in the candidate order
}
```

## Errors

- `400` — invalid body (non-uuid, duplicate ids, > max stops), or the candidate set does not match the plan's reorderable stops.
- `404` — no day plan for `:date` for the caller.
- `409` — `DAY_PLAN_VERSION_CONFLICT` (basedOnVersion ≠ current) **or** nothing to reorder (< 2 reorderable stops).
- `422` — `DAY_PLAN_ALREADY_STARTED` (first check-in done; L-F04-07) — reorder/preview blocked.
- `429` — rate limit exceeded (30/min).

## Non-persistence guarantee

The use case computes entirely in memory (Matrix on demand + `evaluateSequence`) and returns the result; it issues **no** write. An integration test asserts the `day_plans`/`day_plan_stops` rows are byte-for-byte unchanged after a preview call.

## Degradation

When the Mapbox bucket is drained or the provider defers on an interactive call, the evaluation falls back to the stub (haversine) with `approximate: true` and the matching `approximateReason`, returning `200` rather than failing — consistent with on-demand GET behaviour (D6).
