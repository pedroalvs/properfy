# Tasks: Platform settings registry, GPS precision and configurable geofence

**Feature**: 038-f03-1-platform-settings-geofence | **Branch**: `038-f03-1-platform-settings-geofence`
**Input**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md
**Approach**: TDD (constitution III + role mandate). Test tasks precede implementation in every phase.

Paths are relative to repo root (`apps/backend`, `packages/shared`). `[P]` = parallelizable (distinct files, no incomplete dependency).

---

## Phase 1: Setup

- [ ] T001 Confirm worktree baseline is green (shared+backend typecheck/lint already PASS via setup agent); create empty module dir `apps/backend/src/modules/platform-settings/{domain,application/use-cases,infrastructure,interfaces}`.

## Phase 2: Foundational (blocking prerequisites for all stories)

### Shared contracts

- [ ] T002 [P] Add `GeofenceMode` const + type in `packages/shared/src/enums/field-events.ts` (new file; F03-2 will append event enums); export from `packages/shared/src/enums/index.ts`.
- [ ] T003 Write shared schema module `packages/shared/src/schemas/platform-settings.ts`: `fieldEventsSettingSchema`, `PLATFORM_SETTINGS_REGISTRY` (with `section` docblock per L-F06-10), `PlatformSettingKey`, `PlatformSettingValue<K>`, `isPlatformSettingKey`, `resolvePlatformSettingValue`, `updatePlatformSettingSchema`, `platformSettingResponseSchema`, `platformSettingsListResponseSchema`; export from `schemas/index.ts`.
- [ ] T004 [P] Extend `startInspectionSchema` and `finishInspectionSchema` in `packages/shared/src/schemas/inspection-execution.ts` with optional `accuracy` and `clientOccurredAt` (`clientGeoExtras`).
- [ ] T005 [P] Extend `startInspectionResponseSchema`, `finishInspectionResponseSchema` and the `execution`/`geofence` of `inspectorAppointmentDetailResponseSchema` in `packages/shared/src/schemas/responses.ts` with the new fields, all `.optional()`.

### Persistence

- [ ] T006 Add `PlatformSetting` model (no `tenant_id`) + `User` inverse relation `platform_settings_updated` in `apps/backend/prisma/schema.prisma`; add the 9 new `InspectionExecution` columns + two indexes `(out_of_radius, started_at)` and `(out_of_window, started_at)`.
- [ ] T007 Create the expand-only migration (`prisma migrate dev --name platform_settings_and_execution_geo`, timestamp regenerated) and run `prisma generate`; verify the drift check does not drop `Unsupported()` indexes.

### Cross-module ports & plumbing

- [ ] T008 [P] Add the shared read port `IPlatformSettingsReader { get<K>(key): Promise<PlatformSettingValue<K>> }` in `apps/backend/src/shared/domain/platform-settings.ts`.
- [ ] T009 [P] Add `PLATFORM_SETTING_EVENTS = { UPDATED: 'platform_setting.updated.v1' }` and its payload type in `apps/backend/src/shared/application/events/domain-event-bus.ts`.
- [ ] T010 [P] Add `GeofenceOutOfRadiusError` (422 `GEOFENCE_OUT_OF_RADIUS`, message ending "If you are at the right address, contact operations.") in `apps/backend/src/modules/inspector-execution/domain/inspection-execution.errors.ts`.
- [ ] T011 Remove `GEOLOCATION_MISMATCH_THRESHOLD_METERS` from `apps/backend/src/modules/inspector-execution/domain/geolocation-distance.service.ts` and fix every importer/test (`grep -rn GEOLOCATION_MISMATCH_THRESHOLD_METERS apps/backend`).
- [ ] T012 Extend `InspectionExecution` entity + repository port (`update()` accepts `finishAccuracyMeters`, `finishClientAt`, `finishGeolocationDistanceMeters`, `finishOutOfRadius`; create accepts the new start fields) in `apps/backend/src/modules/inspector-execution/domain/{inspection-execution.entity.ts,inspection-execution.repository.ts}` and the Prisma impl `infrastructure/prisma-inspection-execution.repository.ts`.
- [ ] T013 Build the shared package so backend/web/pwa resolve the new contracts (`pnpm --filter @properfy/shared build`).

