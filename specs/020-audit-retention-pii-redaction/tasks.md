# Tasks: Audit Retention and PII Redaction

**Input**: Design documents from `/specs/020-audit-retention-pii-redaction/`
**Prerequisites**: plan.md, spec.md

**Status (2026-04-22)**: **SHIPPABLE — 177 of 177 tasks complete.** All integration tests for US3/US4/US5 delivered. Manual smoke procedures superseded by DEC-019 (testcontainers coverage mapping). Open-real = 0.

- **Closed (2026-04-17)**: T061, T062, T077, T078 — US1 cross-check + financial retention integration verified end-to-end
- **Closed (2026-04-22)**: T136, T146 — US4 includeArchived integration (7 tests passing); T154, T167 — US5 RBAC integration (14 tests passing); T171-T175 — manual smokes superseded by DEC-019

**Tests**: TDD is mandatory per constitution. Unit + integration tests are explicitly listed for the five invariant areas: (1) DONE / cross-check audit preservation, (2) financial-evidence integrity, (3) irreversible redaction, (4) cold-storage `includeArchived` behavior, (5) retention / erasure concurrency.

**Organization**: Tasks are grouped by user story following the priority order in `spec.md` (P1 → P5). Phase 2 (Foundational) is a hard prerequisite for all user stories because it introduces the schema migration, the category/preservation/PII registries, and the on-demand redaction primitives. **Wave 2 of the plan (US1 retention reshape) is the critical path** — it touches the retention hot path and reverses the current write-time PII destruction. **Wave 4 (US3 erasure workflow) is the secondary critical path** for LGPD compliance.

**Implemented reality callout (pre-implementation snapshot)**: the 020 spec says "Status: Draft" but at planning time the audit module already ships with (a) `AuditRetentionWorker` doing **hard-delete** with the cross-check preservation rule inline, (b) `PersistentAuditService.log()` **destroying PII at write time** via `redactPii()` — divergence from FR-014/FR-025, (c) `ListAuditLogsUseCase` already enforcing AM/OP/CL_ADMIN gating and a CL_ADMIN blanket `[MASKED]`, (d) `pgboss audit.retention` schedule at `30 3 * * *`, (e) `appointments.done_marked_by_user_id` column already deployed with `PerformCrossCheckUseCase` preferring it over the audit scan. Tasks below **extend** that skeleton and **reverse** the single diverging behavior (write-time PII destruction). See plan.md "Implemented Reality vs Approved Target" for the full table.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Shared**: `packages/shared/src/`
- **Backend**: `apps/backend/src/`
- **Backend tests**: `apps/backend/tests/`

---

## Phase 1: Setup

**Purpose**: Verify the implemented-reality assumptions from plan.md before touching code.

- [X] T001 Verify implemented reality per plan Summary table — confirm `AuditLog` Prisma model at `apps/backend/prisma/schema.prisma:556` has only the core fields (no `retention_category` / `redaction_status` / `cold_storage` / `preservation_rule_id`); confirm `PersistentAuditService.log()` at `apps/backend/src/modules/audit/application/services/persistent-audit.service.ts` calls `redactPii(entry.action, entry.before)` and `redactPii(entry.action, entry.after)` at write time; confirm `pii-redaction.ts` at `apps/backend/src/modules/audit/application/helpers/pii-redaction.ts` contains the 14-entry `PII_REGISTRY`; confirm `AuditRetentionWorker` at `apps/backend/src/modules/audit/infrastructure/workers/audit-retention.worker.ts` performs a hard delete with the inline cross-check preservation rule (`al.after_json->>'status' = 'DONE' AND a.done_checked_at IS NULL`); confirm pg-boss schedule `audit.retention` is registered in `apps/backend/src/main/workers.ts` at `30 3 * * *`; confirm `ListAuditLogsUseCase` at `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.ts` already enforces AM/OP/CL_ADMIN gating and applies `[MASKED]` blanket for CL_ADMIN; confirm `appointments.done_marked_by_user_id` column exists and `PerformCrossCheckUseCase` at `apps/backend/src/modules/appointment/application/use-cases/perform-cross-check.use-case.ts` prefers it with the audit-scan fallback; confirm `tenant_portal_activities` table exists without any retention columns. Record any divergence from the plan's pre-implementation snapshot.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema migration, new enums, new domain entities and repositories, category/preservation/PII registries, Zod schemas, on-demand redaction primitives. All user stories depend on this phase.

**CRITICAL**: No user story work can begin until this phase is complete.

### Schema & Enums

- [X] T002 Add new enums to `apps/backend/prisma/schema.prisma`: `AuditRetentionCategory` (`FINANCIAL` / `OPERATIONAL_CRITICAL` / `OPERATIONAL_GENERAL`), `AuditRedactionStatus` (`NONE` / `PARTIAL` / `FULL` / `IN_PROGRESS`), `PreservationRuleType` (`CROSS_CHECK` / `ACTIVE_DISPUTE` / `LEGAL_HOLD`), `ErasureRequestStatus` (`PENDING` / `SCANNING` / `PREVIEW` / `CONFIRMED` / `EXECUTING` / `COMPLETED` / `FAILED`).
- [X] T003 Extend `AuditLog` model in `apps/backend/prisma/schema.prisma` — add `retention_category` (`AuditRetentionCategory?`), `redaction_status` (`AuditRedactionStatus @default(NONE)`), `cold_storage` (`Boolean @default(false)`), `preservation_rule_id` (`String?` FK to `audit_preservation_rules`). Add indexes on `(retention_category, created_at)` and `(redaction_status)`.
- [X] T004 Extend `TenantPortalActivity` model in `apps/backend/prisma/schema.prisma` — add `retention_category` (nullable enum), `redaction_status` (default `NONE`), `cold_storage` (default false). No preservation rule FK (cross-check rule does not apply to this table).
- [X] T005 [P] Add `AuditRetentionCategoryConfig` Prisma model in `apps/backend/prisma/schema.prisma` — fields: `id`, `name` (`AuditRetentionCategory` unique), `retention_years` (`Int`), `hard_delete_enabled` (`Boolean @default(false)`), `description` (`String?`), `action_patterns_json` (`Json` default `[]`), `created_at`, `updated_at`.
- [X] T006 [P] Add `AuditPreservationRule` Prisma model in `apps/backend/prisma/schema.prisma` — fields: `id`, `name`, `rule_type` (`PreservationRuleType`), `entity_type` (`String?`), `entity_id` (`String?`), `tenant_id` (`String?` — nullable for platform-wide), `is_active` (`Boolean @default(true)`), `created_by_user_id`, `created_at`, `updated_at`. Indexes on `(rule_type, is_active)`, `(entity_type, entity_id)`.
- [X] T007 [P] Add `AuditLegalHold` Prisma model in `apps/backend/prisma/schema.prisma` — fields: `id`, `entity_type` (non-null), `entity_id` (non-null), `tenant_id` (`String?`), `reason` (`String`), `placed_by_user_id`, `placed_at`, `released_by_user_id` (`String?`), `released_at` (`DateTime?`), `is_active` (`Boolean @default(true)`). Index on `(entity_type, entity_id, is_active)`.
- [X] T008 [P] Add `PiiFieldMapping` Prisma model in `apps/backend/prisma/schema.prisma` — fields: `id`, `action_pattern` (`String`), `json_field_path` (`String`), `classification` (`String` — `direct` / `sensitive_financial` / `unstructured`), `requires_manual_review` (`Boolean @default(false)`), `created_at`, `updated_at`. Unique on `(action_pattern, json_field_path)`.
- [X] T009 [P] Add `DataSubjectErasureRequest` Prisma model in `apps/backend/prisma/schema.prisma` — fields: `id`, `subject_identifier_type` (`String`), `subject_identifier_value` (`String`), `resolved_pii_values_json` (`Json?`), `status` (`ErasureRequestStatus`), `entries_found_count` (`Int?`), `entries_redacted_count` (`Int?`), `entries_flagged_for_review_count` (`Int?`), `completion_report_json` (`Json?`), `initiated_by_user_id`, `initiated_at`, `completed_at` (`DateTime?`).
- [X] T010 Add `audit_logs_archive` table in `apps/backend/prisma/schema.prisma` — same column set as `AuditLog` (all columns nullable-compatible, same FKs dropped to avoid cross-table constraints). Index on `(created_at)` and `(entity_type, entity_id)` for query parity with hot.
- [X] T011 Add `tenant_portal_activities_archive` table in `apps/backend/prisma/schema.prisma` — same column set as `TenantPortalActivity` with FKs relaxed.
- [X] T012 Create migration SQL at `apps/backend/prisma/migrations/20260413000000_audit_retention_pii_redaction/migration.sql` — assembled from T002..T011 into a single additive DDL file. Include seed inserts for `AuditRetentionCategoryConfig` rows (`FINANCIAL` 7y, `OPERATIONAL_CRITICAL` 5y, `OPERATIONAL_GENERAL` 2y, all with `hard_delete_enabled = false`). Seed rows for `PiiFieldMapping` MUST combine **two sources** to fully cover FR-012: (a) the existing `PII_REGISTRY` in `pii-redaction.ts` verbatim (every current `(actionPrefix, fieldPath)` tuple — names, emails, phones across user/inspector/auth/portal/appointment contacts), **AND** (b) the following FR-012 additions that are NOT in the existing registry — each seeded explicitly with the classification required by the spec:
  - `(action_pattern: 'inspector.', json_field_path: 'paymentSettingsJson', classification: 'sensitive_financial', requires_manual_review: false)` — entire field is replaced with `[REDACTED]` on erasure (FR-017 opaque block)
  - `(action_pattern: 'appointment.status_transition', json_field_path: 'metadata.inspectorName', classification: 'direct', requires_manual_review: false)` — per-subject value redaction
  - `(action_pattern: 'appointment.', json_field_path: 'customFieldsJson', classification: 'unstructured', requires_manual_review: true)` — flagged for manual operator review during erasure (FR-018)
  - `(action_pattern: 'portal.', json_field_path: 'secondaryEmail', classification: 'direct', requires_manual_review: false)` — FR-012 tenant portal additions
  - `(action_pattern: 'portal.', json_field_path: 'secondaryPhone', classification: 'direct', requires_manual_review: false)` — FR-012 tenant portal additions

  The seed MUST NOT silently drop any of these five additions. Add a verification step at the end of the migration: a `SELECT COUNT(*) FROM pii_field_mappings` that is asserted by T013's post-migration check to be `>= (existing_registry_count + 5)`.
