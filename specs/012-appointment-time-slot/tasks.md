---
description: "Task list for Appointment Time Slots feature implementation"
---

# Tasks: Appointment Time Slots

**Status (2026-04-13)**: **Implemented.** This task list was never ticked in lockstep with the code, but the module shipped ahead of editorial closure. The checklist below is preserved as a historical planning record. The real delivery state is captured in `spec.md` → **Delivery Outcome (2026-04-13, editorial backfill)**. Every entry point listed in this task file maps to a live file in `apps/backend/src/modules/appointment-time-slot/`. GAP-002 overlap detection was closed in commit `1c92edd` (2026-04-08).

**Input**: Design documents from `/specs/012-appointment-time-slot/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/
**Tests**: Included — TDD is mandatory per Properfy constitution Principle III.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Backend: `apps/backend/src/modules/appointment-time-slot/...`
- Shared: `packages/shared/src/schemas/appointment-time-slot.ts`
- Tests: `apps/backend/tests/{unit,integration}/appointment-time-slot/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing project structure and shared schemas are in place.

- [x] T001 Verify Prisma schema for `AppointmentTimeSlot` model in `apps/backend/prisma/schema.prisma` — confirm `UNIQUE (tenant_id, branch_id, start_time, end_time)` and indexes `(tenant_id, branch_id, is_active)`, `(tenant_id, is_active)` exist.
- [x] T002 [P] Verify shared Zod schemas in `packages/shared/src/schemas/appointment-time-slot.ts` — confirm `createAppointmentTimeSlotSchema`, `updateAppointmentTimeSlotSchema`, `listAppointmentTimeSlotsQuerySchema`, `listEffectiveTimeSlotsQuerySchema`, response schemas exist and align with contracts.
- [x] T003 [P] Verify domain entity `AppointmentTimeSlotEntity` in `apps/backend/src/modules/appointment-time-slot/domain/appointment-time-slot.entity.ts` — confirm `compositeValue` getter returns `"<startTime>-<endTime>"`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Verify domain port `IAppointmentTimeSlotRepository` in `apps/backend/src/modules/appointment-time-slot/domain/appointment-time-slot.repository.ts` — confirm `create`, `update`, `findById`, `findAll`, `findEffective`, `softDelete` methods.
- [x] T005 [P] Verify domain errors `AppointmentTimeSlotNotFoundError` and `AppointmentTimeSlotConflictError` in `apps/backend/src/modules/appointment-time-slot/domain/appointment-time-slot.errors.ts`.
- [x] T006 [P] Add new domain error `AppointmentTimeSlotOverlapError` in `apps/backend/src/modules/appointment-time-slot/domain/appointment-time-slot.errors.ts` for FR-003b overlap detection.
- [x] T007 Verify Prisma repository `PrismaAppointmentTimeSlotRepository` in `apps/backend/src/modules/appointment-time-slot/infrastructure/prisma-appointment-time-slot.repository.ts` — confirm `findEffective` implements the branch-override-or-tenant-default pattern per data-model.md.
- [x] T008 Verify container wiring in `apps/backend/src/main/container.ts` — confirm all use cases and the repository are injected.

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Operator configures time-slot catalog (Priority: P1) 🎯 MVP

**Goal**: AM, OP (own tenant), or CL_ADMIN (own tenant) can create time slots with tenant-wide or branch-specific scope.

**Independent Test**: Create 2 tenant-wide slots, then a branch-specific slot. Verify effective resolution returns the correct set per scope.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Unit test for `CreateAppointmentTimeSlotUseCase` in `apps/backend/tests/unit/appointment-time-slot/create-appointment-time-slot.use-case.test.ts` — cover: happy path, `startTime >= endTime` rejection, `BRANCH_NOT_FOUND`, CL_ADMIN cross-tenant rejection, CL_USER/INSP forbidden.
- [x] T010 [P] [US1] Integration test for `POST /v1/time-slots` in `apps/backend/tests/integration/appointment-time-slot/appointment-time-slot.routes.test.ts` — cover: 201 success, `TIME_SLOT_CONFLICT` on duplicate, `FORBIDDEN` for CL_USER.

### Implementation for User Story 1

- [x] T011 [US1] Verify `CreateAppointmentTimeSlotUseCase` in `apps/backend/src/modules/appointment-time-slot/application/use-cases/create-appointment-time-slot.use-case.ts` — confirm RBAC (AM/OP/CL_ADMIN), tenant scoping, branch validation, audit, and time validation.
- [x] T012 [US1] Add overlap detection to `CreateAppointmentTimeSlotUseCase` — before inserting, query active slots in the same `(tenant_id, branch_id)` scope and reject if `new.startTime < existing.endTime AND new.endTime > existing.startTime`. Adjacent (touching) slots are allowed. Throw `AppointmentTimeSlotOverlapError`. (FR-003b — APPROVED RULE NOT YET IMPLEMENTED.)
- [x] T013 [US1] Verify route `POST /v1/time-slots` in `apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts`.

