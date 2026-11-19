# Phase 0 Research — F01-1 Inspector base address, privacy, backfill, heartbeat

All unknowns resolve against the merged X02-1 contract and the pre-decided TASK-F01-1 decisions (D1–D19, L-F01-01…12). No `NEEDS CLARIFICATION` remains.

## R1 — Reuse the X02 geocoding contract (do not rebuild)

- **Decision**: Use `IGeocodingService.geocode(address, {mode})` (default `'permanent'`), `geocodeWithTimeout(service, text, {mode:'permanent', timeoutMs: GEOCODE_SYNC_TIMEOUT_MS})`, and `formatGeocodingQuery` / `isSameGeocodingAddress` / `GeocodableAddress` — all shipped by X02-1 and verified present on `origin/develop@61d7b71b` (`apps/backend/src/shared/domain/geocoding-address.ts`, `apps/backend/src/modules/property/application/services/geocode-with-timeout.ts`).
- **Rationale**: Branch and inspector base are the same geocoding problem; a second formatter or a hand-rolled timeout would drift from the branch behavior and the Mapbox terms (permanent-only persistence). `geocodeWithTimeout` already swallows the late settlement of a lost race, so the inspector service needs no `Promise.race`.
- **Alternatives rejected**: Moving the port to `shared/domain` (floated in the F01 feature doc) — rejected by D4 to keep the diff minimal; the cross-module import of a domain port is allowed by Clean Architecture.

## R2 — Derived AU address schema (not an alias, not `.omit`)

- **Decision**: `inspectorBaseAddressSchema = branchAddressSchema.extend({ street/number/complement/suburb/city trimmed, state ∈ AU_STATES (trim+upper), postcode /^\d{4}$/, country literal 'AU' default 'AU' })`; export `AU_STATES`.
- **Rationale**: Post-X02 `branchAddressSchema` has no lat/lng, so there is nothing to `.omit`; Zod strip drops any client `latitude/longitude`. The derivation adds trim + AU rules (L-F01-01/D15) and closes the `{street:' '}` hole. "Same address" is `isSameGeocodingAddress` over both parsed sides (D18), not a field-by-field comparator.
- **Alternatives rejected**: Aliasing `branchAddressSchema` (no trim/AU rules); a bespoke equality function (D18 forbids it).

## R3 — Non-removable base: `.optional()` without `.nullable()`

- **Decision**: `createInspectorSchema.address` required; update/self-update `address` `.optional()` only. `address:null` → 400.
- **Rationale**: The type system enforces "changeable but not removable" at the boundary; no runtime guard needed. This is why `address:null` is a validation error, not a use-case rejection.

## R4 — Heartbeat in a single SQL statement

- **Decision**: `recordAppState()` uses `prisma.$executeRaw` with `CASE WHEN displayMode='standalone' THEN COALESCE(app_installed_at, now) ELSE app_installed_at END`, explicit casts, `WHERE id = … AND deleted_at IS NULL`; `affected === 0` → `InspectorNotFoundError` (L-F01-02).
- **Rationale**: COALESCE references a column, which `updateMany({data})` cannot express; a read-then-write would race on concurrent standalone heartbeats. A single statement makes "first standalone wins, never overwritten" atomic (proven in the db suite). Casts are explicit because `Inspector.id` is a `text` column (uuid default, no `@db.Uuid`) — consistent with the `$queryRaw ::int` memory.
- **Alternatives rejected**: `updateMany` + app-side COALESCE (two reads/writes, racy); per-device table (D16 — last-write-wins, no table).

## R5 — Per-user rate limit after authenticate

- **Decision**: Both `POST /me/app-state` and `PATCH /me` set `config.rateLimit = { max:10, timeWindow:'1 minute', hook:'preHandler', keyGenerator: (req) => req.authContext?.userId ?? req.ip }`.
- **Rationale**: The global `@fastify/rate-limit` is per IP; several inspectors share an office IP, so the key must be the user. `authenticate` is a `preHandler`; the limit must run after it (hook `preHandler`) to see `authContext`, else the key silently falls back to IP. A "two users, one IP" test guards the ordering.
- **Alternatives rejected**: Global IP limit (false 429s for colocated inspectors).

## R6 — Privacy via a visibility helper

- **Decision**: `applyInspectorFieldVisibility(dto, actor)` strips `address/baseLat/baseLng/baseGeocodedAt` and all adoption fields for CL_ADMIN/CL_USER, strips only adoption for INSP, keeps all for AM/OP. Applied in get, list and write responses.
- **Rationale**: Centralizes the D7 rule in one tested helper instead of scattering conditionals. Removing `address` from CL responses is a deliberate behavior change; a regression test fails if a CL response carries a coordinate/`address` key.

## R7 — Backfill: dry-run offline, apply guarded

- **Decision**: Selection `deleted_at IS NULL AND base_lat IS NULL AND address ∉ {DbNull, JsonNull}`; dry-run makes no Mapbox call and needs no config; apply geocodes with `--delay-ms` throttle, writes via CAS `updateMany({where:{id, base_lat:null}})`, audits `inspector.base_geocoded` (SYSTEM, no lat/lng), emits `base_changed`, aborts on unconfigured account before reading rows, aborts the run on `MapboxPermanentGeocodingUnavailableError`. Report always carries `estimatedRequests`; cost `estimatedRequests × US$0.005`, > US$200 needs dev sign-off (D19/L-X02-05, L-F01-05).
- **Rationale**: Idempotent + safe against concurrent saves; dry-run usable in dev without Mapbox; cost/account proof required before paid permanent calls in prod. Follows the `backfill-property-branch.ts` precedent.

## R8 — `base_changed` event, no subscriber

- **Decision**: `INSPECTOR_EVENTS.BASE_CHANGED` emitted by create/update/self-update/backfill after the write, only when the base was stored/changed, via the existing domain event bus as an **optional last constructor arg**; a throwing subscriber does not fail the response. Changing the base does not touch any `DayPlan` (F04 owns that).
- **Rationale**: Mirrors the `INSPECTOR_FIELD_EVENTS.RECORDED` (F03) pattern; the optional-last-arg keeps untyped test wirings compiling (memory: "adding a use-case dep breaks untyped test wirings").

## R9 — `/v1/me` and `/me` response schemas

- **Decision**: Do **not** change `/v1/me` (uses `meResponseSchema`, which strips undeclared fields). `GET /v1/inspectors/me` returns `{data}` + `address/baseLat/baseLng/baseGeocodedAt`; `PATCH /v1/inspectors/me` returns `{data:{inspectorId, baseGeocodeFailed?}}` and stays without a strict response schema (per TASK-F01-1 contract table + Riscos), so no field the PWA reads is accidentally stripped.
- **Rationale**: `meResponseSchema` and Fastify response schemas drop undeclared keys (memory: "response schema strips undeclared fields"); adding a strict schema to `/me` would risk breaking PWA reads. The base fields surface through the inspector endpoints, not `/v1/me`.
