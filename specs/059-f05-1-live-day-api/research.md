# Phase 0 Research: Live Day Dashboard API (F05-1)

No `NEEDS CLARIFICATION` remained after the spec: the source task closed every decision (D1–D21, L-F05-01..14). This file records the technical decisions and their rationale for traceability.

## D-R1: Reuse F04/F06/F03 functions by fixed path, never copy

- **Decision**: Import `classifyStops` and `computeDayPlanFingerprint` from `apps/backend/src/modules/day-plan/domain/`, the T-1 visibility predicate from the F04 `T1VisibilityService`, `projectStopEta` + types from `packages/shared/src/route-planning/`, and `computeEstimatedArrivalAt` from `apps/backend/src/modules/inspector-execution/domain/late-notice.ts`. Read `PlatformSetting` through the F03 `IPlatformSettingsReader.get` (30 s cache).
- **Rationale**: Single source of truth. If an F04 signature changes on merge, the F05 typecheck/tests break (loud) instead of the rule silently diverging and producing false STALE. The fingerprint and T-1 filter must match F04 exactly or STALE is wrong.
- **Alternatives considered**: Reimplementing the fingerprint/classification/projection in `live-day` — rejected: duplicated rules drift. A local copy of the 30 s settings cache — rejected: the F03 reader already caches.
- **Risk mitigation**: If `T1VisibilityService` is not pure, extract the pure predicate it uses in this PR without changing F04 behaviour (Riscos §).

## D-R2: One aggregated SQL query per endpoint; everything else in memory

- **Decision**: Two `$queryRaw` statements (live-day §1, locked-time §7) returning JSON-aggregated stops/events/reminders per inspector; all derivation (T-1 filter, classification, fingerprint, projection, state, alerts, straight-line route build) runs in memory in the use case.
- **Rationale**: Contract 01 needs a 30 s poll across the whole roster; N+1 or per-inspector calls to the F04 endpoints would blow the F04 rate limits (120/min, 20/min per user) and the latency budget. The `GET /v1/day-plans/:inspectorId/:date` endpoint serves one inspector per call, so F05 keeps its own read model over the same tables with the same semantics.
- **Alternatives considered**: Calling the F04 AM/OP folha/endpoint per inspector — rejected (rate limits, N round-trips). A materialized view — rejected (staleness, over-engineering for a 30 s read).

## D-R3: Geometry on demand (`includeGeometry`) — always an in-memory straight-line route (F04 Plan B)

- **Decision**: The 30 s poll defaults to `includeGeometry=none`. `selected` returns one inspector's route, `all` returns all (roster cap 60 → 400 `LIVE_DAY_TOO_MANY_ROUTES`). **F04 Plan B (PRs #072/#073/#074) persists no route geometry and dropped `route_geometry`**, so there is nothing to select or simplify: the SQL is identical in all three modes (it always returns stop + origin coordinates, used for pins), and the route — when requested — is a straight-line `LineString` (origin → coordinate-bearing stops in display order) built in memory, `routeApproximate` always true. No `CASE WHEN`, no `simplifyRouteGeometry`, no `dayPlanId:version` cache.
- **Rationale**: The zero-Mapbox invariant (FR-011/SC-003) forbids a Directions call on this hot read, and F04 no longer stores a road route, so the only route this screen can show without Mapbox is the straight-line sequence. Straight-line routes are tiny (origin + ~6 vertices per inspector), so `all` stays well under the body budget without any simplification pass. The real road route lives on F04's inspector/PWA on-demand path, not here.
- **Alternatives considered**: On-demand Directions recompute for `selected` — rejected (violates the zero-Mapbox invariant repeated in FR-011/SC-003/D13; unbounded for `all`). Reading a stored column — impossible (dropped by #074).

## D-R4: Per-user rate limit evaluated after authentication

- **Decision**: Each route sets `config.rateLimit.keyGenerator = (req) => req.user?.id ?? req.ip`, evaluated after the auth middleware (per-route `preHandler` hook, or — if the installed `@fastify/rate-limit` cannot hook per route — the `fy.routes.ts` pattern: key = sha256 of the `Authorization` header, never the raw token, fallback `req.ip`). The global 200/min-per-IP limiter still applies.
- **Rationale**: An office behind NAT runs many tabs from one IP; a per-IP-only limit would throttle legitimate operators. `req.user` only exists post-auth, so the keyGenerator must run after it (a keyGenerator reading `req.user` in `onRequest` silently falls back to IP — test 24 with two users on the same IP catches this).
- **Alternatives considered**: Per-IP only — rejected (NAT). No route limit — rejected (poll abuse / old clients).

## D-R5: STALE by in-memory fingerprint (D17)

- **Decision**: Recompute the F04 content fingerprint in memory from the single query's rows (configured origin — override → base → none, never `LAST_STOP`; `execState` per D18; over the T-1 visible rows) and compare to the stored `input_fingerprint`. Divergence (or stored status `STALE`) → `planStatus 'STALE'`, `routeOutOfDate true`. Nothing is written; no recompute; no Mapbox.
- **Rationale**: Edits that emit no event (`update-appointment`, bulk, property coordinate) must still surface as STALE, matching the F04 AM/OP read contract. sha256 of ~30 plans per poll is < 1 ms each — no cache needed (and with F04 Plan B there is no longer any geometry to cache either).
- **Alternatives considered**: Trusting the stored `day_plans.status` only — rejected (misses event-less edits). Recomputing the plan — rejected (forbidden: Mapbox on read).

## D-R6: Inspector route colour palette in shared

- **Decision**: `INSPECTOR_ROUTE_PALETTE` (12 dark tones, reordered per L-F05-12), FNV-1a 32-bit hash of `inspectorId` → index, `inspectorRouteColor` returning `{ mapbox, hex, index }`. `mapbox` uses comma-form HSL (`hsl(45, 90%, 26%)`) for Mapbox paint; `hex` for CSS.
- **Rationale**: The web (TASK-F05-2) consumes it and the contrast test is pure, so it belongs in shared. Comma-form HSL avoids the `hsl(a b c)` space-form Mapbox bug (#1302). Stable hash keeps a colour consistent across sessions/deploys. Each tone has contrast ≥ 4.5:1 vs `#FFFFFF` and `#F2EFE9`.
- **Alternatives considered**: Space-form HSL — rejected (#1302). Random per-session colour — rejected (unstable, untestable).

## D-R7: `$queryRaw` typing hazards

- **Decision**: Cast `count(*)` with `::int`, convert `Decimal` (comes as string) to number, and map `json_agg` `snake_case` keys in the repository. Pass `::date`/`::text`/`::text[]` parameters explicitly. Review the `migrate dev` SQL so it does not drop the `service_regions` GIST `Unsupported()` index.
- **Rationale**: Documented Prisma `$queryRaw` lessons (`bigint` from `count`, `Decimal` as string, Unsupported-index drop on drift).
- **Alternatives considered**: Prisma query builder — rejected (cannot express the single aggregate with `json_agg`, `ST_Intersects`, and the roster UNION in one query).