- [X] T013 Apply migration and regenerate Prisma client: `cd apps/backend && pnpm exec prisma format && pnpm exec prisma validate && pnpm exec prisma migrate dev --name audit_retention_pii_redaction && pnpm exec prisma generate`. Verify no existing audit tests break.

### Shared Zod Schemas

- [X] T014 [P] Add `auditRetentionCategorySchema`, `auditRedactionStatusSchema`, `preservationRuleTypeSchema`, `erasureRequestStatusSchema` enums in `packages/shared/src/schemas/audit.ts`.
- [X] T015 [P] Add `listAuditLogsQuerySchema` extension in `packages/shared/src/schemas/audit.ts` — add optional `includeArchived: z.coerce.boolean().default(false)` to the existing query schema.
- [X] T016 [P] Add `auditLogResponseSchema` extension in `packages/shared/src/schemas/audit.ts` — add `isArchived: z.boolean()`, `retentionCategory: auditRetentionCategorySchema.nullable()`, `redactionStatus: auditRedactionStatusSchema`.
- [X] T017 [P] Add `upsertRetentionCategorySchema` + `preservationRuleSchema` + `legalHoldSchema` + `piiFieldMappingSchema` + `dataSubjectErasureRequestSchema` response/input Zod bundles in `packages/shared/src/schemas/audit.ts`. Export inferred types.
- [X] T018 [P] Add `triggerRetentionRunQuerySchema` (`{ fromDate, toDate }`) and `listRetentionRunsQuerySchema` (`{ page, pageSize, fromDate, toDate }`) in `packages/shared/src/schemas/audit.ts`.
- [X] T019 Rebuild shared package: `pnpm --filter @properfy/shared build` — verify clean build with no type errors.

### Domain Entities

- [X] T020 Extend `AuditLogEntity` at `apps/backend/src/modules/audit/domain/audit-log.entity.ts` — add `retentionCategory: AuditRetentionCategory | null`, `redactionStatus: AuditRedactionStatus`, `coldStorage: boolean`, `preservationRuleId: string | null` to `AuditLogProps` and the class fields.
- [X] T021 [P] Create `AuditRetentionCategoryConfigEntity` at `apps/backend/src/modules/audit/domain/audit-retention-category.entity.ts` — fields per T005.
- [X] T022 [P] Create `AuditPreservationRuleEntity` at `apps/backend/src/modules/audit/domain/audit-preservation-rule.entity.ts` — fields per T006 + `matches(entityType, entityId, tenantId): boolean` method.
- [X] T023 [P] Create `AuditLegalHoldEntity` at `apps/backend/src/modules/audit/domain/audit-legal-hold.entity.ts` — fields per T007 + `isActive(): boolean` + `release(userId): void` methods.
- [X] T024 [P] Create `PiiFieldMappingEntity` at `apps/backend/src/modules/audit/domain/pii-field-mapping.entity.ts` — fields per T008 + `appliesTo(action): boolean` method.
- [X] T025 [P] Create `DataSubjectErasureRequestEntity` at `apps/backend/src/modules/audit/domain/data-subject-erasure-request.entity.ts` — fields per T009 + state-machine methods `markScanning`, `markPreview`, `markExecuting`, `markCompleted`, `markFailed`.
- [X] T026 [P] Create `IErasurePiiResolver` interface at `apps/backend/src/modules/audit/domain/erasure-pii-resolver.ts` — `resolve(input: { type: 'user_id' | 'email' | 'phone'; value: string }): Promise<{ canonicalUserId: string | null; piiValues: string[] }>`.
- [X] T027 [P] Add audit-retention-specific errors to `apps/backend/src/modules/audit/domain/audit.errors.ts` (create file if absent): `RetentionCategoryNotFoundError`, `RetentionPeriodTooShortError` (for the min-retention constraint), `PreservationRuleConflictError`, `LegalHoldAlreadyReleasedError`, `ErasureRequestNotFoundError`, `ErasureRequestInvalidStateError`, `ErasureForbiddenError`, `RetentionPolicyForbiddenError`, `PiiMappingNotFoundError`.

### Repositories & infrastructure

- [X] T028 Extend `IAuditLogRepository` interface at `apps/backend/src/modules/audit/domain/audit-log.repository.ts` — add `findAll(filters, pagination, options: { includeArchived?: boolean })`, `findByIds(ids: string[])`, `updateRedactionStatus(ids: string[], status: AuditRedactionStatus)`, `moveToCold(ids: string[])`, `hardDelete(ids: string[])`, `searchPiiByValues(values: string[], options: { includeArchived: boolean })`, `countEligibleForRetention(category, cutoffDate)`.
- [X] T028a Extend `IUserManagementRepository` at `apps/backend/src/modules/user/domain/user-management.repository.ts` — add `findByPhone(phone: string): Promise<UserEntity | null>`. Implement it in `PrismaUserManagementRepository` at `apps/backend/src/modules/user/infrastructure/prisma-user-management.repository.ts` (mirrors the existing `findByEmail` path: `prisma.user.findFirst({ where: { phone, deleted_at: null } })`). **This method is required by `FR-019b`**: when a data subject erasure request is initiated with `{ type: 'phone', value: ... }`, the erasure PII resolver (T040) MUST resolve the canonical user via this lookup before walking the historical PII set. Without it, the phone-input path in T040 / T094 cannot be implemented. No call-site changes to existing code — this is a pure interface + implementation extension.
- [X] T029 [P] Create `IAuditRetentionCategoryRepository` interface at `apps/backend/src/modules/audit/domain/audit-retention-category.repository.ts` — `findAll`, `findByName`, `save`, `update`.
- [X] T030 [P] Create `IAuditPreservationRuleRepository` interface at `apps/backend/src/modules/audit/domain/audit-preservation-rule.repository.ts` — `findAllActive`, `findByType`, `save`, `softDelete`.
- [X] T031 [P] Create `IAuditLegalHoldRepository` interface at `apps/backend/src/modules/audit/domain/audit-legal-hold.repository.ts` — `findActive`, `findByEntity`, `save`, `release`.
- [X] T032 [P] Create `IPiiFieldMappingRepository` interface at `apps/backend/src/modules/audit/domain/pii-field-mapping.repository.ts` — `findAll`, `findByAction`, `save`, `delete`.
- [X] T033 [P] Create `IDataSubjectErasureRequestRepository` interface at `apps/backend/src/modules/audit/domain/data-subject-erasure-request.repository.ts` — `findById`, `findAll`, `save`, `update`.
- [X] T034 Extend `PrismaAuditLogRepository` at `apps/backend/src/modules/audit/infrastructure/prisma-audit-log.repository.ts` — update `mapToEntity`, `save`, `update` to handle the new columns; implement all new methods from T028; `searchPiiByValues` uses a JSONB text search across PII field paths with `LIKE ANY`.
- [X] T035 [P] Implement `PrismaAuditRetentionCategoryRepository` at `apps/backend/src/modules/audit/infrastructure/prisma-audit-retention-category.repository.ts`.
- [X] T036 [P] Implement `PrismaAuditPreservationRuleRepository` at `apps/backend/src/modules/audit/infrastructure/prisma-audit-preservation-rule.repository.ts`.
- [X] T037 [P] Implement `PrismaAuditLegalHoldRepository` at `apps/backend/src/modules/audit/infrastructure/prisma-audit-legal-hold.repository.ts`.
- [X] T038 [P] Implement `PrismaPiiFieldMappingRepository` at `apps/backend/src/modules/audit/infrastructure/prisma-pii-field-mapping.repository.ts`.
- [X] T039 [P] Implement `PrismaDataSubjectErasureRequestRepository` at `apps/backend/src/modules/audit/infrastructure/prisma-data-subject-erasure-request.repository.ts`.
- [X] T040 Implement `PrismaErasurePiiResolver` at `apps/backend/src/modules/audit/infrastructure/prisma-erasure-pii-resolver.ts` — `user_id` input path resolves via `users` repository; email/phone input path first resolves the canonical user via `users` then falls through; walks `audit_logs` lifecycle entries (`user.created`, `user.updated`, `inspector.created`, `inspector.updated`) to collect historical `name` / `email` / `phone` values; returns deduplicated set.

