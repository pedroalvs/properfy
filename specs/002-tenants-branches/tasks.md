---
description: "Implementation and backlog tracking for Tenants & Branches"
---

# Tasks: Tenants & Branches

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`data-model.md`](./data-model.md), [`contracts/`](./contracts/)
**Tests**: Required per constitution Principle III. Tenant deactivation rules are critical — assert against a real `PrismaAppointmentChecker`, not the stub.
**Organization**: Two sections — Baseline Implemented (shipped) and Open Backlog (Phase 2/3). Only open backlog items are new work.

## Format

- `[x]` shipped; `[ ]` open.
- `[P]` may run in parallel with other `[P]` tasks in the same group.
- `[Story]` maps to a user story in `spec.md` (US1–US8) or a `GAP-xxx`.

---

# SECTION 1 — Baseline Implemented

> Already done on the active branch. Do not reimplement.

## Setup & Foundational (shipped)

- [x] T001 Prisma schema: `Tenant`, `Branch`, `TenantStatus`, `BranchStatus` in `apps/backend/prisma/schema.prisma`.
- [x] T002 Shared enums `TenantStatus`, `BranchStatus` in `packages/shared/src/enums/tenant.ts`.
- [x] T003 Shared Zod schemas (`createTenant`, `updateTenant`, `deactivate`, `createBranch`, `updateBranch`, `listTenantsQuery`, `listBranchesQuery`, `tenantSettings`) in `packages/shared/src/schemas/tenant.ts`.
- [x] T004 Domain ports `ITenantRepository`, `IBranchRepository`, `IAppointmentChecker` and `StubAppointmentChecker` in `apps/backend/src/modules/tenant/domain/`.
- [x] T005 Domain errors in `apps/backend/src/modules/tenant/domain/tenant.errors.ts` (`TenantNotFound`, `TenantLegalNameConflict`, `TenantAlreadyInactive`, `TenantHasOpenAppointments`, `TenantInactive`, `BranchNotFound`, `BranchNameConflict`, `BranchAlreadyInactive`, `BranchHasOpenAppointments`).
- [x] T006 Entities `TenantEntity` and `BranchEntity` with status checks in `apps/backend/src/modules/tenant/domain/`.
- [x] T007 Prisma infrastructure adapters (`PrismaTenantRepository`, `PrismaBranchRepository`, `PrismaAppointmentChecker`) in `apps/backend/src/modules/tenant/infrastructure/`.

## US1 — Create tenant (shipped)

- [x] T010 [US1] `CreateTenantUseCase` with AM-only guard, legal-name uniqueness check, default time-slot seeding, audit.
- [x] T011 [US1] Route `POST /v1/tenants` in `tenant.routes.ts`.
- [x] T012 [US1] Unit test `apps/backend/tests/unit/tenant/create-tenant.use-case.test.ts`.
- [x] T013 [US1] Integration assertions for POST /v1/tenants in `tenant.routes.test.ts`.

## US2 — List, search, get tenant (shipped)

- [x] T020 [US2] `ListTenantsUseCase` with AM/OP guard and `branchCount` aggregate via `branchRepo.countByTenantIds`.
- [x] T021 [US2] `GetTenantUseCase`.
- [x] T022 [US2] Routes `GET /v1/tenants`, `GET /v1/tenants/:tenantId`.
- [x] T023 [US2] Unit tests `list-tenants.use-case.test.ts`, `get-tenant.use-case.test.ts`.
- [x] T024 [US2] Integration assertions for list/get.

## US3 — Update tenant (shipped)

- [x] T030 [US3] `UpdateTenantUseCase` with RBAC branching (AM full, CL_ADMIN own with field stripping), legal-name conflict, deep-merge of settings, audit.
- [x] T031 [US3] Route `PATCH /v1/tenants/:tenantId`.
- [x] T032 [US3] Unit test `update-tenant.use-case.test.ts` covering each RBAC branch and deep-merge behavior.
- [x] T033 [US3] Integration test asserting CL_ADMIN field-strip behavior.

## US4 — Deactivate tenant (shipped)

