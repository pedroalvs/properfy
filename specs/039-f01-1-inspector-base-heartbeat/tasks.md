# Tasks: Inspector geocoded base address, privacy, backfill and app-state heartbeat

**Feature**: `039-f01-1-inspector-base-heartbeat` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Scope**: backend + shared only (web = F01-2, PWA = F01-3). TDD mandatory (constitution §III): every test task is written red-first, before its implementation task.

**Paths** are repo-relative to the worktree root. `shared/` = `packages/shared/src`, `backend/` = `apps/backend/src`, `tests/` = `apps/backend/tests`.

## Phase 1: Setup

- [ ] T001 Confirm the worktree baseline is green (install, prisma generate, shared + frontend-standards build, shared/backend typecheck+lint) — already delegated; no code change.

## Phase 2: Foundational (blocks all user stories)

**Shared schemas (tests first)**

- [ ] T002 [P] Write `shared/schemas/inspector.test.ts` cases for `inspectorBaseAddressSchema`, create/update/self-update `address`, `inspectorAppStateSchema`, `listInspectorsQuerySchema.missingBaseAddress`, and the legacy-tolerant response per spec "Tests first" table (red).
- [ ] T003 Add `AU_STATES` and the derived `inspectorBaseAddressSchema` (+ type `InspectorBaseAddress`) to `shared/schemas/address.ts` (trim, AU state enum, 4-digit postcode, `country` literal `'AU'`, strip mode; messages per contract).
- [ ] T004 Wire the schema into `shared/schemas/inspector.ts`: `createInspectorSchema.address` required; `updateInspectorSchema.address` + `inspectorSelfUpdateSchema.address` optional non-nullable; add `inspectorAppStateSchema`; add `listInspectorsQuerySchema.missingBaseAddress` (boolean query coercion, not `z.coerce.boolean`).
- [ ] T005 Extend `inspectorResponseSchema` in `shared/schemas/responses.ts` with `baseLat`/`baseLng` (nullable number), `baseGeocodedAt`/`appInstalledAt`/`appLastSeenAt` (nullable instant), `pushEnabled` (nullable boolean), `appVersion` (nullable string), `baseGeocodeFailed` (boolean) — all `.optional()`; keep `address` as `z.unknown().optional()`. Export new symbols from `shared/src/index.ts` if the barrel doesn't already. Run `pnpm --filter @properfy/shared build`; T002 goes green.

**Migration + entity + repository**

- [ ] T006 Add the 7 nullable columns to `model Inspector` in `backend/../prisma/schema.prisma`; generate the expand-only migration `prisma/migrations/<ts>_inspector_base_coords_app_state/migration.sql` with `--create-only`, verify no `Unsupported()` index is dropped, apply locally, `prisma generate`.
- [ ] T007 Extend `backend/modules/inspector/domain/inspector.entity.ts` and `inspector.repository.ts`: entity base/adoption fields; `InspectorFilters.missingBaseAddress`; `update()` accepts base fields; declare `recordAppState({id, now, displayMode, pushEnabled, appVersion})`.
- [ ] T008 Implement the mapping in `backend/modules/inspector/infrastructure/prisma-inspector.repository.ts`: `Prisma.Decimal` ↔ `number`; base fields in create/update/read; write `Prisma.DbNull` instead of raw `null` into the `Json?` address column (keeps backfill selection correct).
- [ ] T009 Update entity fixtures in the ~8 `tests/unit/inspector/*` files that build `address: null` so they compile against the new entity shape (no behavior change yet).

**Shared domain building blocks (tests first)**

- [ ] T010 [P] Write `backend/modules/inspector/application/services/geocode-inspector-base.test.ts` (mode+text, success, no_results, error, timeout via `GeocodeTimeoutError`, `permanent_unavailable`; spy on `geocodeWithTimeout` with `{mode:'permanent', timeoutMs:4000}`) (red).
- [ ] T011 Implement `backend/modules/inspector/application/services/geocode-inspector-base.ts` using `formatGeocodingQuery` + `geocodeWithTimeout` (X02); never throws; returns `{lat,lng,geocodedAt}` or `{failed:...}`; `warn`/`error` logs per spec. T010 green.
- [ ] T012 [P] Create `backend/modules/inspector/domain/inspector-events.ts` with `INSPECTOR_EVENTS.BASE_CHANGED = 'inspector.base_changed'` and the payload type.
- [ ] T013 [P] Write `tests/unit/inspector/inspector-field-visibility.test.ts` (AM/OP keep all; INSP keeps base, loses adoption; CL_* lose base+adoption; other fields untouched) (red).
- [ ] T014 Implement `backend/modules/inspector/application/inspector-field-visibility.ts` (`applyInspectorFieldVisibility(dto, actor)`). T013 green.

**Checkpoint**: shared contract + data layer + geocode service + event + visibility helper exist and are unit-tested. User stories can now proceed.

## Phase 3: User Story 1 — Every inspector has a geocoded base address (P1)

