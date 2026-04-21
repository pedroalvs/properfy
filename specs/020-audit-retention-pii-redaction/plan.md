# Implementation Plan: Audit Retention and PII Redaction

**Branch**: `015-permissions-rbac-matrix` (continuing on current integration branch) | **Date**: 2026-04-12 | **Spec**: `specs/020-audit-retention-pii-redaction/spec.md`
**Input**: Feature specification from `/specs/020-audit-retention-pii-redaction/spec.md`
**Status (2026-04-13)**: **Implemented.** All six central flows shipped on top of the 011 audit module without redesigning the write path, the pg-boss schedule, or the 006 cross-check lookup. Backend test suite: 264 files / 2789 tests green. Typecheck clean across all workspaces. Six residuals are recorded in `spec.md` → **Delivery Outcome** and classified as non-blocking follow-up polish / deferred coverage / out-of-scope lint. This plan is preserved in historical form below — the `### Implemented Reality vs Approved Target` snapshot captures the pre-implementation state, not the post-delivery state.

## Summary

This feature delivers the **retention policy layer**, **preservation rules**, **PII classification / on-demand redaction workflow**, and **audience-aware read masking** on top of the existing `011-reports-audit` module. It closes the audit-log compliance gap (011#GAP-001) and the LGPD erasure-request gap (011#GAP-003), while fully preserving the cross-check origin lookup that feature `006-appointments` depends on.

**What this feature does:**

- Introduces a structured retention category model (Financial / Operational-Critical / Operational-General) mapped from audit `action` codes, configurable by AM (FR-001, FR-002).
- Replaces the current hard-delete retention worker with a **hot → cold → hard-delete** lifecycle, where cold is a separate storage tier inside the same PostgreSQL database (a parallel `audit_logs_archive` table) and hard deletion is a distinct, explicitly enabled step (FR-003..FR-006, FR-034).
- Extends the existing cross-check preservation rule into a general **preservation rule system** covering active disputes and legal holds (FR-007..FR-011).
- Reverses the current write-time PII destruction: audit entries will be written with PII **intact** (so AM can see unmasked history and operators can investigate), and PII is only removed via the **on-demand redaction (erasure)** workflow or via the **read-time masking** tier for OP / CL_ADMIN (FR-012..FR-018).
- Introduces a **data subject erasure workflow**: resolve all historical PII values for a subject (user ID → emails/phones/names history), scan `audit_logs` + `tenant_portal_activities` across hot and cold tiers, preview the scope, confirm, and execute (FR-019..FR-024).
- Adds **audience-aware read masking** on the existing `GET /v1/audit-logs` endpoint: AM full access, OP partial masking (first 3 chars of email, last 4 digits of phone, name initials), CL_ADMIN blanket `[MASKED]` (FR-025..FR-027).
- Adds an **opt-in cold-storage query parameter** on the same endpoint so AM/OP can include archived entries when needed, visually marked on the response (FR-026a, FR-026b).
- Audits every retention run, redaction run, and policy change — the audit tooling audits itself (FR-028..FR-030).
- Brings `tenant_portal_activities` under the same retention + redaction framework as `audit_logs` (FR-031).

**What this feature does NOT do:**

- Redesign or replace the existing `PersistentAuditService` write path. The service keeps writing via `auditLogRepo.save`; only the in-line PII redaction call is removed and a write-time category tag is added.
- Redesign the `audit.retention` pg-boss schedule or introduce a new recurring job. The existing `30 3 * * *` schedule is preserved; only the worker body is reshaped.
- Redesign `ListAuditLogsUseCase`'s role-gating or filter contract. Only the masking layer + cold-storage opt-in + archived marker are added.
- Build a generic compliance-management product (DSAR portal, data maps, etc.). Erasure is a single AM-operated workflow scoped to audit surfaces.
- Reverse **previously persisted PII destruction**. Any audit rows that were already written via the current write-time-redaction path are permanently `[REDACTED]` — there is no recovery and this feature does not promise one. The reversal only affects entries written **after** 020 ships.
- Implement a separate archival system (S3, Glacier, etc.). Cold storage is a lower-access PostgreSQL tier within the same DB.
- Drive 006's cross-check origin lookup backward. 006 already reads the denormalized `appointments.done_marked_by_user_id` column first and falls back to the audit scan for legacy rows. This feature preserves that fallback.

### Implemented Reality vs Approved Target (pre-implementation snapshot, 2026-04-12)

**The 020 spec says "Status: Draft" and implies a green-field build. Exploration shows a partial skeleton already exists in the audit module, with one significant divergence from the spec (write-time PII destruction).** This plan treats the existing code as implemented reality and extends it rather than replacing it.

| Component | Spec expectation | Actual state (pre-020) |
|---|---|---|
| `AuditLog` Prisma model | Core fields + retention category + redaction status + cold-storage flag + preservation-rule reference | **EXISTS** at `apps/backend/prisma/schema.prisma:556` with core fields only. **Missing**: `retention_category`, `redaction_status`, `cold_storage`, `preservation_rule_id`. |
| `PersistentAuditService` | Non-destructive write; PII masking happens at read or via erasure | **EXISTS** at `apps/backend/src/modules/audit/application/services/persistent-audit.service.ts`. **DIVERGENCE**: calls `redactPii()` synchronously at write time, **destroying PII irreversibly** before persistence. This contradicts FR-014 (redaction is on-demand) and FR-025 (AM should see full PII). Must be reversed — new entries will carry PII; old entries stay `[REDACTED]`. |
| `pii-redaction.ts` helper | Registry + per-subject redaction | **EXISTS** at `apps/backend/src/modules/audit/application/helpers/pii-redaction.ts` with a `PII_REGISTRY` (14 entries covering user/inspector/auth/portal/appointment PII paths) and a `redactPii(action, snapshot)` function. The registry is reusable as the seed for the new `PiiFieldMapping` model; the inline call site will be removed from the write path. |
| `AuditRetentionWorker` | Hot → cold move + preservation rules + legal holds + audit of runs | **EXISTS** at `apps/backend/src/modules/audit/infrastructure/workers/audit-retention.worker.ts`. Already implements the cross-check preservation rule (`appointment.statusTransition` entries with `after_json.status = 'DONE'` + `a.done_checked_at IS NULL`). **But** it does a **hard delete**, not a hot→cold move; no dispute rule; no legal holds; batch size hardcoded to 1000; no self-audit of the run summary. |
| `audit-retention.ts` domain (retention tiers) | DB-backed configurable categories | **EXISTS** at `apps/backend/src/modules/audit/domain/audit-retention.ts` with hardcoded constants: FINANCIAL (7y), GENERAL (5y), HIGH_VOLUME (2y), plus `FINANCIAL_ACTION_PATTERNS` / `HIGH_VOLUME_ACTION_PREFIXES`. Needs to become a configurable registry (FR-002). |
| `audit.retention` pg-boss schedule | Off-peak daily, configurable batch size | **EXISTS** in `main/workers.ts` at `30 3 * * *` (matches the 02:00–05:00 spec default). Batch size is hardcoded in the worker (1000). Worker runs against prod DB with no concurrency coordination with erasure. |
| `ListAuditLogsUseCase` | AM/OP/CL_ADMIN role-gated; partial masking per role; cold-storage opt-in; archived marker on response | **EXISTS** at `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.ts`. Already enforces AM/OP/CL_ADMIN gating + CL_ADMIN blanket `[MASKED]` on `beforeJson`/`afterJson`. **Missing**: OP partial masking (first 3 chars of email / last 4 of phone / name initials), `include_archived` query param, `isArchived` marker on response, distinction between `[REDACTED]` (already erased) and `[MASKED]` (read-time). |
| `done_marked_by_user_id` on appointments (006#GAP-009) | Co-implementation, not blocker | **ALREADY DEPLOYED** at `appointments.done_marked_by_user_id`. `PerformCrossCheckUseCase` **already prefers the denormalized column** and falls back to the audit scan for legacy rows. The cross-check preservation rule remains the primary safety net per the 2026-04-06 clarification. |
| `tenant_portal_activities` table | Parallel PII surface under the same retention + redaction framework | **EXISTS** at `apps/backend/prisma/schema.prisma:692` with `previous_values_json` / `new_values_json` PII surfaces. **Nothing** is wired for retention, redaction, or erasure against this table. |
| `DataSubjectErasureRequest` entity | Full lifecycle tracking | **DOES NOT EXIST**. |
| `AuditPreservationRule` / `AuditLegalHold` entities | Configurable preservation | **DO NOT EXIST**. The cross-check preservation is hardcoded in the worker. |
| `PiiFieldMapping` entity | Extensible PII registry | **DOES NOT EXIST**. The registry is a hardcoded TypeScript array. |

**Implication**: 020 is a **targeted reshape** of the existing audit retention + read path and an **extension** that adds the erasure workflow, preservation rules, and cold storage tier. The single most consequential change is **reversing the write-time PII destruction**, which is a product decision captured in FR-014 + FR-025 and must be called out explicitly in the migration notes.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (backend). Frontend (if any) TypeScript 5.6 on React 18.3.
**Primary Dependencies**: Fastify, Prisma ORM, Zod, pg-boss (existing `audit.retention` schedule), `PersistentAuditService` (module under reshape), `AuthorizationService` (015 — for `assertRoles` / `assertTenantScope` on the new endpoints).
**Storage**: PostgreSQL (Supabase).
- **Hot tier**: existing `audit_logs` table, with added columns for retention category, redaction status, cold-storage flag, preservation-rule id.
- **Cold tier**: a new `audit_logs_archive` table with the same column shape (simpler than partitioning, minimal migration churn). Rows are moved by the retention worker via `INSERT INTO ... SELECT ... DELETE` inside a single transaction. Reads go to hot by default; AM/OP can opt in via query param. `tenant_portal_activities` gets a parallel `tenant_portal_activities_archive` table.
- **New small lookup models**: preservation rules, legal holds, PII field mappings, retention categories, and erasure requests each get their own small Prisma model.
**Testing**: Vitest (unit + integration), Supertest, existing audit test helpers.
**Target Platform**: Node.js backend API. No frontend surface is strictly required for P1..P3; the operator controls (P5) are backend-only in this wave and a minimal web UI is a deferred follow-up.
**Project Type**: Cross-cutting extension on top of `011-reports-audit`. Adds retention lifecycle, preservation rules, redaction workflow, and read masking; reuses the existing audit write/read/worker skeleton unchanged in shape.
**Constraints**:
- **Zero regressions** in the 006 cross-check origin lookup. The cross-check preservation rule (FR-008) is non-disableable by any user and must be verified with a dedicated integration test.
- **No loss of financial evidence** within the legal retention window (FR-033).
- **Hard deletion is off by default** and must be explicitly enabled per category (FR-034).
- **Retention must not run concurrently with an active erasure request** on overlapping entries — coordination via a `redaction_status` column on `audit_logs` that the worker checks before moving or deleting a row.
- **Retention must run in the off-peak window** with a configurable batch size (existing `30 3 * * *` cadence is preserved; the batch size moves from a worker constant to a config value).
- **Write-time reversal asymmetry**: entries already redacted at write time stay permanently `[REDACTED]`. This is called out in the read-time masking logic so consumers can distinguish `[REDACTED]` (already-erased) from `[MASKED]` (role-based read-time mask).
**Scale/Scope**: ~1 additive Prisma migration (4 new columns on `audit_logs` + parallel on `tenant_portal_activities` + 5 new tables + 1 archive table for each PII surface), ~11 new/extended use cases, 1 worker reshape, ~16 new endpoints (1 extended on `GET /v1/audit-logs` + 4 erasure endpoints + 11 retention/preservation/legal-hold/pii-mapping endpoints), no new frontend in MVP.

### Modules / Backend Impacted

**Extended (not replaced):**

- `apps/backend/prisma/schema.prisma`
  - `AuditLog`: add `retention_category` (`AuditRetentionCategory` enum, nullable — lazy-backfilled on first read), `redaction_status` (new enum `AuditRedactionStatus`: `NONE` / `PARTIAL` / `FULL` / `IN_PROGRESS`, default `NONE`), `cold_storage` (boolean, default false — always false on the hot table; the archive table carries the same column for symmetry), `preservation_rule_id` (uuid FK nullable)
  - `TenantPortalActivity`: same three lifecycle columns (without `preservation_rule_id` — the cross-check preservation rule does not apply here)
  - New models: `AuditRetentionCategoryConfig`, `AuditPreservationRule`, `AuditLegalHold`, `PiiFieldMapping`, `DataSubjectErasureRequest`
  - New archive tables: `audit_logs_archive`, `tenant_portal_activities_archive` (same column set as the hot tables)
  - New enums: `AuditRetentionCategory` (`FINANCIAL` / `OPERATIONAL_CRITICAL` / `OPERATIONAL_GENERAL`), `AuditRedactionStatus`, `PreservationRuleType` (`CROSS_CHECK` / `ACTIVE_DISPUTE` / `LEGAL_HOLD`), `ErasureRequestStatus`
- `apps/backend/src/modules/audit/domain/audit-retention.ts` — keep for the `action` → category mapping helper, but the canonical tier durations move into the `AuditRetentionCategoryConfig` DB-backed registry; the file becomes a thin reader that hydrates from the registry with the hardcoded tiers as fallback/seed.
- `apps/backend/src/modules/audit/domain/audit-log.entity.ts` — add the new columns to props/constructor/toJSON.
- `apps/backend/src/modules/audit/domain/audit-log.repository.ts` + Prisma impl — `findAll` gains `includeArchived: boolean`; add `findByIds`, `updateRedactionStatus`, `moveToCold`, `hardDelete`, `countEligibleForRetention` per category, `markRedactionInProgress`, and a `searchPiiByValues(values: string[])` method used by the erasure scan.
- `apps/backend/src/modules/audit/application/services/persistent-audit.service.ts` — **remove the `redactPii` call**. Add classification tag at write time: derive `retention_category` from the action via the category registry and persist it.
- `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.ts` — add role-based masking layer (partial for OP, full for CL_ADMIN), `[REDACTED]` vs `[MASKED]` distinction, `includeArchived` parameter, `isArchived` marker in the output DTO.
- `apps/backend/src/modules/audit/infrastructure/workers/audit-retention.worker.ts` — **reshape**: (a) replace hard delete with `INSERT INTO audit_logs_archive ... SELECT ... DELETE`, (b) consult the `AuditPreservationRule` and `AuditLegalHold` tables in addition to the inline cross-check rule, (c) skip rows with `redaction_status = 'IN_PROGRESS'`, (d) batch size comes from env/config, (e) write a single self-audit entry per run summarizing entries evaluated / moved / preserved / hard-deleted / errored, (f) run the same logic against `tenant_portal_activities` → `tenant_portal_activities_archive`.
- `apps/backend/src/main/workers.ts` — no new jobs; keep `audit.retention` schedule; wire the new retention worker dependencies (config repo, preservation repo, legal hold repo).

**New:**

- `apps/backend/src/modules/audit/domain/`
  - `audit-retention-category.entity.ts`, `audit-retention-category.repository.ts`
  - `audit-preservation-rule.entity.ts`, `audit-preservation-rule.repository.ts`
  - `audit-legal-hold.entity.ts`, `audit-legal-hold.repository.ts`
  - `pii-field-mapping.entity.ts`, `pii-field-mapping.repository.ts`
  - `data-subject-erasure-request.entity.ts`, `data-subject-erasure-request.repository.ts`
  - `pii-read-mask.ts` — pure functions `maskEmail(value, role)`, `maskPhone(value, role)`, `maskName(value, role)` used by the list use case
  - `erasure-pii-resolver.ts` — interface that takes a subject identifier and returns all historical PII values by scanning user + inspector + audit history
- `apps/backend/src/modules/audit/infrastructure/`
  - Prisma adapters for each new repository
  - `PrismaErasurePiiResolver` — concrete resolver that walks `users`, `inspectors`, and lifecycle audit entries to build the historical PII set
- `apps/backend/src/modules/audit/application/use-cases/`
  - `classify-audit-action.use-case.ts` — called by `PersistentAuditService` (or a one-shot backfill job) to assign a retention category from the action
  - `preview-data-subject-erasure.use-case.ts` — resolves historical PII, scans hot + cold + `tenant_portal_activities`, returns the preview report
  - `execute-data-subject-erasure.use-case.ts` — applies the redaction across matched entries, marks the `DataSubjectErasureRequest` as completed, writes the meta-audit entry
  - `place-legal-hold.use-case.ts` / `release-legal-hold.use-case.ts` (AM only)
  - `upsert-preservation-rule.use-case.ts` (AM only)
  - `upsert-retention-category.use-case.ts` (AM only)
  - `upsert-pii-field-mapping.use-case.ts` (AM only)
  - `trigger-retention-run.use-case.ts` — manual operator trigger for a date range (FR-005 of US5)
  - `list-retention-runs.use-case.ts` — operator history view (backed by the self-audit entries from FR-028)
- `apps/backend/src/modules/audit/interfaces/`
  - Extend `audit.routes.ts` with new endpoints
  - New `audit-retention.routes.ts` for retention categories / rules / legal holds / runs / pii mappings
  - New `audit-erasure.routes.ts` file kept separate to isolate the sensitive endpoints

### Storage tiers impacted

| Tier | Table | Who writes | Who reads | Retention action |
|---|---|---|---|---|
| Hot | `audit_logs` | `PersistentAuditService` | `ListAuditLogsUseCase` by default | Retention worker moves entries out when past tier |
| Hot | `tenant_portal_activities` | existing tenant-portal flows | not exposed via audit endpoint today | Retention worker moves entries out when past tier |
| Cold | `audit_logs_archive` | retention worker (from hot) | `ListAuditLogsUseCase` only when `includeArchived=true` (AM/OP only) | Hard-delete sweep (separate, explicit, off by default) |
| Cold | `tenant_portal_activities_archive` | retention worker (from hot) | not exposed via audit endpoint (out of scope for read masking) | Hard-delete sweep (separate, explicit, off by default) |

### Workers / jobs / use cases / endpoints / repositories

**Workers (existing):**
- `audit.retention` pg-boss schedule (`30 3 * * *`) — kept; `AuditRetentionWorker` body reshaped.

**Endpoints** (new unless stated):

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/v1/audit-logs` | AM/OP/CL_ADMIN (existing, extended) | adds `includeArchived` + `isArchived` marker |
| GET | `/v1/audit-retention/categories` | AM/OP | list retention categories + durations |
| PUT | `/v1/audit-retention/categories/:name` | AM only, audited | upsert a category + its action patterns |
| GET | `/v1/audit-retention/rules` | AM/OP | list preservation rules |
| POST | `/v1/audit-retention/rules` | AM only, audited | create preservation rule |
| DELETE | `/v1/audit-retention/rules/:id` | AM only, audited | delete preservation rule |
| POST | `/v1/audit-retention/legal-holds` | AM only, audited | place legal hold |
| DELETE | `/v1/audit-retention/legal-holds/:id` | AM only, audited | release legal hold |
| GET | `/v1/audit-retention/runs` | AM/OP | retention run history (backed by self-audit entries) |
| POST | `/v1/audit-retention/runs` | AM only, audited | manual trigger for a date range |
| GET | `/v1/audit-retention/pii-mappings` | AM only | list PII registry |
| PUT | `/v1/audit-retention/pii-mappings/:id` | AM only, audited | upsert PII mapping |
| POST | `/v1/audit-erasure-requests` | AM only | create erasure request (input: `{ subjectIdentifierType, subjectIdentifierValue }`) |
| GET | `/v1/audit-erasure-requests/:id` | AM only | fetch status + scan preview |
| POST | `/v1/audit-erasure-requests/:id/confirm` | AM only, audited | execute redaction (produces meta-audit entry) |
| GET | `/v1/audit-erasure-requests` | AM only | list historical erasure requests |

### Dependency on 011-reports-audit

020 depends on 011 for:
1. **Write path** — `PersistentAuditService.log()` is kept and called by every other feature. 020 removes the write-time redaction call and adds the write-time category classification.
2. **Read path** — `ListAuditLogsUseCase` is kept and extended with masking + cold-storage opt-in + archived marker.
3. **Entity / repository** — `AuditLogEntity` and `IAuditLogRepository` are extended with the new columns and methods.
4. **pg-boss `audit.retention` schedule** — kept at `30 3 * * *`; the worker body is reshaped, the schedule is not.

020 does NOT depend on 011 for: the retention logic itself (currently baked into the worker and the `audit-retention.ts` module — both are reshaped or reworked here), the worker's hard-delete behavior (explicitly reversed), or the write-time PII destruction (explicitly reversed).

### Coupling points with 006-appointments

Feature 006's `PerformCrossCheckUseCase` (at `apps/backend/src/modules/appointment/application/use-cases/perform-cross-check.use-case.ts`) has two code paths to identify who marked the appointment DONE:

1. **Preferred (already in place)**: read `appointment.doneMarkedByUserId` — the denormalized column is populated on every `DRAFT → DONE` transition since 006#GAP-009 was closed at the schema level.
2. **Fallback (legacy)**: scan `audit_logs` for the most recent `appointment.status_transition` with `after_json.status = 'DONE'` for the given appointment id.

020's cross-check preservation rule (FR-008) protects the **fallback** path for rows that predate the denormalized column rollout. The rule is identical to the one already in the retention worker (lines 48–61 of `audit-retention.worker.ts`) — 020 reuses it verbatim and **extends** it to cover the hot → cold move (not just the hard delete):

- `appointment.status_transition` entries where `after_json.status = 'DONE'` AND the linked appointment has `done_checked_at IS NULL` MUST NOT be moved to cold storage (because the cross-check use case today only reads from hot).
- Once the appointment is cross-checked (`done_checked_at IS NOT NULL`), the preservation rule stops applying and the entry can move to cold on the next retention run.
- Hard deletion (separate, explicit, off-by-default step) MUST additionally preserve these entries while `done_checked_at IS NULL` — hard-delete respects preservation rules unconditionally.

The legacy-row audit-scan fallback is still valuable because some pre-020 `DONE` appointments may have `done_checked_at = NULL` **and** `done_marked_by_user_id = NULL` if they were seeded before the denormalized column rollout. The plan does not migrate or backfill those legacy appointments; the preservation rule is the safety net.

## Constitution / Risk Check

*GATE: must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Invariant | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | New use cases live in application, new entities in domain, new Prisma adapters in infrastructure, new routes in interfaces. No route-level business logic. No cross-module imports from audit into appointment (the cross-check preservation rule scans `audit_logs` + joins `appointments` via a read-only Prisma query, not via `AppointmentRepository`). |
| II. Multi-Tenant Safety | PASS | The audit table is intentionally cross-tenant (AM and OP both see everything per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 — list endpoints honour an optional `?tenantId=` filter for narrowing). CL_ADMIN is scoped to own tenant. Erasure requests and legal holds are tenant-aware where applicable — the preservation rule for a legal hold carries an optional `tenant_id` to prevent cross-tenant leakage on platform-scoped holds. Superseded phrasing: "OP is scoped to own tenant". |
| III. TDD | PASS | Dedicated tests for every new use case. Critical-path tests: cross-check preservation invariant (FR-008), retention-vs-erasure concurrency (FR-034 + `redaction_status` check), financial-evidence preservation (FR-033), hot→cold→hard-delete three-phase invariant. |
| IV. Contract-First APIs | PASS | All new endpoints get Zod schemas in `packages/shared/src/schemas/audit.ts`. OpenAPI regenerates afterwards. |
| V. Simplicity and Minimal Impact | PASS | Reuses the existing worker, schedule, service, entity, and route file. Adds two new routes files for the retention + erasure surfaces (explicit isolation of sensitive endpoints). Archive is a parallel table, not a partition — minimal Prisma churn. |
| Audit-engine sovereignty (011) | PASS | 020 does not replace the write path — only reverses the in-line PII destruction and adds write-time category tagging. It does not touch the structured log line emission, the fire-and-forget DB write, or the error-logging fallback. |
| 006 cross-check invariant | PASS | The cross-check preservation rule is re-verified under hot→cold move semantics (FR-008 + integration test). `perform-cross-check.use-case.ts` is not touched. |
| Audit mandatory on sensitive actions | PASS | FR-028 / FR-029 / FR-030 mandate self-audit for retention runs, redactions, and policy changes. The meta-audit entries themselves are classified as `OPERATIONAL_CRITICAL` (5y retention) and are immune to erasure because they carry no subject PII (FR-023). |

### Feature-specific risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Cross-check origin lookup breaks under hot→cold move** — if a legacy `DONE` appointment's `status_transition` entry is moved to cold before cross-check, `PerformCrossCheckUseCase`'s fallback scan fails with `APPOINTMENT_DONE_CROSS_CHECK_ORIGIN_NOT_FOUND`. | **HIGH** | The cross-check preservation rule (FR-008) is non-disableable; integration test asserts that `DONE + done_checked_at IS NULL` entries are never moved. Additional safety: the rule is double-enforced — once in the worker's preservation-rule evaluation pass, and once as an inline guard at the moment of the move statement (defense-in-depth). |
| **Financial evidence purged within legal window** — a misclassified action pattern could move a financial entry to cold or hard-delete it before the 7-year horizon. | **HIGH** | FR-033 asserts no financial entry loses sole evidence within the legal window. The category registry defaults unknown actions to `OPERATIONAL_CRITICAL` (5y) to avoid accidentally dropping unclassified financial actions to the 2-year tier. Hard delete is **off by default** per category (FR-034); enabling it for the financial category requires an explicit AM action that is itself audited. |
| **Write-time reversal asymmetry** — old entries stay permanently `[REDACTED]`, new entries carry PII. Consumers may mistake one for the other. | MEDIUM | The read-time masking layer distinguishes `[REDACTED]` (already-erased, all roles see it) from `[MASKED]` (role-based) in the response. The DTO uses a distinct sentinel per case. Documentation in `spec.md` "Residuals" explicitly records that pre-020 entries are permanently redacted. |
| **Retention and redaction racing on the same rows** — retention worker moves a row while an erasure request is iterating over it; either the move hides the row from erasure or the erasure writes to a row that is already in cold. | MEDIUM | New `redaction_status` column on `audit_logs`: erasure sets it to `IN_PROGRESS` before scanning, retention skips any row with `redaction_status = 'IN_PROGRESS'`. Erasure operates across both hot and cold tables (UPDATE by id list), so moves are harmless if they happen between scan and update — the scan result carries table name + id. Completion resets `redaction_status` to `FULL` (or `PARTIAL` if only some fields matched). |
| **Redaction destroys queryable structure** — aggressive JSONB field removal could turn `before_json` into something that's no longer indexable or joinable. | MEDIUM | Redaction replaces field **values** with `[REDACTED]`, not field **keys**. The JSONB structure is preserved; filters on `entity_type` / `entity_id` / `action` / `actor_id` / `created_at` are unaffected (FR-015). Integration test covers "query an erased entry by entity id and confirm the row is returned." |
| **Retention-run self-audit creates infinite loop** — if the retention run itself writes an audit entry classified as `operational-general` (2y), that entry eventually becomes eligible for retention, triggering another run-audit entry. | LOW | Retention run self-audit entries are classified `OPERATIONAL_CRITICAL` (5y) — they do not accumulate unboundedly. The category registry explicitly maps `audit.retention_run_completed` to `OPERATIONAL_CRITICAL`. |
| **Legal hold leaks across tenants** — a legal hold placed by AM on entity `X` must not accidentally preserve unrelated entries in other tenants. | LOW | Legal hold entity carries `entity_type + entity_id + (optional tenant_id)`. The worker evaluation joins on these fields exactly. Integration test asserts cross-tenant isolation. |
| **PII registry drift** — a new action type is added to another feature, contains PII, and is not added to the registry. | MEDIUM | The registry is extensible by AM via the upsert endpoint (FR-013). A "coverage audit" query in the erasure preview flags any action whose snapshots contain known PII-looking values but are not in the registry (heuristic warning, not a blocker). |
| **Cold storage query performance** — a large archive table with no partitioning may slow down `include_archived=true` queries. | LOW | Initial implementation uses a plain table; if volume grows, migrate to a `LIST` / `RANGE` partition by `created_at` year without changing the application layer. |
| **CustomFieldsJson manual review queue grows unbounded** — erasure requests may flag many entries for manual review and never resolve. | LOW | The erasure request tracks `entries_flagged_for_review_count` separately from `entries_redacted_count` so AM can see and process the flagged queue. Not a release blocker. |
| **Reversing write-time redaction means new PII in the DB** — previously the DB was PII-free; after 020 it carries PII. | MEDIUM (new attack surface) | Mitigated by (a) the existing DB-level protections (encryption at rest, restricted access), (b) the read-time masking tier (only AM sees raw PII), (c) the erasure workflow (LGPD compliance), and (d) the OP partial masking. This is the spec's approved trade-off — AM needs full visibility for investigations and the previous blanket destruction contradicted that. |

## Project Structure

### Documentation (this feature)

```text
specs/020-audit-retention-pii-redaction/
├── plan.md              # This file
├── spec.md              # Already exists
├── research.md          # (not generated — the 5 blocking questions are resolved in the spec's Clarifications section)
├── data-model.md        # Phase 1 output — optional, generated by /speckit.tasks if needed
├── contracts/
│   └── retention-endpoints.md   # Phase 1 output — generated by /speckit.tasks
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code

Organized by the spec's six functional surfaces: **retention engine**, **preservation rules**, **PII classification / redaction**, **erasure workflow**, **read/query behavior**, **operator controls**.

```text
packages/shared/src/
└── schemas/
    └── audit.ts                                            # EXTEND — new Zod schemas for every new endpoint + enums

apps/backend/prisma/
├── schema.prisma                                           # EXTEND — 4 cols on AuditLog, 3 on TenantPortalActivity, 5 new models, 2 archive tables, 4 new enums
└── migrations/
    └── <timestamp>_audit_retention_pii_redaction/
        └── migration.sql                                   # NEW — additive schema migration

apps/backend/src/modules/audit/
├── domain/
│   ├── audit-log.entity.ts                                 # EXTEND — retention_category, redaction_status, cold_storage, preservation_rule_id
│   ├── audit-log.repository.ts                             # EXTEND — findAll(includeArchived), findByIds, updateRedactionStatus, moveToCold, hardDelete, searchPiiByValues, etc.
│   ├── audit-retention.ts                                  # EXTEND — retain action→category helper, source durations from DB-backed config
│   ├── audit-retention-category.entity.ts                  # NEW
│   ├── audit-retention-category.repository.ts              # NEW
│   ├── audit-preservation-rule.entity.ts                   # NEW
│   ├── audit-preservation-rule.repository.ts               # NEW
│   ├── audit-legal-hold.entity.ts                          # NEW
│   ├── audit-legal-hold.repository.ts                      # NEW
│   ├── pii-field-mapping.entity.ts                         # NEW
│   ├── pii-field-mapping.repository.ts                     # NEW
│   ├── data-subject-erasure-request.entity.ts              # NEW
│   ├── data-subject-erasure-request.repository.ts          # NEW
│   ├── erasure-pii-resolver.ts                             # NEW — interface
│   └── pii-read-mask.ts                                    # NEW — pure masking functions
├── application/
│   ├── helpers/
│   │   └── pii-redaction.ts                                # EXTEND — keep PII_REGISTRY; remove the write-time call site. Add a `redactByFieldPath` function used by the erasure use case.
│   ├── services/
│   │   └── persistent-audit.service.ts                     # EXTEND — remove redactPii() call; add category classification tag at write time
│   └── use-cases/
│       ├── list-audit-logs.use-case.ts                     # EXTEND — role-based masking, includeArchived param, isArchived marker
│       ├── classify-audit-action.use-case.ts               # NEW — used internally at write time and by lazy backfill
│       ├── preview-data-subject-erasure.use-case.ts        # NEW
│       ├── execute-data-subject-erasure.use-case.ts        # NEW
│       ├── place-legal-hold.use-case.ts                    # NEW (AM only)
│       ├── release-legal-hold.use-case.ts                  # NEW (AM only)
│       ├── upsert-preservation-rule.use-case.ts            # NEW (AM only)
│       ├── upsert-retention-category.use-case.ts           # NEW (AM only)
│       ├── upsert-pii-field-mapping.use-case.ts            # NEW (AM only)
│       ├── trigger-retention-run.use-case.ts               # NEW (AM only, manual trigger)
│       └── list-retention-runs.use-case.ts                 # NEW (operator view of run history)
├── infrastructure/
│   ├── prisma-audit-log.repository.ts                      # EXTEND — new columns + methods + cold-table access
│   ├── prisma-audit-retention-category.repository.ts       # NEW
│   ├── prisma-audit-preservation-rule.repository.ts        # NEW
│   ├── prisma-audit-legal-hold.repository.ts               # NEW
│   ├── prisma-pii-field-mapping.repository.ts              # NEW
│   ├── prisma-data-subject-erasure-request.repository.ts   # NEW
│   ├── prisma-erasure-pii-resolver.ts                      # NEW — walks users + inspectors + lifecycle audit
│   └── workers/
│       └── audit-retention.worker.ts                       # RESHAPE — hot→cold move, preservation rules, legal holds, redaction_status check, configurable batch, self-audit
└── interfaces/
    ├── audit.routes.ts                                      # EXTEND — includeArchived param; isArchived marker
    ├── audit-retention.routes.ts                            # NEW — retention categories / rules / legal holds / runs / pii mappings
    └── audit-erasure.routes.ts                              # NEW — erasure requests (isolated file for the sensitive surface)

apps/backend/src/main/
├── container.ts                                             # EXTEND — register new repositories, use cases, worker deps
└── workers.ts                                               # EXTEND — retention worker gets new constructor args; schedule unchanged

apps/backend/tests/
├── unit/audit/
│   ├── audit-retention.ts.test.ts                          # EXTEND — config-backed tier resolution
│   ├── pii-read-mask.test.ts                               # NEW — per-role masking of email/phone/name
│   ├── pii-redaction.test.ts                               # EXTEND — redact-by-field-path helper
│   ├── classify-audit-action.use-case.test.ts              # NEW
│   ├── list-audit-logs.use-case.test.ts                    # EXTEND — AM/OP/CL_ADMIN masking + includeArchived + isArchived marker
│   ├── preview-data-subject-erasure.use-case.test.ts       # NEW
│   ├── execute-data-subject-erasure.use-case.test.ts       # NEW
│   ├── place-legal-hold.use-case.test.ts                   # NEW
│   ├── trigger-retention-run.use-case.test.ts              # NEW
│   ├── audit-retention.worker.test.ts                      # RESHAPE — hot→cold, preservation (cross-check + legal hold + dispute), redaction_status skip, batch size
│   └── prisma-erasure-pii-resolver.test.ts                 # NEW — historical PII resolution
└── integration/audit/
    ├── audit.routes.test.ts                                # EXTEND — includeArchived + masking shape
    ├── audit-retention.routes.test.ts                      # NEW
    ├── audit-erasure.routes.test.ts                        # NEW — preview + confirm lifecycle
    └── audit-retention.worker.integration.test.ts          # NEW — end-to-end worker tick with real DB + 006 cross-check invariant assertion
```

**Structure Decision**: retention engine (worker + category registry + preservation rules) lives under `audit/infrastructure/workers/` and `audit/domain/`; PII classification + read masking live under `audit/domain/pii-read-mask.ts` + `audit/application/helpers/pii-redaction.ts`; the erasure workflow gets its own use case trio (`preview`, `execute`, `list`) plus a dedicated `audit-erasure.routes.ts` file so the sensitive endpoints are visibly isolated from the regular operator controls. No frontend surface in the MVP — the operator controls ship as backend endpoints and a minimal admin UI is a deferred follow-up. The archive tier uses a parallel table (`audit_logs_archive`, `tenant_portal_activities_archive`) rather than partitioning to minimize migration churn.

## Execution Strategy

Six waves. Waves 1 and 2 are the **critical path** because they touch the retention hot path and reverse the write-time PII behavior. Waves 3–6 are additive.

### Wave 1 — Schema, category registry, preservation rule reshape (foundational)

1. Prisma migration:
   - `AuditLog`: add `retention_category` (enum nullable), `redaction_status` (enum default `NONE`), `cold_storage` (boolean default false), `preservation_rule_id` (uuid FK nullable)
   - `TenantPortalActivity`: add `retention_category`, `redaction_status`, `cold_storage` (no preservation-rule FK — no cross-check rule applies)
   - New enums: `AuditRetentionCategory`, `AuditRedactionStatus`, `PreservationRuleType`, `ErasureRequestStatus`
   - New models: `AuditRetentionCategoryConfig`, `AuditPreservationRule`, `AuditLegalHold`, `PiiFieldMapping`, `DataSubjectErasureRequest`
   - New archive tables: `audit_logs_archive`, `tenant_portal_activities_archive` (same column shapes)
   - Seed rows for `AuditRetentionCategoryConfig` (FINANCIAL, OPERATIONAL_CRITICAL, OPERATIONAL_GENERAL) and `PiiFieldMapping` (seeded from the existing `PII_REGISTRY` array — preserves the 14 field paths)
2. Extend `AuditLogEntity`, `IAuditLogRepository`, `PrismaAuditLogRepository` with the new columns and the new methods (`findByIds`, `updateRedactionStatus`, `moveToCold`, `hardDelete`, `searchPiiByValues`, `findAll(includeArchived)`).
3. Create the new domain entities + repositories + Prisma adapters for `AuditRetentionCategoryConfig`, `AuditPreservationRule`, `AuditLegalHold`, `PiiFieldMapping`.
4. Update `audit-retention.ts` to read from `AuditRetentionCategoryConfig` with the hardcoded constants as fallback for bootstrap / test scenarios.
5. Create `ClassifyAuditActionUseCase` that takes an action string and returns a category; call it from `PersistentAuditService.log()` and persist the category at write time.

**Checkpoint**: `pnpm --filter backend typecheck` clean. Existing audit tests still green. `PersistentAuditService.log()` now stamps `retention_category` on new rows (old rows are `NULL` — lazy-backfilled by the retention worker on first evaluation).

### Wave 2 — Reverse write-time redaction + reshape retention worker (critical path)

6. **Reverse write-time redaction** in `PersistentAuditService.log()`:
   - Remove the `redactPii(entry.action, entry.before)` / `redactPii(entry.action, entry.after)` calls.
   - Keep the `pii-redaction.ts` helper (reused by the erasure use case).
   - Update unit tests to assert the written entry carries the raw PII.
   - **Document in the spec Delivery Outcome** that entries written before this change remain permanently `[REDACTED]` (FR-014 irreversibility rule applies to the historical state).
7. **Reshape `AuditRetentionWorker`**:
   - Read batch size from a new env variable `AUDIT_RETENTION_BATCH_SIZE` (default 1000).
   - Read the cutoff per action from the `AuditRetentionCategoryConfig` table (not from the hardcoded constants — constants remain as fallback).
   - Evaluate preservation rules in this order before any move/delete: `CROSS_CHECK` (inline join as today), `ACTIVE_DISPUTE` (new — linked appointment/financial entry in dispute), `LEGAL_HOLD` (new — entity matches an active hold).
   - Skip rows with `redaction_status = 'IN_PROGRESS'`.
   - **Replace the hard-delete** with a two-step move: `INSERT INTO audit_logs_archive ... SELECT ... FROM audit_logs WHERE id = ANY($1)` → `DELETE FROM audit_logs WHERE id = ANY($1)` inside a single transaction.
   - Hard deletion happens only if the category's `hardDeleteEnabled` flag is true AND the row is in `audit_logs_archive` AND the row's age exceeds retention + 1 year. This is a **separate sweep phase** at the end of the run, not the main loop.
   - Write a single `audit.retention_run_completed` audit entry at the end of the run with the full summary (entries evaluated, moved, preserved per rule, hard-deleted, errored).
   - Run the same logic against `tenant_portal_activities` → `tenant_portal_activities_archive` in a dedicated second pass.
8. Integration test: seed 3 fixture scenarios (appointment cross-check preservation, legal hold, financial entry past 7 years) and assert the worker produces the expected outcome.

**Checkpoint**: cross-check invariant verified under hot→cold move. Financial evidence preserved within the legal window. Self-audit entry produced. Backend test suite green.

### Wave 3 — Audience-aware read masking + cold-storage opt-in

9. Create `pii-read-mask.ts` with pure functions `maskEmail(value, role)`, `maskPhone(value, role)`, `maskName(value, role)` returning the spec's FR-025 shapes.
10. Extend `ListAuditLogsUseCase`:
    - Apply `pii-read-mask` to each PII field path from the `PiiFieldMapping` registry based on the actor's role:
      - AM → no masking
      - OP → partial masking via `pii-read-mask`
      - CL_ADMIN → full masking (keeps the current `[MASKED]` blanket — no change)
    - Already-redacted entries (`redaction_status = 'FULL'`) show `[REDACTED]` for all roles (sentinel distinct from `[MASKED]`)
    - Accept `includeArchived: boolean` query param; reject (403) if role is CL_ADMIN and `includeArchived = true`
    - When `includeArchived = true`, query both `audit_logs` and `audit_logs_archive` via a UNION ALL (or two calls merged in application layer)
    - Include `isArchived: boolean` on each response entry
11. Extend `audit.routes.ts` `GET /v1/audit-logs` with the new query param and the response marker.
12. Unit tests + integration tests for the masking tiers and the opt-in parameter.

**Checkpoint**: AM, OP, CL_ADMIN see correct masking. Archived entries are queryable on opt-in only.

### Wave 4 — Data subject erasure workflow

13. Implement `PrismaErasurePiiResolver`:
    - Input: `{ type: 'user_id' | 'email' | 'phone', value: string }`
    - Step 1: resolve canonical `user_id` (via `users` table for email/phone, or use the id directly)
    - Step 2: query `users` and `inspectors` history (lifecycle audit entries: `user.created`, `user.updated`, `inspector.created`, `inspector.updated`) to collect all historical `name`, `email`, `phone` values
    - Step 3: return the deduplicated set of PII values
14. Implement `PreviewDataSubjectErasureUseCase`:
    - AM-only
    - Calls the resolver
    - Scans `audit_logs` (hot + cold) and `tenant_portal_activities` (hot + cold) for rows where any PII field path contains any of the resolved values (uses `searchPiiByValues` on the repository, which does a JSONB text search across the registered field paths)
    - Returns: total entries found, per category, per storage tier, entries flagged for manual review (`customFieldsJson` matches that are not in the PII registry)
15. Implement `ExecuteDataSubjectErasureUseCase`:
    - AM-only, requires a prior preview
    - Sets `redaction_status = 'IN_PROGRESS'` on all target rows (atomic)
    - Iterates the target rows: for each PII field path in the registry that matches, replaces the value with `[REDACTED]` using `redactByFieldPath` (the extended `pii-redaction.ts` helper)
    - For `paymentSettingsJson` and other `opaque` classifications, replaces the entire field with `[REDACTED]`
    - Sets `redaction_status = 'FULL'` when all known PII paths are redacted, `'PARTIAL'` if some paths require manual review
    - Writes a meta-audit entry `audit.data_subject_erasure_executed` with `{ subjectIdentifierType, entriesFound, entriesRedacted, entriesFlaggedForReview }` — **no subject PII in this entry**
    - Updates `DataSubjectErasureRequest.status = 'COMPLETED'`
16. `POST/GET /v1/audit-erasure-requests` + `POST /v1/audit-erasure-requests/:id/confirm` endpoints.
17. Concurrency test: run the retention worker while an erasure is in progress on overlapping rows; assert the worker skips those rows.

**Checkpoint**: erasure workflow works end-to-end across hot + cold + `tenant_portal_activities`. Meta-audit entry produced. Concurrency with retention verified.

### Wave 5 — Operator controls for preservation rules, legal holds, PII mappings, retention runs

18. `upsert-retention-category.use-case.ts` + `upsert-preservation-rule.use-case.ts` + `upsert-pii-field-mapping.use-case.ts` + `place-legal-hold.use-case.ts` / `release-legal-hold.use-case.ts` — all AM only, all audited with `before`/`after` snapshots.
19. `trigger-retention-run.use-case.ts` — accepts an optional date range, runs the worker logic for that range, returns the summary, audits the manual trigger.
20. `list-retention-runs.use-case.ts` — reads `audit.retention_run_completed` entries via the audit repository (AM only).
21. `audit-retention.routes.ts` — all the above endpoints.
22. Integration tests for each endpoint.

**Checkpoint**: operators have full control of the retention and redaction configuration and a queryable run history.

### Wave 6 — Polish & verification

23. Run full backend test suite: `pnpm --filter backend test` — zero regressions in the existing audit list/worker tests and the 006 cross-check tests.
24. Run typecheck on all workspaces.
25. Manual verification: (a) seed a fake legacy `DONE` appointment with `done_marked_by_user_id = NULL` and `done_checked_at = NULL`, confirm the retention worker preserves the audit entry; (b) run an erasure request for a test user with history across 3 action types and confirm the preview count matches; (c) confirm AM sees raw PII while OP sees partial masking while CL_ADMIN sees `[MASKED]`.
26. Document residuals (see Residual Risks and Assumptions below).

### Parallelism Opportunities

- **Wave 1** is mostly sequential on the schema migration but Prisma adapters + entity definitions (after the migration lands) can run in parallel per model.
- **Wave 2 is serial** — reversing the write-time redaction must land before reshaping the worker, because the worker's self-audit entry must contain non-redacted metadata.
- **Wave 3 and Wave 4** are independent of each other and can run in parallel: read-masking touches `ListAuditLogsUseCase`; erasure touches new use cases + a new routes file.
- **Wave 5** depends on Wave 1 (DB-backed category config must exist before the upsert endpoint is wired).
- **Wave 6** depends on all previous waves.

### Checkpoints per Wave

| Wave | Checkpoint criteria |
|---|---|
| 1 | Migration applies clean; Prisma client regenerates; `PersistentAuditService.log()` stamps `retention_category`; existing audit tests still green |
| 2 | Write path no longer destroys PII; retention worker moves rows to cold; cross-check preservation verified by integration test; self-audit entry produced |
| 3 | AM sees raw PII, OP sees partial masking, CL_ADMIN sees `[MASKED]`; archived entries queryable on opt-in only; `isArchived` marker correctly flagged |
| 4 | Erasure preview scans hot + cold + `tenant_portal_activities`; erasure execution redacts in place; meta-audit entry written without subject PII; concurrency with retention verified |
| 5 | AM can upsert categories / preservation rules / PII mappings / legal holds; manual retention trigger works for a date range; run history queryable |
| 6 | Full backend test suite green; manual smoke verified for the three critical-path scenarios |

### Critical Path

**Waves 1 and 2 are the critical path.** Specifically: (a) the `retention_category` column + `redaction_status` column must land before any erasure work, (b) reversing the write-time redaction must land before the read-time masking is useful (otherwise AM sees nothing to mask), (c) the worker reshape to hot→cold must land before the erasure workflow (otherwise erasure has only one tier to scan — which is technically fine, but the plan couples them for release hygiene).

## Testing Strategy

### Unit Tests (Vitest)

**Existing test files to extend:**
- `audit-retention.worker.test.ts` — RESHAPE. New cases: hot→cold move semantics, preservation for cross-check (unchanged behavior), preservation for legal hold, preservation for active dispute, skip rows with `redaction_status = 'IN_PROGRESS'`, configurable batch size, self-audit entry emitted once per run, `tenant_portal_activities` second pass.
- `list-audit-logs.use-case.test.ts` — EXTEND. New cases: OP partial masking (email / phone / name separately), `[REDACTED]` vs `[MASKED]` distinction, `includeArchived` param accepted for AM/OP, rejected (403) for CL_ADMIN, `isArchived` marker on response.
- `pii-redaction.test.ts` — EXTEND. New cases: `redactByFieldPath` helper, `paymentSettingsJson` opaque replacement, no mutation of non-matching paths.

**New test files:**
- `pii-read-mask.test.ts` — pure-function tier masking: `maskEmail('user@example.com', 'OP')` → `use***@example.com`, `maskPhone('+5511999999999', 'OP')` → `***9999`, `maskName('John Doe', 'OP')` → `J. D.`.
- `classify-audit-action.use-case.test.ts` — `'financial.billing_entry_created'` → `FINANCIAL`, `'auth.loginSuccess'` → `OPERATIONAL_GENERAL`, `'appointment.status_transition'` → `OPERATIONAL_CRITICAL`, unknown action → `OPERATIONAL_CRITICAL` (safest middle tier per FR-002).
- `preview-data-subject-erasure.use-case.test.ts` — subject resolution walks user + inspector history, scan returns per-category + per-tier counts, `customFieldsJson` matches go into `flaggedForReview`.
- `execute-data-subject-erasure.use-case.test.ts` — sets `IN_PROGRESS` then `FULL` or `PARTIAL`, writes the meta-audit entry without subject PII, returns a completion report.
- `place-legal-hold.use-case.test.ts` — AM-only, before/after audit, tenant-scoped.
- `trigger-retention-run.use-case.test.ts` — AM-only, date-range scoping, returns run summary.
- `prisma-erasure-pii-resolver.test.ts` — walks user + inspector + audit history, deduplicates, handles missing user gracefully.

### Integration Tests (Supertest + real DB)

- `audit-retention.worker.integration.test.ts` — **the critical-path integration test**:
  - Seed a legacy `DONE` appointment with `done_marked_by_user_id = NULL` and `done_checked_at = NULL`
  - Seed its `appointment.status_transition` audit entry older than 5 years
  - Run the retention worker
  - Assert the audit entry is STILL in `audit_logs` (not moved to cold)
  - Seed a financial audit entry from 6 years ago
  - Run the worker again
  - Assert the financial entry is STILL in `audit_logs` (7-year tier)
  - Seed a `user.updated` entry from 6 years ago
  - Run the worker again
  - Assert the user entry is now in `audit_logs_archive` and no longer in `audit_logs`
  - Assert a `audit.retention_run_completed` meta-audit entry was written with the correct summary
- `audit-erasure.routes.test.ts`:
  - Create a user with a history of 3 email changes over 2 years (seeded via `user.updated` audit entries)
  - `POST /v1/audit-erasure-requests` with `{ type: 'user_id', value: userId }`
  - `GET /v1/audit-erasure-requests/:id` → preview shows all 3 historical emails across all entries
  - `POST /v1/audit-erasure-requests/:id/confirm`
  - Fetch the entries by entity id → PII is `[REDACTED]`, action / entity / actor / timestamps intact
  - Verify the meta-audit entry `audit.data_subject_erasure_executed` exists and has NO subject PII
- `audit.routes.test.ts` extensions:
  - AM with `includeArchived=true` sees archived entries marked with `isArchived: true`
  - CL_ADMIN with `includeArchived=true` → 403
  - OP sees partial masking on a seeded entry containing email / phone / name
  - CL_ADMIN sees `[MASKED]` on the same entry

### Worker / Batch Behavior

- Retention worker with batch size of 5 and 20 eligible entries → processes in 4 batches
- Retention worker with 0 eligible entries → produces a self-audit entry with all zeros
- Retention worker on error mid-batch → halts that action's loop, logs the error, proceeds to the next action, still emits a self-audit entry with the error count

### Preservation Invariants (regression safety)

- Seed a mixed dataset with cross-check-protected entries, legal-hold-protected entries, active-dispute-protected entries, and plain-eligible entries
- Run the worker
- Assert the three preservation types are untouched
- Assert the plain-eligible entries are moved

### Redaction Correctness

- Erasure against a subject with PII in `before_json`, `after_json`, and `metadata_json` → all three are redacted
- Erasure against an entry that contains multiple subjects' PII → only the requested subject is redacted
- Erasure against a `paymentSettingsJson` field → entire field replaced with `[REDACTED]` (no internal parsing)
- Erasure against an already-erased entry → idempotent, no-op

### Cold-Storage Query Behavior

- `includeArchived = false` (default) → query hits only `audit_logs`
- `includeArchived = true` → query hits both tables, returns merged and sorted by `created_at desc`
- Archived entries carry `isArchived: true`; hot entries carry `isArchived: false`

### Concurrency: Retention vs Redaction

- Start an erasure that marks 10 rows as `IN_PROGRESS`
- Start the retention worker concurrently
- Assert the worker skips the 10 flagged rows and processes the rest
- Complete the erasure → `redaction_status = 'FULL'`
- Re-run the worker → the now-redacted rows are eligible for move if past retention

### 006 Invariant Verification (explicit)

This is the highest-severity regression test. It lives in `audit-retention.worker.integration.test.ts` as a dedicated block named `"preserves 006 cross-check origin lookup"`:

1. Seed an appointment in `DRAFT`, transition to `DONE` via `execute-status-transition.use-case.ts` → this writes an `appointment.status_transition` audit entry via the real `PersistentAuditService`.
2. **Do NOT** set `done_marked_by_user_id` on the appointment (simulates a legacy row).
3. Advance the clock 5 years (or use a config override to lower the `OPERATIONAL_CRITICAL` retention to 1 minute for the test).
4. Run the retention worker.
5. Assert the audit entry is STILL in `audit_logs` (cross-check preservation applied).
6. Call `perform-cross-check.use-case.ts` as a different user.
7. Assert the cross-check succeeds (i.e., the fallback audit scan finds the entry).
8. Advance the clock again, re-run the worker.
9. Assert the entry is NOW in `audit_logs_archive` (the preservation rule no longer applies because `done_checked_at IS NOT NULL`).

### Out of Scope for Testing This Pass

- Load testing of cold-storage queries with millions of rows (deferred)
- End-to-end erasure against `tenant_portal_activities` with multi-tenant isolation (covered at unit level; deferred for a dedicated integration harness)
- Partitioning migration of `audit_logs_archive` (deferred — plain table for MVP)
- Frontend operator console (no frontend in this wave)

## Residual Risks and Assumptions

### Residual Risks

| Risk | Severity | Owner / status |
|---|---|---|
| **Pre-020 entries permanently `[REDACTED]`** — write-time redaction was in place before; reversing it for new entries creates an asymmetric history. AM investigating incidents before 020 shipped will see `[REDACTED]` forever. | MEDIUM | **Documented residual**. Cannot be reversed (irreversibility clause from FR-014). Recorded in spec's Delivery Outcome when 020 ships. |
| **`customFieldsJson` unstructured PII queue** — entries flagged for manual review may accumulate if AM doesn't process them. | LOW | The erasure request tracks `entriesFlaggedForReview` separately; not a blocker for request completion. Operators can process them ad-hoc. |
| **Lazy backfill of `retention_category`** — entries written before 020 have `NULL` in the new column. The retention worker uses the classification helper to derive the category on the fly when `retention_category IS NULL`, so it's lazy-backfilled. | LOW | Alternative: one-shot migration script. Lazy backfill is simpler and avoids a long-running migration. |
| **Active-dispute preservation rule dependency on a "dispute" concept** — the spec defines "active dispute" informally. Until a dispute entity exists, the rule degenerates to "no-op" (no dispute records exist). | MEDIUM | Deferred: the rule exists in the preservation-rule registry as a stub; the worker evaluation looks it up but the match is always false until a dispute surface is built. Not a blocker because FR-008 (cross-check) and FR-010 (legal hold) cover the primary preservation needs. |
| **Retention worker and erasure use case share DB connections** — large workloads could contend. | LOW | pg-boss already rate-limits the retention schedule. Batch size is configurable. |
| **CL_ADMIN with `includeArchived=true`** — policy choice. | LOW — policy decision | Plan choice: **reject with 403** for clarity. CL_ADMIN audit access is hot-only per FR-026a. |
| **Legal hold with broad entity_type filter** — AM could place a hold like `entity_type = 'Appointment'` with no entity id, which would preserve every appointment audit entry forever. | LOW | The legal hold model requires both `entity_type` and `entity_id` (non-null). Holds are per-entity, not per-category. A future "category-wide hold" is deferred. |
| **Meta-audit entries from retention runs accumulate under `OPERATIONAL_CRITICAL` for 5 years** — at one run per day, that's ~1825 entries per 5 years. Manageable. | LOW | Negligible scale. |
| **Concurrency coordination relies on `redaction_status = 'IN_PROGRESS'`** — if erasure crashes mid-execution, rows stay flagged. | LOW | Add a time-based cleanup: rows in `IN_PROGRESS` for > 1 hour are auto-reset on the next worker run. Deferred; not a blocker. |
| **Category registry allows AM to change retention periods** — AM could shorten `FINANCIAL` to 1 day and purge financial evidence. | HIGH policy concern | Mitigation: the upsert use case validates minimum retention per category — `FINANCIAL ≥ 7 years`, `OPERATIONAL_CRITICAL ≥ 5 years`. The minimums are hardcoded constraints that the AM cannot lower. The upsert use case rejects the request with `RETENTION_PERIOD_TOO_SHORT`. |

### Assumptions

1. **The existing `audit_logs` table is the single write surface** for audit entries across every module. 020 reshapes it in place.
2. **`tenant_portal_activities` is the parallel PII surface** and gets the same retention + erasure treatment. No other table holds PII in audit-style snapshots.
3. **`PersistentAuditService.log()` is fire-and-forget** — errors don't propagate to the caller. 020 preserves this.
4. **The pg-boss `audit.retention` schedule runs once daily at 03:30** (already in the off-peak window). 020 does not add a new schedule.
5. **The cross-check preservation rule is non-disableable** — no AM can lower its priority or skip it. Enforced at the worker level via an inline guard that bypasses the DB-backed preservation rule table.
6. **`done_marked_by_user_id` is already deployed** on the appointments table and populated on every DONE transition by `execute-status-transition.use-case.ts`. 006's `PerformCrossCheckUseCase` reads this column first and falls back to the audit scan only for legacy rows with `done_marked_by_user_id = NULL`. 020's cross-check preservation rule only needs to protect the fallback path for those legacy rows.
7. **Hard deletion is off by default** for every category. Enabling it requires an explicit AM action via the upsert endpoint, which is itself audited.
8. **Erasure is AM-only** — no other role has access. Requests are not delegable.
9. **Cold storage is `audit_logs_archive`** inside the same PostgreSQL database. No external archival system. Cold storage is queryable from `ListAuditLogsUseCase` when `includeArchived = true`.
10. **Read-time masking applies only to un-redacted entries** — entries with `redaction_status = 'FULL'` show `[REDACTED]` to every role, never the partial mask.
11. **The `retention_category` column is lazy-backfilled** — the retention worker and `classify-audit-action.use-case.ts` compute the category on the fly for rows where the column is `NULL`. No long-running migration script is required.
12. **LGPD is the primary regulatory driver** — the 15-day erasure processing window is a product-level SLA, not a hard DB constraint. The spec carries it as SC-003; 020 supports meeting it but does not enforce it at the DB layer.

### Implemented Reality vs Approved Target

See the "Implemented Reality vs Approved Target" table in the Summary section. The plan treats the existing `AuditLog` model, `PersistentAuditService`, `AuditRetentionWorker`, `audit-retention.ts` module, and `pii-redaction.ts` helper as implemented reality and **extends** them with the retention category registry, preservation rules, legal holds, hot→cold tiering, erasure workflow, and read-time masking. There is one explicit reversal: the write-time PII destruction in `PersistentAuditService.log()` is removed. This is a product decision that aligns the code with the spec's FR-014 (redaction is on-demand) and FR-025 (AM sees full PII). Entries already written under the old path remain permanently `[REDACTED]`.

### Blocking vs non-blocking within 020

**Blocking** (must ship together for 020 to deliver the core compliance outcome):
- Wave 1 — schema + category registry
- Wave 2 — write-time reversal + worker reshape + hot→cold tiering + cross-check preservation under new semantics
- Wave 3 — read-time masking (AM / OP / CL_ADMIN) + cold-storage opt-in
- Wave 4 — erasure preview + execute + meta-audit entry

**Non-blocking (can ship as follow-up polish after MVP)**:
- Legal hold UI surface (backend endpoint is blocking; a web UI is polish)
- Active-dispute preservation rule enforcement (stub stays in the registry; concrete rule evaluation waits for a dispute surface)
- Manual-review queue UI for `customFieldsJson` flagged entries
- Partitioning migration of `audit_logs_archive`
- Cross-workspace lint cleanup (pre-existing unrelated errors, same convention as 018 / 019)
- A dedicated frontend operator console for retention / redaction (backend-only MVP per the spec's scope)

## Complexity Tracking

No constitution violations. No complexity justifications needed. The plan is additive across:
- 1 additive Prisma migration (4 new columns on `audit_logs`, 3 on `tenant_portal_activities`, 2 new archive tables, 5 new models, 4 new enums)
- 1 reshaped worker (same schedule, same job name, same registration)
- 11 new / extended use cases
- ~16 new endpoints (1 extended on `GET /v1/audit-logs` + 4 erasure endpoints + 11 retention/preservation/legal-hold/pii-mapping endpoints) across 2 new routes files + 1 extended routes file
- 1 reversal (write-time PII destruction removed from `PersistentAuditService.log()`)

The most delicate piece is **Wave 2** because it bundles two behavioral reversals: (a) removing the write-time PII destruction so AM can see raw PII going forward, and (b) replacing the hard-delete retention worker with a hot→cold tiered mover. Both are explicitly tested under the cross-check preservation invariant from feature 006.