- [x] T040 [US4] `DeactivateTenantUseCase` with AM or OP (own tenant) guard, `TenantHasOpenAppointments` precondition, audit with reason.
- [x] T041 [US4] Route `POST /v1/tenants/:tenantId/deactivate`.
- [x] T042 [US4] Unit test `deactivate-tenant.use-case.test.ts`.
- [x] T043 [US4] Integration test exercising the open-appointment block with a real `PrismaAppointmentChecker`.

## US5 — Create branch (shipped)

- [x] T050 [US5] `CreateBranchUseCase` with AM/OP (own tenant)/CL_ADMIN guard, `TenantInactive` precondition, `BranchNameConflict` check, audit.
- [x] T051 [US5] Route `POST /v1/tenants/:tenantId/branches`.
- [x] T052 [US5] Unit test `create-branch.use-case.test.ts`.
- [x] T053 [US5] Integration test covering happy path and rejected-by-inactive-tenant.

## US6 — Update branch (shipped)

- [x] T060 [US6] `UpdateBranchUseCase` with RBAC guard and rename collision check.
- [x] T061 [US6] Route `PATCH /v1/tenants/:tenantId/branches/:branchId`.
- [x] T062 [US6] Unit test `update-branch.use-case.test.ts`.
- [x] T063 [US6] Integration test asserting `status` field is ignored on PATCH.

## US7 — List branches (shipped)

- [x] T070 [US7] `ListBranchesUseCase` with tenant scoping.
- [x] T071 [US7] Routes `GET /v1/tenants/:tenantId/branches`, `GET /v1/branches` (flat variant with JWT-based scoping).
- [x] T072 [US7] Unit test `list-branches.use-case.test.ts`.
- [x] T073 [US7] Integration tests covering client-role scoping and AM-without-tenantId empty-page behavior.

## US8 — Deactivate branch (shipped)

- [x] T080 [US8] `DeactivateBranchUseCase` with AM or OP (own tenant) guard, `BranchHasOpenAppointments` precondition, audit with reason.
- [x] T081 [US8] Route `POST /v1/tenants/:tenantId/branches/:branchId/deactivate`.
- [x] T082 [US8] Unit test `deactivate-branch.use-case.test.ts`.
- [x] T083 [US8] Integration test exercising the open-appointment block.

## Web portal (shipped)

- [x] T090 Web pages: `TenantListPage.tsx`, `TenantDetailPage.tsx`, `TenantContactListPage.tsx`.
- [x] T091 Web components: `TenantTable`, `TenantAdminTable`, `TenantFilters`, `TenantAdminFilters`, `TenantFormDrawer`, `TenantStatusChip`, `BranchSection`, `BranchFormDrawer`, `PricingRulesSection`.
- [x] T092 Component tests across the same files (`*.test.tsx`).

## Cross-cutting (shipped)

- [x] T095 `PrismaAppointmentChecker` implementation + unit test `prisma-appointment-checker.test.ts`.
- [x] T096 Container wiring in `apps/backend/src/main/container.ts` injecting `PrismaAppointmentChecker` into deactivation use cases.

---

# SECTION 2 — Open Backlog

> Only pick up work from this section. Every task must follow TDD and produce an audit record on write paths.

## Phase 2 — Gap closure

### GAP-001 — Activate tenant ✅

- [x] T100 [GAP-001] `ActivateTenantUseCase` — AM-only, `PENDING→ACTIVE` and `INACTIVE→ACTIVE`, `canBeActivated()` method on entity, audit with optional reason.
- [x] T101 [GAP-001] Route `POST /v1/tenants/:tenantId/activate` with `activateSchema` (optional reason).
- [x] T102 [GAP-001] 7 unit tests: PENDING→ACTIVE, INACTIVE→ACTIVE, already active, non-AM forbidden, not found, reason in audit, no reason.
- [x] T103 [GAP-001] Activate action in `TenantDetailPage` with confirm dialog + `useTenantActivate` hook. Visible for INACTIVE tenants.
- [ ] T104 [GAP-001] Integration check: activating a tenant unblocks CL user authentication. **DEFERRED** — needs integration test environment.

### GAP-002 — Rich tenant settings schema ✅