### Classification helper + read-masking primitives

- [X] T041 Extend `audit-retention.ts` at `apps/backend/src/modules/audit/domain/audit-retention.ts` — add `getCategoryForAction(action): AuditRetentionCategory` helper that maps `financial.` / `billing.` / `invoice.` / `refund.` / `manualAdjustment.` → `FINANCIAL`, `auth.loginSuccess` / `auth.refreshToken` / `auth.tokenVerified` / `portal.view` / `read.*` → `OPERATIONAL_GENERAL`, everything else → `OPERATIONAL_CRITICAL`. Keep the hardcoded tier constants as fallback used by tests and bootstrap.
- [X] T042 Create `ClassifyAuditActionUseCase` at `apps/backend/src/modules/audit/application/use-cases/classify-audit-action.use-case.ts` — thin wrapper around `getCategoryForAction` with an optional DB-backed override path (reads from `IAuditRetentionCategoryRepository` when categories have custom `action_patterns_json`).
- [X] T043 [P] Create `pii-read-mask.ts` at `apps/backend/src/modules/audit/domain/pii-read-mask.ts` — pure functions `maskEmail(value, role): string` (OP → `use***@example.com`; CL_ADMIN → `[MASKED]`; AM → raw), `maskPhone(value, role): string` (OP → `***9999`; CL_ADMIN → `[MASKED]`), `maskName(value, role): string` (OP → `J. D.`; CL_ADMIN → `[MASKED]`).

### Typecheck Checkpoint

- [X] T044 Run `pnpm --filter backend typecheck` — should be clean. Fix any fallout from the entity / repository signature changes in callers.
- [X] T045 Run `pnpm --filter backend test` — existing audit tests (`list-audit-logs.use-case.test.ts`, `audit-retention.worker.test.ts`) must still pass. This is a foundational checkpoint: the migration applied cleanly, entities and repositories were extended additively, and nothing downstream broke.

**Checkpoint**: schema migration applied; entities and repositories extended; shared schemas published; classification helper + read-mask primitives ready. No behavior change to the write path, read path, or worker yet.

---

## Phase 3: User Story 1 — Audit Retention by Category (Priority: P1) 🎯 CRITICAL PATH

**Goal**: Replace the current hard-delete retention worker with a hot → cold → explicit-hard-delete lifecycle, extend the inline cross-check preservation rule with DB-backed preservation rules and legal holds, reverse the write-time PII destruction, and produce a self-audit entry on every run. Off-peak scheduling is preserved (`30 3 * * *`); batch size becomes configurable via `AUDIT_RETENTION_BATCH_SIZE`.

**Independent Test**: Seed a mixed audit dataset spanning each retention tier + a legacy `DONE` appointment (with `done_marked_by_user_id = NULL` and `done_checked_at = NULL`) + a financial entry past 7 years + a regular `user.updated` entry past 5 years. Run the worker. Verify (a) the cross-check entry stays in `audit_logs`, (b) the financial entry stays in `audit_logs` (7y tier), (c) the user.updated entry is in `audit_logs_archive` and not in `audit_logs`, (d) a `audit.retention_run_completed` meta-audit entry was written with the correct summary. Verify `PersistentAuditService.log()` no longer destroys PII at write time.

**Why this priority**: US1 is the foundation for everything else — without the retention tiers and hot/cold separation, read masking (US4) and erasure (US3) have no target surface. This wave contains the **two critical behavior reversals**: (1) removing the write-time PII destruction and (2) replacing hard delete with hot→cold move.

### Tests for US1 (write BEFORE implementation)

- [X] T046 [P] [US1] Extend `apps/backend/tests/unit/audit/audit-retention.worker.test.ts` — **hot → cold move semantics**: given 20 eligible `user.updated` entries past 5 years and batch size 5, the worker moves them to `audit_logs_archive` in 4 batches and the `audit_logs` table no longer contains them.
- [X] T047 [P] [US1] Extend `audit-retention.worker.test.ts` — **cross-check preservation invariant (FR-008)**: given an `appointment.status_transition` entry older than 5 years where `after_json.status = 'DONE'` and the linked appointment has `done_checked_at IS NULL`, the worker MUST NOT move the entry to cold. This covers the 006 dependency.
- [X] T048 [P] [US1] Extend `audit-retention.worker.test.ts` — **financial evidence preservation (FR-033)**: given a `financial.entry_created` entry from 6 years ago and the `FINANCIAL` tier's 7-year retention, the worker MUST NOT move the entry even though it's past the general 5-year tier.
- [X] T049 [P] [US1] Extend `audit-retention.worker.test.ts` — **legal hold preservation (FR-010)**: given an active `AuditLegalHold` on `(entity_type='Appointment', entity_id='X')`, the worker MUST NOT move any audit entry where `entity_type='Appointment' AND entity_id='X'`, regardless of age or category.
- [X] T050 [P] [US1] Extend `audit-retention.worker.test.ts` — **concurrency with erasure (FR-006 + redaction_status)**: given 10 entries with `redaction_status = 'IN_PROGRESS'`, the worker MUST skip them and process the other eligible rows.
- [X] T051 [P] [US1] Extend `audit-retention.worker.test.ts` — **configurable batch size**: given `AUDIT_RETENTION_BATCH_SIZE = 3`, the worker processes in batches of 3. Default remains 1000 when the env var is unset.
- [X] T052 [P] [US1] Extend `audit-retention.worker.test.ts` — **self-audit entry (FR-028)**: after a run that evaluates 100 entries, moves 30, preserves 50 (20 cross-check, 20 legal hold, 10 active-dispute-stub), hard-deletes 0, and errors 0, the worker writes exactly one `audit.retention_run_completed` entry with the matching summary in `metadata`.
- [X] T053 [P] [US1] Extend `audit-retention.worker.test.ts` — **error handling**: if one action's batch throws, the worker logs the error, proceeds to the next action, and still emits the self-audit entry with the error count reflected.
- [X] T054 [P] [US1] Extend `audit-retention.worker.test.ts` — **`tenant_portal_activities` second pass**: the worker runs the same hot→cold logic against `tenant_portal_activities` → `tenant_portal_activities_archive` and includes both in the self-audit summary.
- [X] T055 [P] [US1] Extend `audit-retention.worker.test.ts` — **hard-delete phase off by default**: with `hard_delete_enabled = false` on every category, no row is ever hard-deleted even when past retention + 1 year.
- [X] T056 [P] [US1] Extend `audit-retention.worker.test.ts` — **hard-delete phase when enabled**: with `hard_delete_enabled = true` on `OPERATIONAL_GENERAL`, rows in `audit_logs_archive` older than 2y + 1y = 3y are permanently deleted; rows in hot are untouched.
- [X] T057 [P] [US1] Extend `apps/backend/tests/unit/audit/audit-retention.ts.test.ts` (create if absent) — **category-to-action mapping**: `financial.billing_entry_created` → `FINANCIAL`, `auth.loginSuccess` → `OPERATIONAL_GENERAL`, `appointment.status_transition` → `OPERATIONAL_CRITICAL`, unknown action `foo.bar` → `OPERATIONAL_CRITICAL` (safest middle tier per FR-002).
- [X] T058 [P] [US1] Extend `apps/backend/tests/unit/audit/classify-audit-action.use-case.test.ts` — uses the category repository override when a category's `action_patterns_json` matches; falls back to the hardcoded mapping otherwise.
- [X] T059 [P] [US1] Extend `apps/backend/tests/unit/audit/persistent-audit.service.test.ts` (create if absent) — **write-time reversal**: after removing `redactPii()`, a write with `before_json: { email: 'foo@bar.com' }` is persisted with the email intact on the saved entity.
- [X] T060 [P] [US1] Extend `persistent-audit.service.test.ts` — **write-time category classification**: the saved entity's `retention_category` is derived from the action via `ClassifyAuditActionUseCase`.
- [X] T061 [US1] Integration test at `apps/backend/tests/integration/db/audit-retention-cross-check.integration.test.ts` — **006 cross-check invariance end-to-end**: 2 test blocks covering (a) preservation of legacy DONE appointment audit entry under retention pressure + fallback scan finds actor, (b) entry moves to archive once done_checked_at is set. Verified passing against real PostgreSQL 16 (testcontainers) with full migration chain. **This is the single most important test in 020.**
- [X] T062 [US1] Added to the same integration test file — **financial retention integrity end-to-end**: seeds a `financial.entry_created` entry from 6 years ago; runs the worker; asserts the entry stays in `audit_logs` (7y FINANCIAL tier honored). Verified passing.

### Implementation for US1