**Goal**: mandatory, permanently-geocoded, changeable-but-not-removable base address on create / OP update / self-update, with atomic coord writes and `base_changed`.

**Independent test**: `POST /v1/inspectors` without address → 400; with address + fake geocoder → 201 coords; `PATCH :id {address:null}` → 400; new address → 200 new coords.

- [ ] T015 [US1] Write `tests/unit/inspector/create-inspector.use-case.test.ts` cases (geocode ok/failed; client lat ignored; audit without lat/lng; order via `invocationCallOrder`; email-conflict skips geocode; `base_changed` once incl. throwing bus → still 201; CL_ADMIN forbidden) (red).
- [ ] T016 [US1] Implement geocode + order (L-F01-11) + audit (L-F01-10) + `base_changed` in `backend/modules/inspector/application/use-cases/create-inspector.use-case.ts`; add `IGeocodingService` and the event bus as **optional last** constructor args; remove `(input as any).address`. T015 green.
- [ ] T017 [US1] Write `tests/unit/inspector/update-inspector.use-case.test.ts` cases (new coords; failure clears coords; address absent → no base keys; same address via `isSameGeocodingAddress` → no geocode/no event; trim/case same → no geocode; legacy current → geocode; geocode before single `update`; audit without lat/lng; `base_changed`) (red).
- [ ] T018 [US1] Implement `backend/modules/inspector/application/use-cases/update-inspector.use-case.ts` (same-address short-circuit with `isSameGeocodingAddress` over parsed sides; geocode before `update`; event). T017 green.
- [ ] T019 [US1] Write `tests/unit/inspector/update-inspector-self-profile.use-case.test.ts` cases (base change → coords + audit + event; other inspectorId → `AUTH_FORBIDDEN`; failure → `baseGeocodeFailed`; phone-only → base untouched) (red), then implement in `update-inspector-self-profile.use-case.ts`. Green.
- [ ] T020 [US1] Wire the geocoder (and event bus) into the three inspector use cases in `backend/main/container.ts`; pass `address` through `PATCH /v1/inspectors/me` and drop the `data` cast in `backend/modules/inspector/interfaces/inspector.routes.ts`.
- [ ] T021 [US1] Write `tests/integration/inspector/inspector-profile-crud.test.ts` (no address → 400; address+fake geocoder → 201 numeric `baseLat`, `baseGeocodeFailed:false`; `address.latitude:1` → geocoder coord wins; `{address:null}` → 400; new base → 200 new coords) and update the **5 other** `POST /v1/inspectors` callers to a shared fixture helper with a valid `address`. Green.

**Checkpoint**: base-address lifecycle works end-to-end through the inspector endpoints.

## Phase 4: User Story 2 — App-state heartbeat (P2)

**Goal**: INSP-only `POST /me/app-state` records install/last-seen/push/version in one SQL statement; per-user rate limit.

**Independent test**: heartbeat → 204; OP read shows adoption fields; OP actor → 403; soft-deleted → 404; 11/min same user → 429; two users one IP → no 429.

- [ ] T022 [P] [US2] Write `tests/unit/inspector/record-inspector-app-state.use-case.test.ts` (first/second standalone, browser, unsupported, OP → `INSP_ONLY`, affected 0 → `InspectorNotFoundError`, single `recordAppState` call, no `findById`) (red).
- [ ] T023 [US2] Implement `backend/modules/inspector/application/use-cases/record-inspector-app-state.use-case.ts`. Green (unit).
- [ ] T024 [US2] Implement `recordAppState()` in `prisma-inspector.repository.ts` as a single `$executeRaw` (CASE + COALESCE, explicit casts, `deleted_at IS NULL`); affected count returned.
- [ ] T025 [US2] Add `POST /v1/inspectors/me/app-state` to `inspector.routes.ts` (INSP-only, 204) and the per-user `config.rateLimit` (`keyGenerator` userId→IP, `hook:'preHandler'`, 10/min) on **both** it and `PATCH /me`; wire the use case in `container.ts`. Verify static-route precedence over `/:inspectorId`.
- [ ] T026 [US2] Write `tests/integration/inspector/inspector-self.test.ts` (PATCH /me address → 200 + GET /me shows address/baseLat; app-state → 204 + OP GET shows `appLastSeenAt`; invalid → 400; OP → 403; 11/min user → 429; two inspectors one IP → no 429; PATCH /me 11/min → 429 + other inspector 200; `address.state:'New South Wales'` → 400 at `address.state`; and a regression assertion that `GET /v1/me` is unchanged — no base/adoption field leaks through `meResponseSchema`, FR-014). Green.

## Phase 5: User Story 3 — Base address and location stay private (P2)

**Goal**: CL_* never see `address`/coords/adoption in list, detail or write responses; AM/OP and INSP keep visibility; `missingBaseAddress` filter.

**Independent test**: CL_ADMIN list/detail carry no base/adoption key (regression test fails if one does); OP sees all; filter works.