---

## Phase 3: User Story 1 — Operators configure platform-wide field settings (P1)

**Goal**: audited AM/OP-only platform-settings registry + endpoints + cached reader + event + save hooks.
**Independent test**: `GET`/`PUT /v1/platform-settings` round-trips for AM/OP, audits with `tenant_id NULL`, emits the event, rejects other roles; defaults when no row.

### Tests (write first, must fail)

- [ ] T014 [P] [US1] `packages/shared/src/schemas/platform-settings.test.ts` — registry defaults, field bounds, `resolvePlatformSettingValue` (valid/invalid/merge), `isPlatformSettingKey`.
- [ ] T015 [P] [US1] `apps/backend/src/modules/platform-settings/application/platform-settings.service.test.ts` — defaults when no row, 30 s TTL (1 read within window, 2 after), `invalidate` forces re-read, invalid stored value → defaults + single `logger.error`.
- [ ] T016 [P] [US1] `apps/backend/src/modules/platform-settings/application/use-cases/update-platform-setting.use-case.test.ts` — RBAC (AM/OP ok; CL_ADMIN/CL_USER/INSP forbidden, no write), unknown key 404, invalid value 400, success upsert+audit(`tenantId null`, before/after, `actor_tenant_id`), same-value still writes, event emitted once after upsert, throwing subscriber → still 200 + `logger.error`, failed upsert → no event, save-hook cases (hook transforms stored/audited/emitted value; invalid value skips hook; throwing hook writes nothing).
- [ ] T017 [P] [US1] `apps/backend/tests/integration/db/platform-settings.integration.test.ts` — GET list defaults (`isDefault true`), PUT valid (row + audit `tenant_id NULL`), GET returns new value + `updatedBy`, **scoping test (spec premise): `GET /v1/platform-settings` and `GET /v1/platform-settings/:key` and `PUT :key` all return 403 for CL_ADMIN and INSP (and no token → 401)**, invalid value 400, unknown key 404, event subscriber receives payload on valid PUT only.

### Implementation

- [ ] T018 [US1] `domain/platform-setting.repository.ts` (`IPlatformSettingRepository { findByKey, findAll, upsert }`) and `domain/platform-settings.errors.ts` (`PlatformSettingUnknownKeyError`, 404 `PLATFORM_SETTING_UNKNOWN_KEY`).
- [ ] T019 [US1] `application/platform-setting-save-hooks.ts` — `PlatformSettingSaveHook<K>` type, `PlatformSettingSaveHooks` map type, empty `PLATFORM_SETTING_SAVE_HOOKS`.
- [ ] T020 [US1] `application/platform-settings.service.ts` — `PlatformSettingsService implements IPlatformSettingsReader` (injectable clock, 30 s TTL, `invalidate`, invalid-value → defaults + log).
- [ ] T021 [US1] `application/use-cases/{list,get,update}-platform-setting.use-case.ts` — list ordered by `section`; get one; update with RBAC (`assertRoles(['AM','OP'])`), per-key validation, save-hook application, upsert, audit, `invalidate`, event emit via `Promise.allSettled`.
- [ ] T022 [US1] `infrastructure/prisma-platform-setting.repository.ts`.
- [ ] T023 [US1] `interfaces/platform-settings.routes.ts` (GET list, GET `:key`, PUT `:key`); register in `apps/backend/src/main/routes.ts`; wire module + `PLATFORM_SETTING_SAVE_HOOKS` + event bus in `apps/backend/src/main/container.ts`.

**Checkpoint**: US1 independently testable (T014–T017 green).

---

## Phase 4: User Story 2 — Configurable geofence at check-in (P2)