- [X] T063 [US1] **Reverse write-time redaction** at `apps/backend/src/modules/audit/application/services/persistent-audit.service.ts` — remove the two `redactPii()` calls. Keep the import line deleted. The saved `AuditLogEntity` now carries the raw `before` / `after` / `metadata` values.
- [X] T064 [US1] **Add write-time category classification** in the same file — inject `ClassifyAuditActionUseCase` (or the plain helper function) into the service's constructor; call it on each `log()` invocation to compute `retention_category` and set it on the entity before `auditLogRepo.save(entity)`.
- [X] T065 [US1] Update `apps/backend/src/modules/audit/domain/audit-log.entity.ts` — default `redactionStatus` to `'NONE'` and `coldStorage` to `false` in the constructor so existing callers that don't supply the new fields still compile (from T020 extension).
- [X] T066 [US1] Add `AUDIT_RETENTION_BATCH_SIZE` to `apps/backend/src/main/env.ts` — `z.coerce.number().int().positive().default(1000)`. Document in the env file header.
- [X] T067 [US1] **Reshape `AuditRetentionWorker`** at `apps/backend/src/modules/audit/infrastructure/workers/audit-retention.worker.ts` — inject the new deps: `IAuditRetentionCategoryRepository`, `IAuditPreservationRuleRepository`, `IAuditLegalHoldRepository`, `PersistentAuditService` (for the self-audit entry), plus the batch-size config. Replace the old signature.
- [X] T068 [US1] In the same file — **replace hard delete with hot→cold move**: for each batch of eligible ids, execute `INSERT INTO audit_logs_archive ... SELECT ... FROM audit_logs WHERE id = ANY($1)` followed by `DELETE FROM audit_logs WHERE id = ANY($1)` inside a single transaction.
- [X] T069 [US1] In the same file — **evaluate preservation rules** in order before each move/delete: (1) inline cross-check guard (unchanged from legacy), (2) active legal holds matching `(entity_type, entity_id, optional tenant_id)`, (3) active-dispute rule stub (returns `false` until a dispute surface exists — the rule type is declared in the registry but the evaluator no-ops). A single matching preservation rule is sufficient to exempt the entry per FR-011.
- [X] T070 [US1] In the same file — **skip `redaction_status = 'IN_PROGRESS'` rows** when selecting batches for the hot→cold move. This is the concurrency guard for US3.
- [X] T071 [US1] In the same file — **hard-delete sweep as a separate phase** at the end of the run. Only runs when the category's `hard_delete_enabled = true`. Targets rows in `audit_logs_archive` with `created_at < now - (retention + 1y)`. Hard-delete respects preservation rules unconditionally.
- [X] T072 [US1] In the same file — **second pass for `tenant_portal_activities`**: same hot→cold logic against `tenant_portal_activities` → `tenant_portal_activities_archive`. Tracked separately in the summary.
- [X] T073 [US1] In the same file — **emit a self-audit entry** at the end of each run via `PersistentAuditService.log()`: `{ action: 'audit.retention_run_completed', actorType: 'SYSTEM', entityType: 'AuditRetention', metadata: { entriesEvaluated, entriesMoved, entriesPreserved: { crossCheck, legalHold, activeDispute }, entriesHardDeleted, entriesErrored, durationMs, tenantPortalActivitiesMoved, tenantPortalActivitiesPreserved } }`. The entry contains no subject PII.
- [X] T074 [US1] In the same file — **error handling**: wrap each action's batch loop in try/catch; on error, log the error, increment `entriesErrored`, continue to the next action, still emit the self-audit entry.
- [X] T075 [US1] Register the reshaped worker in `apps/backend/src/main/container.ts` — inject the new dependencies (category repo, preservation rule repo, legal hold repo, persistent audit service, `env.AUDIT_RETENTION_BATCH_SIZE`). Pg-boss schedule in `main/workers.ts` is unchanged.
- [X] T076 [US1] Run US1 unit tests: `pnpm --filter backend test audit-retention.worker persistent-audit.service classify-audit-action` — all green.
- [X] T077 [US1] Run US1 integration tests: `pnpm --filter backend test:integration:db` — **006 cross-check invariance test PASSED** (4 files, 11 tests, all green including T061 + T062 + T111 concurrency). Verified 2026-04-17.
- [X] T078 [US1] Run full backend test suite: `pnpm --filter backend test` — 276 passed, 2 failed (pre-existing: update-appointment CL_USER permission + download-report — both unrelated to 020/audit/cross-check). **Zero regressions** in `perform-cross-check.use-case.test.ts`, `execute-status-transition.use-case.test.ts`, `audit-retention.worker.test.ts`, and the full audit suite. Verified 2026-04-17.

**Checkpoint**: retention worker does hot→cold with preservation rules; cross-check invariance verified under the new semantics; financial evidence preservation verified; write-time PII destruction reversed; self-audit entry produced; batch size configurable. **This is the critical-path checkpoint** — if it fails, 020 does not ship.

---

## Phase 4: User Story 2 — PII Classification and Redaction (Priority: P2)

**Goal**: Supply the redaction primitives (`redactByFieldPath`, opaque-block replacement, PII field registry lookup) that US3 (erasure workflow) consumes. This phase does NOT touch the write path (that was reversed in US1) — it only extends the helper used by on-demand redaction.

**Independent Test**: Given a JSON snapshot `{ user: { email: 'foo@bar.com', phone: '+1234' }, meta: { note: 'unchanged' } }` and a field-path list `['user.email', 'user.phone']`, `redactByFieldPath` produces `{ user: { email: '[REDACTED]', phone: '[REDACTED]' }, meta: { note: 'unchanged' } }`. Given `{ paymentSettingsJson: { bank: 'X', iban: 'Y' } }` and the opaque classification for that field, `redactByFieldPath` produces `{ paymentSettingsJson: '[REDACTED]' }` — the entire field value is replaced.

**Why this priority**: US2 provides the primitives US3 needs. It is small, isolated, and independent of US1's critical path.

### Tests for US2 (write BEFORE implementation)

- [X] T079 [P] [US2] Extend `apps/backend/tests/unit/audit/pii-redaction.test.ts` — **`redactByFieldPath` happy path**: replaces a single dotted path (`user.email`) with `[REDACTED]` without touching sibling fields.
- [X] T080 [P] [US2] Extend `pii-redaction.test.ts` — **multi-path redaction**: given `['user.email', 'user.phone']`, both are redacted in the same call.
- [X] T081 [P] [US2] Extend `pii-redaction.test.ts` — **non-matching path no-op**: paths that don't exist in the snapshot are silently skipped (no error, no mutation of unrelated fields).
- [X] T082 [P] [US2] Extend `pii-redaction.test.ts` — **opaque field replacement**: when the mapping classification is `'sensitive_financial'` (or any opaque marker), the entire field value is replaced with `[REDACTED]` regardless of whether it's an object or a string.
- [X] T083 [P] [US2] Extend `pii-redaction.test.ts` — **irreversibility**: the function returns a deep-cloned object with the redaction applied; the original is untouched (so callers can compare). This is used by the erasure workflow to build the diff.
- [X] T084 [P] [US2] Create `apps/backend/tests/unit/audit/pii-read-mask.test.ts` — **`maskEmail` per role**: `maskEmail('user@example.com', 'AM')` → `'user@example.com'` (raw), `maskEmail('user@example.com', 'OP')` → `'use***@example.com'`, `maskEmail('user@example.com', 'CL_ADMIN')` → `'[MASKED]'`.
- [X] T085 [P] [US2] Extend `pii-read-mask.test.ts` — **`maskPhone` per role**: AM raw, OP `'***9999'` (last 4 digits), CL_ADMIN `'[MASKED]'`. Handles Brazilian format `+5511999999999`.
- [X] T086 [P] [US2] Extend `pii-read-mask.test.ts` — **`maskName` per role**: AM raw, OP `'J. D.'` (first initial + last initial), CL_ADMIN `'[MASKED]'`.
- [X] T087 [P] [US2] Extend `pii-read-mask.test.ts` — **edge cases**: empty string, null, undefined → masking functions return the input unchanged (graceful degradation).

### Implementation for US2

- [X] T088 [US2] Extend `apps/backend/src/modules/audit/application/helpers/pii-redaction.ts` — add `redactByFieldPath(snapshot: unknown, paths: Array<{ path: string; classification: 'direct' | 'sensitive_financial' | 'unstructured' }>): unknown` function. Uses the existing `setNestedValue` helper for `'direct'` paths; replaces the entire field for `'sensitive_financial'` (opaque); flags `'unstructured'` but does not mutate.
- [X] T089 [US2] In the same file — keep `redactPii(action, snapshot)` exported but mark it `@deprecated` with a TSDoc note pointing to `redactByFieldPath` and the on-demand erasure workflow. No call sites remain after T063.
- [X] T090 [US2] Implement `apps/backend/src/modules/audit/domain/pii-read-mask.ts` (created as interface in T043) — fill in `maskEmail`, `maskPhone`, `maskName` per the FR-025 shapes, matching the tests from T084..T087.
- [X] T091 [US2] Run US2 tests: `pnpm --filter backend test pii-redaction pii-read-mask` — all green.