**Checkpoint**: At this point, operators can create and list time slots. The effective-slot resolution works for appointment creation.

---

## Phase 4: User Story 4 — System resolves effective time slots (Priority: P1)

**Goal**: The effective-slot resolution correctly returns branch-specific overrides when present, or falls back to tenant-wide defaults.

**Independent Test**: Seed a tenant with defaults, add a branch-specific override, verify the resolution hides defaults for the overridden branch and shows them for a branch without overrides.

### Tests for User Story 4 ⚠️

- [x] T014 [P] [US4] Unit test for `ListEffectiveTimeSlotsUseCase` in `apps/backend/tests/unit/appointment-time-slot/list-effective-time-slots.use-case.test.ts` — cover: branch override hides tenant defaults, fallback to tenant defaults, CL_USER allowed, INSP forbidden.
- [x] T015 [P] [US4] Integration test for `GET /v1/time-slots/effective` in `apps/backend/tests/integration/appointment-time-slot/appointment-time-slot.routes.test.ts` — cover: branch override vs. default fallback end-to-end, FORBIDDEN for INSP.

### Implementation for User Story 4

- [x] T016 [US4] Verify `ListEffectiveTimeSlotsUseCase` in `apps/backend/src/modules/appointment-time-slot/application/use-cases/list-effective-time-slots.use-case.ts` — confirm branch-override-or-tenant-default resolution, tenant scoping, and RBAC.
- [x] T017 [US4] Verify route `GET /v1/time-slots/effective` in `apps/backend/src/modules/appointment-time-slot/interfaces/appointment-time-slot.routes.ts`.
- [x] T018 [US4] Verify feature 006 integration — confirm `CreateAppointmentUseCase` calls `findEffective` and rejects invalid `timeSlot` values.

**Checkpoint**: Effective-slot resolution is verified. Appointment creation validates time slots against the catalog.

---

## Phase 5: User Story 5 — Default slots seeded on tenant creation (Priority: P1)

**Goal**: When a new tenant is created (feature 002), 2 default time slots are seeded automatically.

**Independent Test**: Create a tenant, immediately list its time slots, confirm 2 defaults exist.

### Tests for User Story 5 ⚠️

- [x] T019 [P] [US5] Integration test verifying that after `POST /v1/tenants` (feature 002), the new tenant has exactly 2 default time slots (`09:00-12:00`, `14:00-17:00`) with `branchId = null`.

### Implementation for User Story 5

- [x] T020 [US5] Verify seeding logic in `apps/backend/src/modules/tenant/application/use-cases/create-tenant.use-case.ts` — confirm it calls `IAppointmentTimeSlotRepository.create()` for 2 default slots with correct values.

**Checkpoint**: New tenants are immediately operational for scheduling.

---

## Phase 6: User Story 2 — Update/deactivate time slot (Priority: P2)

**Goal**: Operators can update slot properties and toggle `isActive`.

**Independent Test**: Create a slot, deactivate it, verify it no longer appears in effective list.

### Tests for User Story 2 ⚠️

- [x] T021 [P] [US2] Unit test for `UpdateAppointmentTimeSlotUseCase` in `apps/backend/tests/unit/appointment-time-slot/update-appointment-time-slot.use-case.test.ts` — cover: happy path, time validation, CL_ADMIN cross-tenant rejection, audit before/after.
- [x] T022 [P] [US2] Integration test for `PATCH /v1/time-slots/:id` — cover: 200 success, deactivation hides from effective list.

### Implementation for User Story 2

- [x] T023 [US2] Verify `UpdateAppointmentTimeSlotUseCase` in `apps/backend/src/modules/appointment-time-slot/application/use-cases/update-appointment-time-slot.use-case.ts`.
- [x] T024 [US2] Add overlap detection to `UpdateAppointmentTimeSlotUseCase` — same logic as T012 but check against OTHER active slots in the scope (exclude the slot being updated). (FR-003b.)
- [x] T025 [US2] Verify route `PATCH /v1/time-slots/:id`.

**Checkpoint**: Slot management is complete (create + update + deactivate).

---

## Phase 7: User Story 3 — Delete time slot (Priority: P2)

**Goal**: Operators can soft-delete time slots permanently.

**Independent Test**: Create a slot, delete it, verify it is excluded from all queries.

### Tests for User Story 3 ⚠️

