---
description: "Implementation and backlog tracking for Inspectors & Execution"
---

# Tasks: Inspectors & Execution

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. Idempotency, T-1 rule consistency, and state transition correctness are the highest-risk surfaces.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3).

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel.
- `[Story]` maps to a user story in `spec.md` (US1–US9) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `Inspector`, `InspectorAvailabilitySlot`, `InspectionExecution`, `InspectionAsset`, plus enums.
- [x] T002 Shared Zod schemas in `packages/shared/src/schemas/{inspector,inspector-execution}.ts`.
- [x] T003 Domain entities and typed errors for both modules.
- [x] T004 Domain ports `IInspectorRepository`, `IAvailabilitySlotRepository`, `IInspectorAppointmentChecker`, `IInspectionExecutionRepository`, `IInspectionAssetRepository`, `IStorageService`, `IServiceTypeReader`, `IIdempotencyService`.
- [x] T005 Pure domain services `T1VisibilityService`, `InspectionTimeWindowService`, `allowed-mime-types.ts` matrix.
- [x] T006 Prisma adapters for all ports + `SupabaseStorageService` and `StubStorageService`.
- [x] T007 Background workers: `expire-assets.worker.ts`, `notify-stuck.worker.ts`.

## US1–US5 — Inspector CRUD, slots, link, deactivate (shipped)

- [x] T010 [US1] `CreateInspectorUseCase` with AM/OP guard, email uniqueness, region join population.
- [x] T011 [US1] Route `POST /v1/inspectors`.
- [x] T012 [US1] Unit + integration tests.
- [x] T020 [US2] `GetInspectorUseCase`, `ListInspectorsUseCase`, `UpdateInspectorUseCase`.
- [x] T021 [US2] Routes GET/PATCH.
- [x] T030 [US3] `CreateAvailabilitySlotUseCase`, `ListAvailabilitySlotsUseCase`, `UpdateAvailabilitySlotUseCase` (flat + scoped routes).
- [x] T031 [US3] Tests including INSP self-serve, AM/OP any-inspector.
- [x] T040 [US4] `LinkInspectorToUserUseCase` with INSP-role guard and 1:1 uniqueness.
- [x] T041 [US4] Route `POST /v1/inspectors/:id/link-user`.
- [x] T050 [US5] `DeactivateInspectorUseCase` with `IInspectorAppointmentChecker` block, reason required, audit.
- [x] T051 [US5] Route `POST /v1/inspectors/:id/deactivate`.
- [x] T052 [US5] Test with real checker for the open-appointments block.

## US6 — Inspector schedule with T-1 rule (shipped)

- [x] T060 [US6] `GetInspectorScheduleUseCase` applying `T1VisibilityService` to filter the list.
- [x] T061 [US6] `GetAppointmentDetailUseCase` for the detail view.
- [x] T062 [US6] Routes `GET /v1/inspector/schedule`, `GET /v1/inspector/appointments/:appointmentId`.
- [x] T063 [US6] Unit tests for `T1VisibilityService` covering every branch of the rule (ROUTINE/INGOING/OUTGOING × CONFIRMED/PENDING/UNAVAILABLE × keyRequired true/false × T-0/T-1/T-2).
- [x] T064 [US6] Integration tests verifying the schedule endpoint honors the rule.

## US7 — Start inspection (shipped)

- [x] T070 [US7] `StartInspectionUseCase` with INSP guard, idempotency, T-1 rule, time-window rule, geolocation capture, audit.
- [x] T071 [US7] Route `POST /v1/inspector/appointments/:id/start` requiring `Idempotency-Key`.
- [x] T072 [US7] Unit tests for every error branch (T1 blocked, time window, missing key, wrong inspector, already finished).
- [x] T073 [US7] Integration test for idempotent replay.

## US8 — Asset upload (shipped)

- [x] T080 [US8] `RequestAssetUploadUseCase` with MIME whitelist, 15 min TTL, presigned URL via storage port.
- [x] T081 [US8] `ConfirmAssetUploadUseCase` verifying object existence in storage.
- [x] T082 [US8] Routes `POST /v1/inspector/appointments/:id/assets`, `PATCH .../assets/:assetId/confirm`.
- [x] T083 [US8] `expire-assets.worker.ts` reaping PENDING rows past TTL.
- [x] T084 [US8] Unit tests for MIME matrix, ownership check, expiry.

## US9 — Finish inspection (shipped)

- [x] T090 [US9] `FinishInspectionUseCase` with execution validation, asset validation (min photos, signature check), checklist non-empty guard, state transition via feature 006.
- [x] T091 [US9] Route `POST /v1/inspector/appointments/:id/finish` requiring `Idempotency-Key`.
- [x] T092 [US9] Unit tests for every rejection branch.
- [x] T093 [US9] Integration test asserting finish triggers `SCHEDULED → DONE` via `ExecuteStatusTransitionUseCase` and records `appointment.done_pending_crosscheck` (no financial entries created).
- [x] T094 [US9] Integration test for idempotent replay within 24 h.

## Cross-cutting (shipped)

- [x] T095 `/v1/inspector/offers` alias route delegating to feature 005 `GetMarketplaceOffersUseCase`.
- [x] T096 `notify-stuck.worker.ts` scheduled job surfacing started-but-not-finished executions.
- [x] T097 Container wiring: inspector and inspector-execution modules, including cross-module ports to appointments, service types, storage, idempotency.
- [x] T098 Web pages under `apps/web/src/features/inspectors/`.
- [x] T099 PWA pages under `apps/pwa/src/features/{schedule,offers}/`.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD.