**Checkpoint**: on-demand redaction primitives and read-time masking primitives are ready. Neither is wired into a use case yet — that happens in US3 and US4.

---

## Phase 5: User Story 3 — Data Subject Erasure Request Workflow (Priority: P3) 🎯 LGPD COMPLIANCE

**Goal**: Deliver the end-to-end erasure workflow: AM creates a request → system resolves historical PII for the subject → scans hot + cold + `tenant_portal_activities` → presents a preview → AM confirms → worker redacts in place → meta-audit entry is written without subject PII.

**Independent Test**: Seed a user with a history of 3 email changes (`user.updated` audit entries) over 2 years. Create an erasure request via `POST /v1/audit-erasure-requests` with `{ type: 'user_id', value: userId }`. Verify the preview shows all entries containing any of the 3 historical emails (hot + cold tiers). Confirm via `POST /v1/audit-erasure-requests/:id/confirm`. Verify the entries are now `[REDACTED]` in the PII fields but queryable by entity id. Verify the `audit.data_subject_erasure_executed` meta-audit entry exists and carries **no subject PII**.

**Why this priority**: US3 is the LGPD compliance deliverable. It depends on Phase 2 primitives (PII registry, erasure request entity) + US1 (hot/cold tiers must exist for the scan to cover both) + US2 (redaction helper).

### Tests for US3 (write BEFORE implementation)

- [X] T092 [P] [US3] Create `apps/backend/tests/unit/audit/prisma-erasure-pii-resolver.test.ts` — **user_id input path**: given a user with 3 email changes in `user.updated` audit history, the resolver returns the deduplicated set `[email1, email2, email3, userName, userPhone]` (including current + historical values).
- [X] T093 [P] [US3] Extend `prisma-erasure-pii-resolver.test.ts` — **email input path**: given `{ type: 'email', value: 'foo@bar.com' }`, the resolver first resolves the canonical `userId` via `UserRepository.findByEmail`, then applies the same historical lookup strategy.
- [X] T094 [P] [US3] Extend `prisma-erasure-pii-resolver.test.ts` — **phone input path**: same strategy as email, via `findByPhone`.
- [X] T095 [P] [US3] Extend `prisma-erasure-pii-resolver.test.ts` — **missing user graceful handling**: given a `user_id` that does not exist, the resolver returns `{ canonicalUserId: null, piiValues: [] }` instead of throwing.
- [X] T096 [P] [US3] Create `apps/backend/tests/unit/audit/preview-data-subject-erasure.use-case.test.ts` — **AM-only enforcement**: OP and CL_ADMIN calls are rejected with `ErasureForbiddenError`.
- [X] T097 [P] [US3] Extend `preview-data-subject-erasure.use-case.test.ts` — **per-category + per-tier counts**: given 5 hot `FINANCIAL` + 3 cold `FINANCIAL` + 10 hot `OPERATIONAL_CRITICAL` matches, the preview returns `{ totalFound: 18, byCategory: { FINANCIAL: 8, OPERATIONAL_CRITICAL: 10 }, byTier: { hot: 15, cold: 3 } }`.
- [X] T098 [P] [US3] Extend `preview-data-subject-erasure.use-case.test.ts` — **customFieldsJson flagged**: entries matching by `customFieldsJson` without a corresponding PII registry entry are returned in `entriesFlaggedForReview` rather than `entriesFound`.
- [X] T099 [P] [US3] Extend `preview-data-subject-erasure.use-case.test.ts` — **`tenant_portal_activities` scan**: the preview scans the parallel PII surface and includes its matches in the total.
- [X] T100 [P] [US3] Create `apps/backend/tests/unit/audit/execute-data-subject-erasure.use-case.test.ts` — **AM-only enforcement**.
- [X] T101 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **IN_PROGRESS marking**: the use case sets `redaction_status = 'IN_PROGRESS'` on all target ids atomically before iterating.
- [X] T102 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **redaction via `redactByFieldPath`**: given a mixed entry with PII in `before_json.email` and `after_json.email`, both are redacted; non-PII fields (`action`, `entity_id`, `actor_id`, `created_at`) are untouched (FR-015).
- [X] T103 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **multiple subjects isolation**: given an entry containing both subject A's and subject B's PII, erasing A redacts only A's values; B's data is preserved.
- [X] T104 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **paymentSettingsJson opaque**: the entire `paymentSettingsJson` field is replaced with `[REDACTED]` regardless of its internal structure.
- [X] T105 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **meta-audit without subject PII**: the emitted `audit.data_subject_erasure_executed` entry contains `{ subjectIdentifierType, entriesFound, entriesRedacted, entriesFlaggedForReview }` but **no email, phone, or name values** from the subject.
- [X] T106 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **`redaction_status` transition**: after successful redaction of all known PII paths, status becomes `FULL`; if any paths require manual review, status becomes `PARTIAL`.
- [X] T107 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **idempotency on already-erased entries**: a second erasure call for the same subject is a no-op on entries already `FULL`.
- [X] T108 [P] [US3] Extend `execute-data-subject-erasure.use-case.test.ts` — **`DataSubjectErasureRequest` lifecycle**: the request transitions `PENDING` → `SCANNING` → `PREVIEW` → `CONFIRMED` → `EXECUTING` → `COMPLETED` with timestamps.
- [x] T109 [US3] Create integration test `apps/backend/tests/integration/db/audit-erasure.integration.test.ts` — **end-to-end erasure flow**: seeds 3 audit entries containing victim email, runs `ExecuteDataSubjectErasureUseCase` against real DB, verifies PII is `[REDACTED]`, meta-audit entry exists without subject PII, request status is `COMPLETED`. *(Delivered 2026-04-21 — 2 tests green)*
- [x] T110 [US3] Irreversibility — re-query after erasure confirms `[REDACTED]` persists with no recovery path; idempotent re-run on same subject returns `COMPLETED` cleanly. *(Delivered 2026-04-21 — same test file, second case)*
- [x] T111 [US3] Concurrency integration test `apps/backend/tests/integration/db/retention-erasure-concurrency.integration.test.ts` — retention vs redaction race covered end-to-end (W-3 harness). *(Pre-existing — verified 2026-04-17 per T077; re-confirmed passing 2026-04-21)*

### Implementation for US3

> **Implementation ordering note**: although the task IDs below run in numeric order (T112 → T113 → T114 → T115), the actual **execution order** must be **T114 → T115 → T113 → T112** because the helpers (T114 `searchPiiByValues` and T115 `searchPiiInTenantPortalActivities`) are consumed by the preview use case (T113) and the execute use case (T112). Land the repository methods first, then the use cases that call them. The task IDs were kept in numeric order for readability of the use-case-first narrative; dependency order takes precedence at build time.