- [x] T026 [P] [US3] Unit test for `DeleteAppointmentTimeSlotUseCase` in `apps/backend/tests/unit/appointment-time-slot/delete-appointment-time-slot.use-case.test.ts` — cover: happy path, CL_ADMIN cross-tenant rejection, already-deleted rejection.
- [x] T027 [P] [US3] Integration test for `DELETE /v1/time-slots/:id` — cover: 204 success, 404 on re-delete.

### Implementation for User Story 3

- [x] T028 [US3] Verify `DeleteAppointmentTimeSlotUseCase` in `apps/backend/src/modules/appointment-time-slot/application/use-cases/delete-appointment-time-slot.use-case.ts`.
- [x] T029 [US3] Verify route `DELETE /v1/time-slots/:id`.

**Checkpoint**: Full slot lifecycle is complete (create + update + deactivate + delete).

---

## Phase 8: User Story 6 — Admin list for auditing (Priority: P2)

**Goal**: Operators browse the full time-slot catalog with optional inactive filter.

**Independent Test**: Create 5 slots, deactivate 1, list with and without `includeInactive`.

### Tests for User Story 6 ⚠️

- [x] T030 [P] [US6] Unit test for `ListAppointmentTimeSlotsUseCase` in `apps/backend/tests/unit/appointment-time-slot/list-appointment-time-slots.use-case.test.ts` — cover: tenant scoping, CL_USER/INSP forbidden, `includeInactive` filter.
- [x] T031 [P] [US6] Integration test for `GET /v1/time-slots` — cover: filter combinations, FORBIDDEN for CL_USER.

### Implementation for User Story 6

- [x] T032 [US6] Verify `ListAppointmentTimeSlotsUseCase` in `apps/backend/src/modules/appointment-time-slot/application/use-cases/list-appointment-time-slots.use-case.ts`.
- [x] T033 [US6] Verify route `GET /v1/time-slots`.

**Checkpoint**: All 6 user stories are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T034 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `appointment-time-slot/`.
- [x] T035 [P] Confirm every time-slot write path (create/update/delete) emits exactly one audit record — end-to-end assertion test.
- [x] T036 Confirm OpenAPI export reflects all 5 endpoints (`POST`, `GET list`, `GET effective`, `PATCH`, `DELETE`) and the frontend client regenerates cleanly.
- [x] T037 Verify GAP-001: confirm that feature 007 tenant-portal reschedule flow presents effective slots for the appointment's branch (if not wired, create a follow-up task).
- [x] T038 Run `pnpm lint && pnpm typecheck` to verify no regressions.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — creates the core CRUD
- **US4 (Phase 4)**: Depends on Foundational — can run in parallel with US1
- **US5 (Phase 5)**: Depends on Foundational — can run in parallel with US1 and US4
- **US2 (Phase 6)**: Depends on US1 (needs slots to update)
- **US3 (Phase 7)**: Depends on US1 (needs slots to delete)
- **US6 (Phase 8)**: Depends on US1 (needs slots to list)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — No dependencies on other stories
- **US4 (P1)**: Can start after Foundational — Independent of US1 (tests can seed data directly)
- **US5 (P1)**: Can start after Foundational — Independent (verifies feature 002 integration)
- **US2 (P2)**: Can start after US1 — Updates require existing slots
- **US3 (P2)**: Can start after US1 — Deletes require existing slots
- **US6 (P2)**: Can start after US1 — List requires existing slots

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Entity/port verification before use-case implementation
- Use-case implementation before route verification
- Story complete before moving to next priority

### Parallel Opportunities

```bash
# After Foundational (Phase 2) completes, these 3 can start in parallel:
US1 (Phase 3): Create time slots
US4 (Phase 4): Effective resolution
US5 (Phase 5): Default seeding

# After US1 completes, these 3 can start in parallel:
US2 (Phase 6): Update/deactivate
US3 (Phase 7): Delete
US6 (Phase 8): Admin list
```

---

## Implementation Strategy

### MVP First (User Story 1 + 4 + 5 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (Create) + Phase 4: US4 (Effective resolution) + Phase 5: US5 (Default seeding) in parallel
4. **STOP and VALIDATE**: Test that appointments can be created with valid time slots and rejected with invalid ones
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US4 + US5 → Test independently → Deploy/Demo (MVP!)
3. Add US2 → Test independently → Deploy/Demo (operators can edit)
4. Add US3 → Test independently → Deploy/Demo (operators can delete)
5. Add US6 → Test independently → Deploy/Demo (operators can audit)
6. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Overlap detection tasks (T012, T024) implement FR-003b — APPROVED RULE NOT YET IMPLEMENTED. These are the only NEW implementation tasks; all other tasks verify existing code.