- [x] T110 [GAP-002] Design doc `settings-design.md` — full shape, CL_ADMIN allow-list, defaults.
- [x] T111 [GAP-002] `tenantSettingsSchema` expanded: 20+ keys, `.passthrough()` mode. Branding, sender, billing, feature flags, inspector config, `clUserPermissions`, email templates.
- [x] T112 [GAP-002] No Prisma migration needed — all keys remain in `settings_json` JSONB.
- [x] T113 [GAP-002] Backfill not needed — Zod defaults handle missing keys on read.
- [x] T114 [GAP-002] 8 new schema tests: valid full payload, invalid color/permissions/billing/sms, default assertions.
- [x] T115 [GAP-002] Schema published in `@properfy/shared` — consumers import from same source.

### GAP-003 — Billing period cross-field validation ✅

- [x] T120 [GAP-003] `validateBillingSettings()` function in `packages/shared/src/schemas/tenant.ts`. Not embedded in schema (`.partial()` updates shouldn't trigger it). Standalone validator for use cases.
- [x] T121 [GAP-003] 6 tests: WEEKLY+day pass, WEEKLY no day fail, BIWEEKLY no day fail, MONTHLY+day pass, MONTHLY no day fail, no period pass.

### GAP-004 — CL_ADMIN fine-grained settings scope ✅

- [x] T130 [GAP-004] `CL_ADMIN_SETTINGS_ALLOW_LIST` + `filterClAdminSettings()` in `UpdateTenantUseCase`. Applied to both CL_ADMIN and OP (same restriction per FR-007b).
- [x] T131 [GAP-004] Test: CL_ADMIN settings filtered (allowed keys pass, blocked keys stripped). AM settings unfiltered.
- [x] T132 [GAP-004] 6 new tests total: CL_ADMIN cross-tenant forbidden, CL_USER forbidden, OP own tenant allowed, OP other tenant forbidden, CL_ADMIN settings filter, AM settings unfiltered.

### GAP-005 — Domain events emission ✅

- [x] T140 [GAP-005] `DomainEventBus` in `shared/application/events/domain-event-bus.ts`. `DomainEvent` interface, `Promise.allSettled` for fire-and-forget. `TENANT_EVENTS` + `BRANCH_EVENTS` constants.
- [x] T141 [GAP-005] 8 events emitted from all write use cases (create/update/activate/deactivate for both tenant and branch). Optional constructor parameter — backward compatible.
- [x] T142 [GAP-005] Bus exported on `AppContainer.domainEventBus` for subscriber registration by features 009/011.
- [x] T143 [GAP-005] 8 bus unit tests + 1 integration test on `create-tenant` verifying event emission.

### GAP-006 — Branch reactivation ✅

- [x] T150 [GAP-006] `ActivateBranchUseCase` — AM-only, `INACTIVE→ACTIVE`, `BranchAlreadyActiveError`, audit with before/after status.
- [x] T151 [GAP-006] Route `POST /v1/tenants/:tenantId/branches/:branchId/activate`.
- [x] T152 [GAP-006] 5 tests: success, already active, non-AM forbidden, branch not found, tenant not found.

### GAP-007 — Case-insensitive branch name uniqueness ✅

- [x] T160 [GAP-007] Decision: functional unique index on `lower(name)` + Prisma `mode: 'insensitive'`.
- [x] T161 [GAP-007] Migration `20260407000000_branch_name_case_insensitive`. Drops old index, creates `UNIQUE (tenant_id, lower(name))`.
- [x] T162 [GAP-007] `findByName` uses `mode: 'insensitive'`. `UpdateBranchUseCase` compares lowercased for self-rename detection.
- [x] T163 [GAP-007] 3 tests: create `main` when `Main` exists → conflict, rename to `BETA` when `beta` exists → conflict, self-rename casing change → allowed.

### GAP-008 — Get branch by id ✅

- [x] T170 [GAP-008] `GetBranchUseCase` — tenant-scoped, AM/OP/CL_ADMIN/CL_USER access with RBAC.
- [x] T171 [GAP-008] Route `GET /v1/tenants/:tenantId/branches/:branchId`.
- [x] T172 [GAP-008] 11 tests: AM, OP, CL_ADMIN own, CL_USER own, cross-tenant forbidden (x2), INSP forbidden, tenant not found, tenant deleted, branch not found, branch deleted.
- [ ] T173 [GAP-008] Swap web portal calls from list-lookup to this endpoint. **DEFERRED** — backend complete.

### GAP-009 — Tenant hard-delete runbook ✅

- [x] T180 [GAP-009] Runbook at `docs/runbooks/tenant-hard-delete.md`. 19-step cascade, verification queries, audit retention notes, emergency partial-failure guidance.
- [x] T181 [GAP-009] Decision: no admin endpoint. Rationale documented in runbook.

### GAP-010 — Tenant branding asset upload ✅

- [x] T190 [GAP-010] `IBrandingStorageService` port + `SupabaseBrandingStorageService` (S3 SDK) + `StubBrandingStorageService`. Bucket: `tenant-branding`.
- [x] T191 [GAP-010] `GenerateLogoUploadUrlUseCase` + route `POST /v1/tenants/:tenantId/branding/logo/presign`. AM + CL_ADMIN own tenant. Validates image MIME types.
- [x] T192 [GAP-010] `ConfirmLogoUploadUseCase` + route `POST .../branding/logo/confirm`. Deep-merges `logoUrl` into settings. Audit `tenant.logo_updated`.
- [x] T193 [GAP-010] 17 tests (9 generate + 8 confirm). Web upload UI **DEFERRED**.

### GAP-011 — Branch address schema ✅

- [x] T210 [GAP-011] `branchAddressSchema` in `packages/shared/src/schemas/address.ts`. Structured: street, number?, complement?, suburb, city, state, postcode, country (ISO alpha-2, default AU), lat/lng?.
- [x] T211 [GAP-011] Replaced `z.record(z.unknown())` with `branchAddressSchema.optional()` in both `createBranchSchema` and `updateBranchSchema`.
- [x] T212 [GAP-011] Backfill not needed — existing JSONB rows remain as-is, new writes validated.
- [ ] T213 [GAP-011] Update `BranchFormDrawer` to use structured fields. **DEFERRED** — backend/schema complete.
- [x] T214 [GAP-011] 12 address schema tests + 4 branch schema tests updated for structured address.
- [x] T215 [GAP-011] Schema in `address.ts` is reusable by feature 003-properties.

## Phase 3 — Polish & cross-cutting

- [ ] T200 [P] Verify module coverage ≥ 80% with `pnpm --filter backend test -- --coverage` on `tenant/`.
- [ ] T201 [P] End-to-end assertion: every tenant/branch write path emits exactly one audit record with complete `before`/`after` snapshots.
- [ ] T202 Confirm OpenAPI export reflects the `tenant.*` and `branch.*` endpoints and that the frontend client regenerates cleanly.
- [ ] T203 Incremental supersede of legacy spec:
  - Add a banner to `specs/backend/tenant.spec.md` marking it as SUPERSEDED by `specs/002-tenants-branches/` once this feature is approved by the user.
  - Remove the legacy file only after the next feature migration cycle (confirm with user before deletion).
- [ ] T204 Revisit soft-delete strategy and decide whether legal-name uniqueness should exclude soft-deleted rows (tie to GAP-009).

---

## Dependencies & Execution Order

- **GAP-002** blocks **GAP-003** and **GAP-004** (both require the expanded schema keys).
- **GAP-002** blocks **GAP-010** (logo URL must be part of the schema).
- **GAP-005** is a prerequisite for moving cross-feature integrations off `AuditService` bridging.
- **GAP-001** should ship before any Phase 2 feature that expects tenants to exit `PENDING` through the API (self-serve onboarding, sales demo flows).
- **GAP-007** should be coordinated with feature 006-appointments because scheduling UIs present branch names.

## Notes

- Every open-backlog task must follow TDD (red → green → refactor) per constitution Principle III.
- Audit coverage is mandatory on every new write path, including activation endpoints.
- Close each `GAP-xxx` by promoting it in `spec.md` (Known Gaps table) from `Status: GAP` to `Status: IMPLEMENTED` and adding acceptance scenarios to the matching user story.
- Do not introduce new tenant statuses or branch statuses without amending the constitution and this spec in the same PR.