- [X] T112 [US3] Implement `ExecuteDataSubjectErasureUseCase` at `apps/backend/src/modules/audit/application/use-cases/execute-data-subject-erasure.use-case.ts` — constructor deps: `IDataSubjectErasureRequestRepository`, `IAuditLogRepository`, `IPiiFieldMappingRepository`, `IErasurePiiResolver`, `PersistentAuditService`, `AuthorizationService`. Execute flow: (1) load the request, (2) assert AM, (3) re-fetch target ids from the scan (persisted on the request), (4) call `auditLogRepo.updateRedactionStatus(ids, 'IN_PROGRESS')`, (5) iterate each id: fetch entity, apply `redactByFieldPath` with the registry entries that match the action, update via `auditLogRepo.update`, transition status to `FULL` (or `PARTIAL` if any path requires manual review), (6) emit `audit.data_subject_erasure_executed` meta-audit entry, (7) mark the request `COMPLETED`.
- [X] T113 [US3] Implement `PreviewDataSubjectErasureUseCase` at `apps/backend/src/modules/audit/application/use-cases/preview-data-subject-erasure.use-case.ts` — constructor deps: `IDataSubjectErasureRequestRepository`, `IErasurePiiResolver`, `IAuditLogRepository`, `IPiiFieldMappingRepository`, `AuthorizationService`. Execute flow: (1) assert AM, (2) create / load a `DataSubjectErasureRequest`, (3) transition to `SCANNING`, (4) call `piiResolver.resolve(input)` to get historical PII values, (5) call `auditLogRepo.searchPiiByValues(values, { includeArchived: true })` to get hot + cold matches, (6) ALSO scan `tenant_portal_activities` + `tenant_portal_activities_archive` via a dedicated repository method (or inline raw SQL), (7) classify matches by category + tier + `flaggedForReview`, (8) persist the preview on the request (`entries_found_count`, `entries_flagged_for_review_count`, `resolved_pii_values_json`), (9) transition to `PREVIEW`.
- [X] T114 [US3] Add `searchPiiByValues` implementation in `prisma-audit-log.repository.ts` — for each registered PII field path, build a JSONB text-search clause matching any of the resolved values, UNION across hot + cold if `includeArchived = true`.
- [X] T115 [US3] Add `searchPiiInTenantPortalActivities` helper in the same repository (or a new `prisma-tenant-portal-activity-pii-scanner.ts` under `audit/infrastructure/`) — same logic against the `previous_values_json` / `new_values_json` columns. The helper MUST scan **both tiers**: `tenant_portal_activities` (hot) AND `tenant_portal_activities_archive` (cold). Returns a merged result set so the preview use case (T113) can present per-tier counts on the erasure preview. Verify behavior via the T099 test which asserts the scan covers both tables.
- [X] T116 [US3] Create `audit-erasure.routes.ts` at `apps/backend/src/modules/audit/interfaces/audit-erasure.routes.ts` — new routes file (explicitly isolated from `audit.routes.ts` for security visibility).
- [X] T117 [US3] Add `POST /v1/audit-erasure-requests` in `audit-erasure.routes.ts` — AM only via `authenticate` + `assertRoles(['AM'])`; input validated with `dataSubjectErasureRequestSchema`; calls `PreviewDataSubjectErasureUseCase`; returns the request id + preview.
- [X] T118 [US3] Add `GET /v1/audit-erasure-requests/:id` in the same file — AM only; returns the current request state + preview metadata.
- [X] T119 [US3] Add `POST /v1/audit-erasure-requests/:id/confirm` in the same file — AM only; calls `ExecuteDataSubjectErasureUseCase`; returns the completion report.
- [X] T120 [US3] Add `GET /v1/audit-erasure-requests` in the same file — paginated list of historical requests (AM only).
- [X] T121 [US3] Wire new routes in `apps/backend/src/main/routes.ts` (or wherever audit routes are registered) — import and call `registerAuditErasureRoutes`.
- [X] T122 [US3] Register use cases in `apps/backend/src/main/container.ts` — `PreviewDataSubjectErasureUseCase`, `ExecuteDataSubjectErasureUseCase`, `PrismaErasurePiiResolver`, new repositories.
- [X] T123 [US3] Extend `AuditRouteContainer` (or equivalent) in `audit.routes.ts` interface to declare the new dependencies so the container can pass them through.
- [X] T124 [US3] Run US3 unit tests: `pnpm --filter backend test preview-data-subject-erasure execute-data-subject-erasure prisma-erasure-pii-resolver` — all green.
- [x] T125 [US3] Run US3 integration tests: both `tests/integration/db/audit-erasure.integration.test.ts` (T109/T110, 2 tests) and `tests/integration/db/retention-erasure-concurrency.integration.test.ts` (T111, 1 test) pass against real PostgreSQL via Testcontainers. *(Verified 2026-04-21)*

**Checkpoint**: erasure workflow works end-to-end across hot + cold + `tenant_portal_activities`; meta-audit entry produced without subject PII; concurrency with retention verified; irreversibility verified. LGPD compliance surface is delivered.

---

## Phase 6: User Story 4 — Audience-Aware Audit Views (Priority: P4)

**Goal**: Extend `ListAuditLogsUseCase` with role-based read-time masking (AM raw / OP partial / CL_ADMIN blanket `[MASKED]`), the `[REDACTED]` sentinel for already-erased entries, the `includeArchived` query parameter (AM/OP only), and the `isArchived` marker in the response.

**Independent Test**: Query `/v1/audit-logs` as AM, OP, and CL_ADMIN on the same seeded entry containing `email`, `phone`, and `name` in the JSONB snapshot. AM sees raw values. OP sees `use***@example.com`, `***1234`, `J. D.`. CL_ADMIN sees `[MASKED]`. Query with `includeArchived=true` as AM — archived entries returned with `isArchived: true`. Same query as CL_ADMIN with `includeArchived=true` → 403.

**Why this priority**: US4 closes 011#GAP-002 (CL_ADMIN audit read access) and delivers the spec's data-minimization surface. It depends on Phase 2 primitives and the US1 hot/cold separation. It is **independent of US3** (erasure) and can ship in parallel with it after Phase 2.

### Tests for US4 (write BEFORE implementation)

- [X] T126 [P] [US4] Extend `apps/backend/tests/unit/audit/list-audit-logs.use-case.test.ts` — **AM sees raw PII on unredacted entries**: given an entry with `before_json.email = 'user@example.com'`, AM sees `'user@example.com'` in the response.
- [X] T127 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **OP partial masking**: OP sees `'use***@example.com'`, `'***9999'`, and `'J. D.'` respectively for email, phone, and name in the snapshot.
- [X] T128 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **CL_ADMIN blanket `[MASKED]`**: unchanged behavior from existing code, re-verified under the new field-path registry lookup path.
- [X] T129 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **`[REDACTED]` sentinel for fully-erased entries**: given an entry with `redaction_status = 'FULL'` and `before_json.email = '[REDACTED]'`, all three roles see `'[REDACTED]'` in the response — read-time masking does NOT apply (FR-027).
- [X] T130 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **mixed redaction_status in same result set**: given 3 entries (one `NONE`, one `PARTIAL`, one `FULL`), each is masked appropriately per role.
- [X] T131 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **`includeArchived = false` (default)**: only hot entries returned.
- [X] T132 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **`includeArchived = true` as AM**: hot + cold entries merged, sorted by `created_at desc`, each carrying `isArchived` correctly.
- [X] T133 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **`includeArchived = true` as OP**: same behavior as AM (OP is also allowed to opt in).
- [X] T134 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **`includeArchived = true` as CL_ADMIN → 403**: rejected with a clear error (FR-026a).
- [X] T135 [P] [US4] Extend `list-audit-logs.use-case.test.ts` — **`isArchived` marker**: hot entries carry `isArchived: false`, cold entries carry `isArchived: true`.
- [x] T136 [US4] Extend `apps/backend/tests/integration/audit/audit.routes.test.ts` — **`includeArchived` query param end-to-end**: supertest call with the param; verify the merged response shape. *(Delivered — 4 new tests: AM pass-through, OP pass-through, CL_ADMIN→403, default→false; all 7 tests green — 2026-04-22)*

### Implementation for US4

- [X] T137 [US4] Extend `ListAuditLogsUseCase` at `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.ts` — inject `IPiiFieldMappingRepository` to load the PII field registry at use-case time (or cache it at construction time if the registry is small).
- [X] T138 [US4] In the same file — **apply role-based masking via the registry**: for each response entry, look up the matching `PiiFieldMapping` entries by `action`, then for each field path apply `maskEmail` / `maskPhone` / `maskName` (from `pii-read-mask.ts`) based on the actor role. Skip masking entirely when `redaction_status = 'FULL'` (already `[REDACTED]`).
- [X] T139 [US4] In the same file — **`[REDACTED]` vs `[MASKED]` sentinel distinction**: add a dedicated branch that checks `entry.redactionStatus === 'FULL'` and bypasses the masking functions. The DTO uses `[REDACTED]` from the stored value as-is.
- [X] T140 [US4] In the same file — **accept `includeArchived: boolean` parameter** on the input; if the actor role is `CL_ADMIN` and `includeArchived = true`, throw `ForbiddenError('INCLUDE_ARCHIVED_FORBIDDEN', 'CL_ADMIN cannot access archived audit entries')`.
- [X] T141 [US4] In the same file — **query both tables when `includeArchived = true`**: call a new repository method `findAllIncludingArchived(filters, pagination)` that UNIONs hot + cold and orders by `created_at desc`. Hot-only path stays on `findAll`.
- [X] T142 [US4] Extend `prisma-audit-log.repository.ts` — implement `findAllIncludingArchived` using a Prisma raw UNION ALL query or two sequential `findMany` calls merged and re-sorted in application code (pick whichever keeps the SQL simpler).
- [X] T143 [US4] In `list-audit-logs.use-case.ts` — **include `isArchived` marker** on each output DTO. Hot entries get `false`; cold entries get `true`. Propagate via the repository method.
- [X] T144 [US4] Extend `audit.routes.ts` at `apps/backend/src/modules/audit/interfaces/audit.routes.ts` — accept `includeArchived` query param via the extended `listAuditLogsQuerySchema` (from T015); pass through to the use case.
- [X] T145 [US4] Run US4 unit tests: `pnpm --filter backend test list-audit-logs.use-case` — all green.
- [x] T146 [US4] Run US4 integration tests: `pnpm --filter backend test audit.routes` — all green. *(Evidence: 7 tests passed — 2026-04-22)*

**Checkpoint**: AM sees raw PII on unredacted entries, OP sees partial masks, CL_ADMIN sees `[MASKED]`, fully-erased entries show `[REDACTED]` for all roles, archived entries queryable on opt-in only (AM/OP), CL_ADMIN blocked from opt-in. 011#GAP-002 fully closed with the role-based masking.

---

## Phase 7: User Story 5 — Operator Controls (Priority: P5)

**Goal**: Expose AM-only backend endpoints for managing retention categories, preservation rules, legal holds, PII field mappings, manual retention triggers, and the run history view. Every action is audited with before/after snapshots. **Backend only in the MVP** — a dedicated frontend console is a non-blocking follow-up.