- [ ] T027 [US3] Write `tests/unit/inspector/get-inspector.use-case.test.ts` and `list-inspectors.use-case.test.ts` cases (OP gets adoption+coords; CL loses address/coords/adoption; CL `missingBaseAddress` ignored; INSP list branch includes address/coords, no adoption; AM/OP list branch now includes `address` incl. legacy `{foo:1}`; filter passed to repo) (red).
- [ ] T028 [US3] Apply `applyInspectorFieldVisibility` and the `missingBaseAddress` filter in `get-inspector.use-case.ts` and `list-inspectors.use-case.ts` (INSP branch + AM/OP branch now returning `address`, L-F01-07); pass `missingBaseAddress` through `inspector.routes.ts`. Green (unit).
- [ ] T029 [US3] Write `tests/integration/inspector/inspector.routes.test.ts` (`?missingBaseAddress=true` OP → only null `base_lat`, each item has `address`; CL_ADMIN list + detail → no address/coords/adoption; app-state not matched by `:inspectorId`) and `tests/integration/rbac/inspector-rbac.test.ts` matrix (AM/OP/CL_ADMIN/CL_USER/INSP × create/update/self-update/app-state/list/get, valid bodies). Include the scoping test (CL_*/INSP cannot read another inspector's base/coords/adoption). Green.

## Phase 6: User Story 4 — One-off backfill (P3)

**Goal**: idempotent, throttled, permanent-mode backfill of existing addresses; dry-run offline; apply guarded + CAS + audit + event + cost estimate.

**Independent test**: dry-run reports without geocoder calls; apply writes via CAS, audits without coords, aborts on unconfigured/permission-less account.

- [ ] T030 [US4] Write `backend/scripts/backfill-inspector-base-coords.test.ts` (fake prisma+geocoder, `backfill-property-branch.test.ts` pattern): dry-run no writes/no geocoder + `estimatedRequests`; apply `estimatedRequests`; dry-run with stub runs; selection excludes `DbNull`/`JsonNull`; legacy `'New South Wales'` → incompatible with `['state']`; apply audit without lat/lng + event; apply writes coords without rewriting address; incompatible `{foo:1}` listed untouched; `null` → notFound; error/timeout → failed + continue; `MapboxPermanentGeocodingUnavailableError` → abort non-zero; apply with stub aborts before read; `--delay-ms` (fake timers); second run skips geocoded; CAS count 0 → skippedConcurrent (red).
- [ ] T031 [US4] Implement `backend/scripts/backfill-inspector-base-coords.ts` (selection, dry-run offline, apply geocode via `geocodeInspectorBase`, throttle, CAS `updateMany`, `inspector.base_geocoded` SYSTEM audit without coords, `base_changed`, abort rules, JSON+readable report with `estimatedRequests`/cost). Green.

## Phase 7: DB integration suite (testcontainers)

- [ ] T032 Write `tests/integration/db/inspector-base-coords.integration.test.ts` (migration applies; `Decimal(10,7)` round-trip; CAS not overwriting a geocoded row; `recordAppState` concurrency — two parallel standalone T1/T2 → install is exactly one, third standalone T3 unchanged, then browser keeps it, soft-deleted → affected 0, sequential T1-then-T2 → install=T1; backfill selection excludes `'null'::jsonb` and SQL NULL). Run `pnpm --filter backend test:integration:db` (serial). Green.

## Phase 8: Polish & cross-cutting

- [ ] T033 Regenerate the contract: `pnpm --filter backend generate:openapi` → `pnpm --filter @properfy/shared generate:types` → `pnpm --filter @properfy/shared build`; commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts` (never hand-edited).
- [ ] T034 [P] Update `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` for the new inspector routes, the 7 columns, `inspector.base_changed`, the per-user rate-limit pattern and the CL privacy rule (root §13.11).
- [ ] T035 Full gates via a subagent (condensed pass/fail): shared lint+typecheck+test; backend lint+typecheck; backend `test` (unit+integration); backend `test:integration:db`. Confirm PR ≤ 150 files (`git diff --stat origin/develop... | tail -1`).

## Dependencies & order

- Phase 2 (T002–T014) blocks everything.
- US1 (T015–T021) → depends on T003–T014. US2 (T022–T026) → depends on T007/T008 (+T024). US3 (T027–T029) → depends on T014 + US1 reads. US4 (T030–T031) → depends on T011/T012/T008.
- US2, US3, US4 are mutually independent once Phase 2 is done and can be built in any order; US1 is the P1 MVP.
- T032 (db) after T008/T024/T031. T033–T035 last.

## Parallel opportunities

- T002, T010, T012, T013 (different files, tests) can be written in parallel at the start of their phases.
- T034 [P] runs alongside T033/T035 prep (different files).

## MVP

User Story 1 (T001–T021) is the minimum shippable increment: an inspector always has a mandatory, permanently-geocoded, non-removable base address (criterion 00.A5 partial). Heartbeat, privacy and backfill layer on independently.