**Goal**: FLAG flags / BLOCK rejects with automatic fallback, reading radius/mode from settings; radius snapshot always written.
**Independent test**: FLAG far check-in accepted+flagged; BLOCK far check-in (good accuracy) → 422; fallback cases accepted.

### Tests (write first, must fail)

- [ ] T024 [P] [US2] `apps/backend/src/modules/inspector-execution/domain/geofence.service.test.ts` — the full `evaluateGeofence` truth table (FLAG/BLOCK, fallbacks, strict `>` boundary).
- [ ] T025 [P] [US2] `packages/shared/src/schemas/responses.test.ts` — start/finish/detail response schemas accept old and new shapes (also covers US3 finish fields).
- [ ] T026 [US2] Extend `apps/backend/src/modules/inspector-execution/application/use-cases/start-inspection.use-case.test.ts` — geofence cases (FLAG flag+mismatch audit, FLAG inside no audit, BLOCK 422 with message+details+`check_in_blocked` audit with no coords and no execution/idempotency, fallbacks accepted, in-progress retry not re-blocked, `geofence_radius_m` always 300, response `geofence`).
- [ ] T027 [P] [US2] `apps/backend/tests/integration/db/inspection-geofence.integration.test.ts` — BLOCK 900 m → 422 (no row) then retry same key at 50 m → 201; FLAG 900 m → 201 `out_of_radius`, `geofence_radius_m 300`, `start_accuracy_m`; old body → 201; no-coords FLAG → 201 radius 300.

### Implementation

- [ ] T028 [US2] `domain/geofence.service.ts` — pure `evaluateGeofence`.
- [ ] T029 [US2] Extend `StartInspectionUseCase` with the `IPlatformSettingsReader` dependency and the new order (existing-execution check → distance → settings → geofence → block/flag → create with radius snapshot → audits); update ALL untyped test wirings (`grep -rn "new StartInspectionUseCase" apps/backend`).
- [ ] T030 [US2] Pass `accuracy`/`clientOccurredAt` through the start route handler to the use case in `apps/backend/src/modules/inspector-execution/interfaces/inspector-execution.routes.ts`.

**Checkpoint**: US2 independently testable; 03.A2 satisfied.

---

## Phase 5: User Story 3 — Capture, check-in window & coordinate privacy (P3)

**Goal**: accuracy/device-time/distance on start+finish, window flag with plausible client time, CL audit-log coordinate masking.
**Independent test**: capture fields stored; window flag correct incl. late-sync; CL audit-log coordinates `[MASKED]`, AM/OP intact.

### Tests (write first, must fail)

- [ ] T031 [P] [US3] `packages/shared/src/schemas/inspection-execution.test.ts` — start/finish requests accept old body and new `accuracy`/`clientOccurredAt`; reject bad values.
- [ ] T032 [P] [US3] `apps/backend/src/modules/inspector-execution/domain/check-in-window.service.test.ts` — slot/tolerance boundaries, past-day, agency-timezone evaluation (pin `TZ` away from Sydney).
- [ ] T033 [P] [US3] `apps/backend/src/modules/inspector-execution/domain/client-occurred-at.test.ts` — `resolveEffectiveEventTime` window (−7 days / +5 min), `clientTimePlausible` true/false/null.
- [ ] T034 [US3] Extend `start-inspection.use-case.test.ts` — window cases (out/in window, no notification, late-sync plausible, implausible → `windowSkipped`, old body uses server time, accuracy clamp).
- [ ] T035 [US3] Extend `apps/backend/src/modules/inspector-execution/application/use-cases/finish-inspection.use-case.test.ts` — old body; distance+flag; far finish never blocks + mismatch audit (no coords, `phase FINISH`); no-coords; written in the finish transaction.
- [ ] T036 [US3] Extend `apps/backend/src/modules/inspector-execution/application/use-cases/get-appointment-detail.use-case.test.ts` — `geofence { radiusMeters, mode }` + execution capture fields.
- [ ] T037 [P] [US3] `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.test.ts` — CL_ADMIN masks coordinate keys (nested + arrays), `distanceMeters` intact, AM/OP intact, `FULL` untouched, null/string metadata passthrough, a case that fails without the mask.
- [ ] T038 [P] [US3] `apps/backend/tests/integration/db/audit-log-coordinate-mask.integration.test.ts` — after a real `start`, CL_ADMIN `/v1/audit-logs` has no inspector coordinate; AM has them.