**Independent Test**: As AM, call `PUT /v1/audit-retention/categories/FINANCIAL` to set `retention_years = 8`. Verify the audit entry `audit.retention_policy_updated` is written with before `{ retention_years: 7 }` and after `{ retention_years: 8 }`. Attempt to lower FINANCIAL to 5 years → rejected with `RETENTION_PERIOD_TOO_SHORT`. Place a legal hold on `(Appointment, appt-1)`. Run the worker manually via `POST /v1/audit-retention/runs` — verify the run summary in the response.

**Why this priority**: US5 provides operational visibility and control but is independent of the compliance functionality in US1..US4. It can ship in parallel with US3/US4 after Phase 2.

### Tests for US5 (write BEFORE implementation)

- [X] T147 [P] [US5] Create `apps/backend/tests/unit/audit/upsert-retention-category.use-case.test.ts` — **AM-only enforcement**; **minimum retention constraint**: trying to set `FINANCIAL` below 7 years throws `RetentionPeriodTooShortError`; valid upserts produce an audit entry.
- [X] T148 [P] [US5] Create `apps/backend/tests/unit/audit/upsert-preservation-rule.use-case.test.ts` — AM-only; create / activate / deactivate flows; audited with before/after.
- [X] T149 [P] [US5] Create `apps/backend/tests/unit/audit/place-legal-hold.use-case.test.ts` — AM-only; requires both `entity_type` and `entity_id`; tenant-scoped; audited.
- [X] T150 [P] [US5] Create `apps/backend/tests/unit/audit/release-legal-hold.use-case.test.ts` — AM-only; cannot release an already-released hold; audited.
- [X] T151 [P] [US5] Create `apps/backend/tests/unit/audit/upsert-pii-field-mapping.use-case.test.ts` — AM-only; enforces unique `(action_pattern, json_field_path)`; audited.
- [X] T152 [P] [US5] Create `apps/backend/tests/unit/audit/trigger-retention-run.use-case.test.ts` — AM-only; accepts optional `{ fromDate, toDate }`; scopes the worker's eligibility query to the range; returns the run summary; audited.
- [X] T153 [P] [US5] Create `apps/backend/tests/unit/audit/list-retention-runs.use-case.test.ts` — reads `audit.retention_run_completed` entries via `auditLogRepo.findAll({ action: 'audit.retention_run_completed' })`; AM/OP only.
- [x] T154 [US5] Create integration test `apps/backend/tests/integration/audit/audit-retention.routes.test.ts` — end-to-end flows for all new endpoints + RBAC checks (OP / CL_ADMIN / INSP → 403 on mutations, 200 on read-only endpoints where allowed). *(Delivered — 14 tests: RBAC block, GET categories, GET runs, POST runs, GET rules, GET pii-mappings; all green)*

### Implementation for US5

- [X] T155 [US5] Implement `UpsertRetentionCategoryUseCase` at `apps/backend/src/modules/audit/application/use-cases/upsert-retention-category.use-case.ts` — AM-only via `AuthorizationService.assertRoles(['AM'])`; validate `retention_years >= CATEGORY_MINIMUMS[name]` (`FINANCIAL: 7`, `OPERATIONAL_CRITICAL: 5`, `OPERATIONAL_GENERAL: 2`); reject with `RetentionPeriodTooShortError` otherwise; audit with before/after.
- [X] T156 [P] [US5] Implement `UpsertPreservationRuleUseCase` at `apps/backend/src/modules/audit/application/use-cases/upsert-preservation-rule.use-case.ts` — AM-only; audit with before/after.
- [X] T157 [P] [US5] Implement `PlaceLegalHoldUseCase` at `apps/backend/src/modules/audit/application/use-cases/place-legal-hold.use-case.ts` — AM-only; require non-null `entity_type` + `entity_id`; audit.
- [X] T158 [P] [US5] Implement `ReleaseLegalHoldUseCase` at `apps/backend/src/modules/audit/application/use-cases/release-legal-hold.use-case.ts` — AM-only; reject if already released; audit.
- [X] T159 [P] [US5] Implement `UpsertPiiFieldMappingUseCase` at `apps/backend/src/modules/audit/application/use-cases/upsert-pii-field-mapping.use-case.ts` — AM-only; audit.
- [X] T160 [P] [US5] Implement `TriggerRetentionRunUseCase` at `apps/backend/src/modules/audit/application/use-cases/trigger-retention-run.use-case.ts` — AM-only; accepts optional date range and passes it to the worker; audits the manual trigger; returns the run summary.
- [X] T161 [P] [US5] Implement `ListRetentionRunsUseCase` at `apps/backend/src/modules/audit/application/use-cases/list-retention-runs.use-case.ts` — AM/OP; queries `audit_logs` filtered by `action = 'audit.retention_run_completed'` via the existing repository.
- [X] T162 [US5] Create `audit-retention.routes.ts` at `apps/backend/src/modules/audit/interfaces/audit-retention.routes.ts` — new routes file (separate from `audit.routes.ts` for organization).
- [X] T163 [US5] Add endpoints to `audit-retention.routes.ts`: `GET /v1/audit-retention/categories`, `PUT /v1/audit-retention/categories/:name` (AM), `GET /v1/audit-retention/rules`, `POST /v1/audit-retention/rules` (AM), `DELETE /v1/audit-retention/rules/:id` (AM), `POST /v1/audit-retention/legal-holds` (AM), `DELETE /v1/audit-retention/legal-holds/:id` (AM), `GET /v1/audit-retention/pii-mappings` (AM), `PUT /v1/audit-retention/pii-mappings/:id` (AM), `GET /v1/audit-retention/runs`, `POST /v1/audit-retention/runs` (AM).
- [X] T164 [US5] Wire new routes in `apps/backend/src/main/routes.ts` — register `registerAuditRetentionRoutes`.
- [X] T165 [US5] Register all new use cases in `apps/backend/src/main/container.ts`.
- [X] T166 [US5] Run US5 unit tests: `pnpm --filter backend test upsert-retention-category upsert-preservation-rule place-legal-hold release-legal-hold upsert-pii-field-mapping trigger-retention-run list-retention-runs` — all green.
- [x] T167 [US5] Run US5 integration tests: `pnpm --filter backend test audit-retention.routes` — all green. *(Evidence: 14 tests passed — 2026-04-22)*

**Checkpoint**: operators have full backend control of retention categories, preservation rules, legal holds, PII mappings, manual retention triggers, and run history. All actions are audited. A frontend console is explicitly deferred as non-blocking polish.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full verification, regression safety, manual smoke of the critical paths, residual documentation.

- [X] T168 Run full backend test suite: `pnpm --filter backend test` — all previously green tests must still pass. Zero regressions in the 006 `perform-cross-check.use-case.test.ts`, `execute-status-transition.use-case.test.ts`, or the 011 audit suite. This is the regression-safety gate.
- [X] T169 [P] Run typecheck on all workspaces: `pnpm typecheck` — clean exit.
- [X] T170 [P] Run lint on modified packages: `pnpm --filter backend lint && pnpm --filter @properfy/shared lint`. Pre-existing unrelated lint errors in other modules are out of scope per the 018/019 closure convention.
- [x] T171 Manual smoke — critical path 1: cross-check preservation. *(Superseded by DEC-019 — T061 testcontainers integration test proves cross-check preservation invariant against real PostgreSQL 16; manual smoke adds no additional safety guarantee)*
- [x] T172 Manual smoke — critical path 2: financial retention. *(Superseded by DEC-019 — T062 testcontainers integration test proves 7y financial retention against real PostgreSQL 16)*
- [x] T173 Manual smoke — critical path 3: erasure end-to-end. *(Superseded by DEC-019 — T109/T110 testcontainers integration tests prove erasure irreversibility and PII removal end-to-end against real PostgreSQL 16)*
- [x] T174 Manual smoke — critical path 4: masking tiers. *(Superseded by DEC-019 — T126-T135 unit tests + T144 route integration test cover all three masking tiers (AM raw, OP partial, CL_ADMIN [MASKED]) and the [REDACTED] bypass for erased entries)*
- [x] T175 Manual smoke — critical path 5: concurrency. *(Superseded by DEC-019 — T111 testcontainers integration test proves erasure/retention concurrency: worker skips IN_PROGRESS erasure rows against real PostgreSQL 16)*
- [X] T176 Document residuals in `plan.md` "Residual Risks and Assumptions" section — confirm the write-time reversal asymmetry is recorded (pre-020 entries permanently `[REDACTED]`), confirm the active-dispute rule is a stub until a dispute surface exists, confirm CL_ADMIN with `includeArchived=true` → 403 is the chosen policy.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — verification only
- **Foundational (Phase 2)**: depends on Phase 1 — BLOCKS all user stories (schema + entities + repositories + shared schemas + primitives)
- **US1 (Phase 3)**: depends on Phase 2 — **critical path** (retention worker reshape + write-time reversal)
- **US2 (Phase 4)**: depends on Phase 2 only — supplies primitives consumed by US3; can run in parallel with US1 implementation but the tests for US1 depend on T063 being done before T077
- **US3 (Phase 5)**: depends on Phase 2 + US2 (redaction primitives) + US1 (hot/cold tiers must exist for the scan) — **secondary critical path** for LGPD
- **US4 (Phase 6)**: depends on Phase 2 + US2 (read-mask primitives) + US1 (hot/cold tiers must exist for includeArchived) — independent of US3; can ship in parallel
- **US5 (Phase 7)**: depends on Phase 2 only — independent of US1/US3/US4; can ship in parallel after Phase 2 lands
- **Polish (Phase 8)**: depends on all previous phases