## Phase 2 — Gap closure

### GAP-001 — Geolocation verification at start

- [ ] T100 [GAP-001] Depends on 003#GAP-003 (property PostGIS backfill).
- [ ] T101 [GAP-001] Compute distance between the start coordinates and the property's geocoded `coordinates` in `StartInspectionUseCase`.
- [ ] T102 [GAP-001] Reject or flag starts beyond a configurable radius (default 500m).
- [ ] T103 [GAP-001] Tests with fixture coordinates.

### GAP-002 — Consolidate inspector region data

- [ ] T110 [GAP-002] Decision: `inspector_regions` join table is authoritative; remove `inspectors.regions_json` OR treat it as a denormalized cache.
- [ ] T111 [GAP-002] Prisma migration if the column is removed.
- [ ] T112 [GAP-002] Update marketplace filtering and manual assignment to read from the join table exclusively.
- [ ] T113 [GAP-002] Backfill + regression tests.

### GAP-003 — Availability slot booking integration

- [ ] T120 [GAP-003] Decrement `capacity` on `AWAITING_INSPECTOR → SCHEDULED` when an appointment is assigned to an inspector whose slot covers the date/time.
- [ ] T121 [GAP-003] Restore `capacity` on cancellation.
- [ ] T122 [GAP-003] Reject booking when `capacity = 0`.
- [ ] T123 [GAP-003] Tests covering assignment + cancellation round-trip.

### GAP-004 — Centralize T-1 rule

- [ ] T130 [GAP-004] Move the rule call into a dedicated repository method `findVisibleForInspector(inspectorId, dateRange)` that applies `T1VisibilityService` internally.
- [ ] T131 [GAP-004] Migrate `GetInspectorScheduleUseCase` and `StartInspectionUseCase` to consume the new method.
- [ ] T132 [GAP-004] Tests asserting the rule is applied in exactly one place.

### GAP-005 — Configurable time window per tenant or service type

- [ ] T140 [GAP-005] Depends on 002#GAP-002 (rich tenant settings).
- [ ] T141 [GAP-005] Read `tenant.settings_json.inspectionWindowBefore` and `.inspectionWindowAfter` in `InspectionTimeWindowService`; fall back to defaults.
- [ ] T142 [GAP-005] Optional: per-service-type override via `checklistTemplate`.
- [ ] T143 [GAP-005] Tests.

### GAP-006 — Pause / auto-save in-progress execution

- [ ] T150 [GAP-006] Add a `PATCH /v1/inspector/appointments/:id/execution` endpoint that saves `checklistJson` and `notes` without finishing.
- [ ] T151 [GAP-006] PWA: auto-save every N seconds during the inspection.
- [ ] T152 [GAP-006] Tests.

### GAP-007 — Re-open finished execution

- [ ] T160 [GAP-007] Decision: allow AM to re-open a finished execution for limited edits (add missing photos).
- [ ] T161 [GAP-007] If approved: new use case `ReopenExecutionUseCase` writing a `resumed_at` timestamp and keeping the original `started_at`.
- [ ] T162 [GAP-007] Coordinate with feature 006 on the state implications (DONE appointment with re-opened execution).

### GAP-008 — Asset retention policy

- [ ] T170 [GAP-008] Runbook `docs/ops/inspection-asset-retention.md`.
- [ ] T171 [GAP-008] Optional scheduled job moving assets older than N months to cold storage.

### GAP-009 — Typed JSON fields on inspector

- [ ] T180 [GAP-009] Define Zod schemas for `paymentSettingsJson`, `regionsJson`, `serviceTypesJson`, `clientEligibilityJson` in shared.
- [ ] T181 [GAP-009] Validate on write in create/update use cases.
- [ ] T182 [GAP-009] Backfill log of offenders.
- [ ] T183 [GAP-009] Tests.

### GAP-010 — Extract time-window service for feature 006 reuse

- [ ] T190 [GAP-010] Move `InspectionTimeWindowService` to `shared/domain/` or a dedicated schedule module.
- [ ] T191 [GAP-010] Consume it from feature 006 force-confirmation and reschedule flows.
- [ ] T192 [GAP-010] Tests.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` for both inspector and inspector-execution.
- [ ] T201 [P] End-to-end assertion: every execution write path emits the expected audit records (start: 2, finish: 2 + 006 transition events).
- [ ] T202 Confirm OpenAPI export reflects all inspector and execution endpoints; regenerate frontend clients.
- [ ] T203 Incremental supersede of legacy specs: banner on `specs/backend/inspector-execution.spec.md` and `specs/pwa/execution.spec.md`.
- [ ] T204 Review redaction of inspector PII (payment settings, phone) in error logs.

---

## Dependencies & Execution Order

- **GAP-001** depends on 003#GAP-003 (PostGIS on properties).
- **GAP-004** should land before introducing any new consumer of the T-1 rule.
- **GAP-005** depends on 002#GAP-002 (rich tenant settings).
- **GAP-010** is a refactor that unblocks cleaner cross-feature time-window handling.

## Notes

- State-machine sovereignty: finish MUST call `ExecuteStatusTransitionUseCase` — reviewers block any PR that writes `appointment.status` directly from this module.
- Idempotency on start/finish is mandatory. Missing key is a hard error.
- Close each `GAP-xxx` by promoting in `spec.md` and updating `specs/GAPS.md`.