### Implementation

- [ ] T039 [P] [US3] `domain/check-in-window.service.ts` (`isOutOfCheckInWindow`, uses `shared/domain/timezone-date.ts`) and `domain/client-occurred-at.ts` (`resolveEffectiveEventTime`, −7 d/+5 min).
- [ ] T040 [US3] Add window + client-time + capture handling to `StartInspectionUseCase` (effective time, `out_of_window`, `windowSkipped`, store accuracy/client time; clamp accuracy); no tenant notification on out-of-window.
- [ ] T041 [US3] Extend `FinishInspectionUseCase` with `IPlatformSettingsReader` + property coordinates; compute+store `finishGeolocationDistanceMeters`/`finishOutOfRadius`/accuracy/client-time in the finish transaction; FINISH `geolocation_mismatch` audit without coordinates; never block. Update untyped test wirings.
- [ ] T042 [US3] Extend `GetAppointmentDetailUseCase` with `geofence { radiusMeters, mode }` (from reader) + execution capture fields; update untyped test wirings.
- [ ] T043 [US3] `apps/backend/src/modules/audit/domain/mask-coordinate-keys.ts` (pure, nested + array-aware, fixed coordinate-key list) and apply it for `CL_ADMIN` in `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.ts`.

**Checkpoint**: US3 independently testable; 00.A3 (partial) + D10 privacy satisfied.

---

## Phase 6: Polish & cross-cutting

- [ ] T044 Regenerate the contract: `pnpm --filter backend generate:openapi` then `pnpm --filter @properfy/shared generate:types`; commit `packages/shared/openapi.json` and `packages/shared/src/api-types.ts`.
- [ ] T045 [P] Remove the X00 transition clauses (L-X00-04): `apps/backend/CLAUDE.md` §7.1 ("It is created by F03…"), `packages/shared/CLAUDE.md` §10.10 ("(added by F03)"), root `CLAUDE.md` §7.9 ("Known gap until F03…" — keep the test sentence). Reflect the new `platform-settings` module/endpoints/event/hook in `apps/backend/CLAUDE.md` and `packages/shared/CLAUDE.md` (N11).
- [ ] T046 Full gate inside the worktree: `pnpm --filter @properfy/shared build && test`; `pnpm --filter backend typecheck && lint && test`; `pnpm --filter backend test:integration:db -- platform-settings inspection-geofence audit-log-coordinate-mask`; `pnpm --filter web typecheck && pnpm --filter pwa typecheck`; confirm `git diff --stat origin/develop... | tail -1` ≤ 150 files.

---

## Dependencies & order

- Phase 1 → Phase 2 (foundational) → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6.
- US2 and US3 both depend on the `IPlatformSettingsReader` (from US1 implementation T020) and on the foundational pure services/schemas. US2 before US3 only because both extend `StartInspectionUseCase`; sequence the start-use-case edits (T029 then T040) to avoid a merge of the same file.
- Within a phase, `[P]` tasks touch distinct files and may run together. Test tasks precede their implementation tasks.

## Parallel example (Phase 2 foundational)

T002, T004, T005 (distinct shared files), T008, T009, T010 (distinct backend files) can run in parallel; T003 before T013 (build); T006→T007 (schema→migration) sequential.

## MVP

US1 alone (platform-settings registry + API) is a shippable increment and the foundation every later F03/F04/F05/F07/F08 task reuses. US2 (geofence) and US3 (capture + privacy) complete the F03-1 contract criteria 03.A2 and 00.A3.

## Format validation

All tasks use `- [ ] Tnnn [P?] [US?] description + path`; setup/foundational/polish carry no story label; US phases carry `[US1]`/`[US2]`/`[US3]`.
