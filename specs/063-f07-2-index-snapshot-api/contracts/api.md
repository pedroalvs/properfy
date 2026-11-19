# API Contract: Reliability Index (AM/OP)

All routes: `preHandler: authenticate`, RBAC action `reliability.view` (`['AM','OP']`) asserted **before any repository read**. Prefix `/v1`. Response schemas in `packages/shared/src/schemas/reliability.ts`; Fastify response serialization strips undeclared keys (every returned field must be in the Zod schema).

## `GET /v1/dashboard/inspector-performance`

Current reliability ranking from the latest snapshot.

- **Request**: none.
- **200**: `success(ReliabilityRankingResponse)`.
- **Errors**: `401 UNAUTHENTICATED` (no token); `403 FORBIDDEN` (CL_ADMIN/CL_USER/INSP — audited `authorization.denied`, no read).

```ts
reliabilityRankingResponseSchema = z.object({
  snapshotDate: civilDateSchema.nullable(),
  windowFrom: civilDateSchema.nullable(),
  windowTo: civilDateSchema.nullable(),
  computedAt: instantStr().nullable(),
  isStale: z.boolean(),                                   // L-F07-02: snapshotDate < today (Sydney)
  settingsUpdatedAt: instantStr().nullable(),             // L-F07-10: updated_at of reliabilityIndex
  minimumVolume: z.number().int().positive(),
  volumeReference: z.number().positive().nullable(),      // null when no snapshot
  volumeReferenceSource: z.enum(['MEDIAN', 'OVERRIDE']).nullable(),
  ranked: z.array(z.object({
    position: z.number().int().positive(),
    inspectorId: z.string().uuid(),
    inspectorName: z.string(),
    score: z.number().min(0).max(100),
    volume: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
  })),
  notEnoughData: z.array(z.object({
    inspectorId: z.string().uuid(),
    inspectorName: z.string(),
    volume: z.number().int().nonnegative(),
    status: z.enum(['INSUFFICIENT_VOLUME', 'NO_WEIGHTED_DATA']),
  })),
});
```

- `ranked`: competition ranking ("1, 2, 2, 4" on ties, ties by name) over all `ACTIVE` + `SCORED` rows (platform-wide, R2).
- `notEnoughData`: `INSUFFICIENT_VOLUME`/`NO_WEIGHTED_DATA`, ordered by volume desc then name; an `ACTIVE` inspector with no row appears here with `volume 0`, `INSUFFICIENT_VOLUME`.
- No snapshot yet → all nullable fields `null`, `isStale false`, `minimumVolume` from the current setting, empty arrays.

## `GET /v1/dashboard/inspector-performance/:inspectorId`

One inspector's detail from the latest snapshot.

- **Request**: `params: { inspectorId: uuid }` (`inspectorReliabilityParamsSchema`).
- **200**: `success(InspectorReliabilityResponse)`.
- **Errors**: `400 VALIDATION_ERROR` (non-uuid — note: Fastify validates before auth, so a CL token on a bad id gets 400 not 403; accepted, no leak); `401`; `403 FORBIDDEN`; `404 INSPECTOR_NOT_FOUND` "Inspector not found" (unknown or soft-deleted).

```ts
inspectorReliabilityResponseSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  inspectorStatus: z.enum(['ACTIVE', 'INACTIVE']),
  status: z.enum(['SCORED', 'INSUFFICIENT_VOLUME', 'NO_WEIGHTED_DATA', 'NOT_COMPUTED']),
  snapshotDate: civilDateSchema.nullable(),
  windowFrom: civilDateSchema.nullable(),
  windowTo: civilDateSchema.nullable(),
  computedAt: instantStr().nullable(),
  isStale: z.boolean(),
  settingsUpdatedAt: instantStr().nullable(),
  score: z.number().min(0).max(100).nullable(),
  position: z.number().int().positive().nullable(),
  rankedCount: z.number().int().nonnegative(),
  volume: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  minimumVolume: z.number().int().positive(),
  minimumRatings: z.number().int().positive(),            // L-F07-03: from settings_json (current when NOT_COMPUTED)
  volumeReference: z.number().positive().nullable(),      // null only in NOT_COMPUTED
  volumeReferenceSource: z.enum(['MEDIAN', 'OVERRIDE']).nullable(),
  metrics: z.array(reliabilityMetricResultSchema.extend({ weight: z.number().int().min(0).max(10) })),
});
inspectorReliabilityParamsSchema = z.object({ inspectorId: z.string().uuid() });
```

- `metrics`: 8 entries in canonical order, each with its `weight` from `settings_json` (the weights that produced the stored score), carrying `failures` (≤ 20) and `failureCount` from `metrics_json`.
- `NOT_COMPUTED` (inspector has no row in the latest snapshot): `score null`, `position null`, `metrics []`, `volume 0`, `volumeReference null`, `snapshotDate` = latest date, `minimumVolume`/`minimumRatings` from the current setting.
- `INACTIVE` inspector with a row: returned with `position null`.

## Privacy contract (both routes)

The serialized body (recursively scanned) contains no `latitude`/`longitude`/`lat`/`lng`/`email`/`phone` key at any level; no metric has more than `RELIABILITY_FAILURES_MAX (20)` failures; every `detail` is ≤ 80 chars and matches neither a coordinate pattern (`/-?\d{1,3}\.\d{4,}/`) nor the seed property's address.

## Role matrix (append)

```ts
ROLE_ACTION_MATRIX['reliability.view'] = { roles: ['AM', 'OP'] };
```

| Role | Ranking | Detail |
|---|---|---|
| AM | 200 | 200 |
| OP | 200 | 200 |
| CL_ADMIN / CL_USER | 403 | 403 |
| INSP | 403 | 403 |
| TNT / no token | 401 | 401 |