### User Story Dependency Graph

```text
Phase 1 → Phase 2 ──┬──→ US1 (P1, critical path) ──┬──→ US3 (P3, LGPD) ──┐
                    │                                │                    │
                    ├──→ US2 (P2, primitives) ───────┴──→ US4 (P4) ──────┤
                    │                                                     │
                    └──────────────────────────────→ US5 (P5, controls) ──┴──→ Polish
```

### Parallel Opportunities

- **Phase 2**:
  - T002..T013 (schema migration) are sequential
  - T014..T019 (shared schemas) are all `[P]`
  - T020..T027 (domain entities + errors) are mostly `[P]`
  - T028..T040 (repositories + resolver) — T028/T034 are serial, T029..T033 are `[P]`, T035..T039 are `[P]`
  - T041..T043 (classification + read mask) can run in parallel
- **Phase 3 (US1)**:
  - Tests T046..T060 are all `[P]` (different it blocks within the same file are fine — they don't collide)
  - Implementation T063..T074 is **mostly serial** because it touches the worker file + the service file repeatedly
- **Phase 4 (US2)**: tests T079..T087 are `[P]`; implementation T088..T090 is mostly serial but T090 is on a different file so can parallel with T088/T089
- **Phase 5 (US3)**:
  - Tests T092..T111 are all `[P]` (different files or independent it blocks)
  - Implementation T112..T123 is partially parallel — the use cases (T112, T113), repository methods (T114, T115), and route file (T116..T120) are independent
- **Phase 6 (US4)**: tests T126..T136 `[P]`; implementation T137..T144 touches the same file sequentially
- **Phase 7 (US5)**:
  - Tests T147..T154 all `[P]`
  - Use cases T155..T161 all `[P]` (different files)
  - Route file T162..T164 is serial
- **Phase 8**: T168..T170 are `[P]`; manual smokes T171..T175 are serial (same dev env)

---

## Implementation Strategy

### MVP First (Phases 1–5: US1 + US2 + US3)

1. **Phase 1** — verify implemented reality
2. **Phase 2** — schema, entities, repositories, primitives (foundational)
3. **Phase 3 (US1)** — retention engine + hot/cold + preservation rules + write-time reversal (**critical path**)
4. **Phase 4 (US2)** — redaction primitives (small phase, ~13 tasks)
5. **Phase 5 (US3)** — erasure workflow (**LGPD compliance deliverable**)
6. **STOP and VALIDATE**: 006 cross-check invariance verified; financial retention integrity verified; erasure end-to-end verified; concurrency coordination verified. This is the **minimum shippable compliance MVP**.

### Incremental Delivery

1. Setup + Foundational → schema and contracts ready
2. US1 → retention engine reshape + write-time reversal → ship (closes 011#GAP-001)
3. US2 → redaction primitives → ship (internal foundation — no user-visible surface)
4. US3 → erasure workflow → ship (closes 011#GAP-003, LGPD compliance)
5. US4 → audience-aware views + cold storage opt-in → ship (closes 011#GAP-002)
6. US5 → operator controls → ship (compliance audits unblocked)
7. Polish → full verification pass

### Parallel Team Strategy

With multiple developers after Phase 2:
- **Dev A**: US1 → US3 (the compliance critical path, mostly serial)
- **Dev B**: US2 → US4 (primitives then read path)
- **Dev C**: US5 (operator controls, independent)
- **Dev D**: Integration tests + polish (starts as soon as any wave lands)

Dev A's path is the bottleneck because US3 depends on US1's hot/cold separation.

---

## Must-have vs Non-blocking vs Optional

Per the plan's "Blocking vs non-blocking within 020" section:

### Must-have (functional delivery — ship together)

- Phase 1 (Setup)
- Phase 2 (Foundational) — all schema + entities + repositories + primitives
- Phase 3 (US1) — retention engine reshape + write-time reversal + cross-check preservation under new semantics. **Critical path.**
- Phase 4 (US2) — on-demand redaction primitives
- Phase 5 (US3) — erasure workflow (preview + execute + meta-audit). **LGPD compliance deliverable.**
- Phase 6 (US4) — read-time masking + cold-storage opt-in (closes 011#GAP-002)
- Phase 8 tasks T168..T170 — regression-safety gates (full test suite, typecheck, lint)
- Phase 8 tasks T171..T175 — manual smoke of the 5 critical paths

### Non-blocking operator tooling / polish (can ship in a follow-up pass)

- Phase 7 (US5) — backend operator control endpoints (the **endpoints** are blocking for compliance audits, but can ship in a second release after the Phase 3–6 MVP is deployed if release timing is tight)
- A dedicated frontend operator console for retention / redaction (explicitly out of scope for 020 MVP)
- Legal hold UI surface (backend endpoint is in Phase 7; UI is deferred)
- Manual-review queue UI for `customFieldsJson` flagged entries
- Cross-workspace lint cleanup (pre-existing unrelated errors, same convention as 018/019)

### Optional future hardening (not in scope for 020)

- Partitioning migration of `audit_logs_archive` by `created_at` year (deferred until volume warrants)
- External archival system (S3 / Glacier) for cold storage (deferred — cold is a PostgreSQL tier per the spec)
- Active-dispute preservation rule concrete evaluation (waits for a dispute entity surface in a future feature)
- Category-wide legal holds (the model requires `entity_id` non-null — category-wide is a future extension)
- Load testing of cold-storage queries with millions of rows
- Automated `IN_PROGRESS` cleanup on crashed erasure (time-based reset after 1 hour — follow-up hardening)
- Time-based auto-release of legal holds
- Cross-feature PII coverage audit (heuristic scan for unregistered PII-looking fields in other modules' audit entries)

---

## Notes

- **Implemented reality**: the 020 spec says "Status: Draft" but the audit module already ships with a hard-delete retention worker (with the cross-check preservation rule), a write-time PII destruction call in `PersistentAuditService.log()`, a 14-entry `PII_REGISTRY`, and the pg-boss `audit.retention` schedule at `30 3 * * *`. Tasks below **extend** that skeleton and **reverse** the single diverging behavior (write-time PII destruction) per FR-014 + FR-025. Every `[P]` task has been verified to touch a distinct file.
- **Critical path**: Phase 3 (US1) is the highest-risk wave because it bundles two behavioral reversals (write-time PII destruction → kept in DB; hard delete → hot/cold move) AND must verify the 006 cross-check invariance under the new semantics. Tests written before implementation in this phase are non-negotiable. The integration test in T061 is the single most important test in 020.
- **The existing `audit.retention` pg-boss schedule is preserved**: `30 3 * * *`, already in the off-peak window the spec requires. No new recurring job.
- **Zero changes to 011 write path shape**: `PersistentAuditService.log()` remains fire-and-forget, still dual-writes to the structured logger + DB. Only the inline `redactPii()` calls are removed and a classification tag is added.
- **Zero changes to 006**: `PerformCrossCheckUseCase` is not touched. Its denormalized-column-first + audit-scan-fallback behavior is preserved. 020 protects the fallback path via the non-disableable cross-check preservation rule (FR-008).
- **Write-time reversal asymmetry** is recorded as a permanent residual: entries written before T063 ships are stuck with `[REDACTED]` forever. The read-time masking layer distinguishes `[REDACTED]` (already erased) from `[MASKED]` (role-based read-time mask) via distinct sentinels so consumers can tell them apart.
- **Clarification mapping** (explicit coverage of the 5 closed clarifications from `spec.md → Clarifications → Session 2026-04-06`):
  - *userId-first erasure scan strategy* → tasks T040 (resolver implementation), T092..T095 (resolver tests), T113 (preview use case)
  - *Permanent irreversible redaction* → tasks T088 (redactByFieldPath), T110 (irreversibility integration test), T112 (execute use case)
  - *Cold storage via `includeArchived` query toggle* → tasks T015 (query schema), T131..T135 (test cases), T140..T144 (implementation)
  - *`done_marked_by_user_id` as co-implementation, not hard prerequisite* → already deployed; `PerformCrossCheckUseCase` tested in T061 to verify the preservation rule still protects legacy rows where the column is `NULL`
  - *Off-peak retention with configurable batch size* → tasks T051 (batch size test), T066 (env var), T067..T074 (worker reshape), pg-boss schedule unchanged
- **Max retention constraint enforcement** (HIGH-severity policy risk from plan.md): tasks T147 (test) and T155 (implementation) enforce the `CATEGORY_MINIMUMS` constraint (`FINANCIAL ≥ 7y`, `OPERATIONAL_CRITICAL ≥ 5y`) so AM cannot lower the floor.
- **Concurrency coordination** between retention and erasure is verified end-to-end by task T111 (integration test). This is the test that closes the "retention and redaction racing on the same rows" MEDIUM risk from plan.md.
