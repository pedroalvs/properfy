# Cross-Feature Gaps Index

**Last Updated**: 2026-04-13 (editorial reconciliation sprint)
**Status**: Living document — add/remove rows as gaps are closed and new features are migrated.

> **Reconciliation note (2026-04-13).** Between the 2026-04-06 snapshot and today, features 012..020 were specified and/or implemented and the Phase 2 gap-closure waves for 001–011 + 014 landed. This document has been brought into alignment with the repository state. See the **Closed gaps** table below for the per-feature closure commits. `CORRECTION-001` (OP tenant scoping) was superseded by DEC-003 (2026-04-19) — see `specs/DECISIONS.md` and the `Critical Corrections` section below.

## Critical Corrections (take priority over all gaps)

### CORRECTION-007: Schema Migration Drift

**Status**: **FULLY RESOLVED (2026-04-21)** — `prisma migrate status` against production reports `Database schema is up to date!` (53 migrations applied). Superseded phrasing: "RESOLVED IN REPO — production cleanup pending operator (2026-04-13)".
**Impact**: ~~HIGH until production `_prisma_migrations` is cleaned up~~ — resolved. All four defects closed.
**Surfaced by**: Sprint 1 W-1 testcontainers harness — first run against a clean Postgres container failed with `P3015: Could not find the migration file at prisma/migrations/20260406000000_add_password_reset_tokens/migration.sql`.

**Resolution status by defect**:
- Defect 1 (empty migration directory) → **RESOLVED**. A real migration file now lives at `20260406000000_add_password_reset_tokens/migration.sql` and applies cleanly on a fresh database (see CORRECTION-007 sprint, Phase B).
- Defect 2 (production Supabase failed migration row for `20260407000003_add_tenant_id_to_service_regions`) → **IN-REPO ANALYSIS DONE; OPERATOR ACTION REQUIRED**. The migration itself applies cleanly on a fresh database — the production failure was a state issue, not a migration bug. Runbook: see `docs/runbooks/correction-007-production-reconciliation.md`.
- Defect 3 (broken SQL in `20260408000002_add_audit_logs_fulltext_index`) → **RESOLVED IN REPO**. The SQL now references the correct `audit_logs` table name. The migration applies cleanly on a fresh database. Production may need `CREATE INDEX IF NOT EXISTS` execution if the index does not already exist there — the runbook covers both cases.
- Defect 4 (duplicate `20260407000003` prefix) → **ACCEPTED — not fixed**. Prisma orders duplicates alphabetically and both migrations apply in deterministic order. Renaming would force a production `migrate resolve` dance with zero functional gain. Documented as a cosmetic/hygiene issue.

**Verification (2026-04-13, CORRECTION-007 sprint)**:
- `prisma migrate deploy` against a fresh PostGIS container runs all 51 migrations cleanly and the second run is a no-op (idempotent).
- Every `@@map` table in `schema.prisma` is backed by a `CREATE TABLE` in the migration history (grep-verified for all 43 mapped tables).
- The W-1 harness now uses `migrate deploy` instead of `db push`, so the chain is validated on every real-DB test run.
- The CI `prisma-migrate-check` job has been un-gated (`continue-on-error: true` removed) — CI now hard-fails if any future migration drifts.

#### What was found

The W-1 testcontainers harness surfaced **four distinct migration defects** on a single clean-database replay:

**Defect 1 — Empty migration directory**
1. An empty untracked directory `prisma/migrations/20260406000000_add_password_reset_tokens/` existed on disk with no `migration.sql` file. It was created locally (probably via `prisma migrate dev --name add_password_reset_tokens`) and never committed. Removed during Sprint 1 to unblock W-1.
2. `schema.prisma` defines a `PasswordResetToken` model mapped to `password_reset_tokens`, with a relation from `User`.
3. Application code in `auth/application/use-cases/request-password-reset.use-case.ts`, `auth/application/use-cases/consume-password-reset.use-case.ts`, and `user/application/use-cases/reset-user-password.use-case.ts` actively uses the table.
4. Grep across every migration file for `password_reset_tokens` or `PasswordResetToken` returns **zero hits**. No migration creates this table.

**Defect 2 — Production Supabase has a failed migration recorded**
1. When the W-1 harness was first wired to run `prisma migrate deploy`, the `apps/backend/.env` file was silently being picked up by the Prisma CLI, causing the command to connect to **production Supabase** instead of the testcontainer.
2. Prisma reported: `P3009: migrate found failed migrations in the target database... The 20260407000003_add_tenant_id_to_service_regions migration started at 2026-04-11 19:56:45.304173 UTC failed`.
3. This means **the production Supabase database has a failed migration recorded** for the CORRECTION-004 migration. The failure happened on 2026-04-11, was never cleaned up via `prisma migrate resolve`, and prevents any new migration from being applied to production.
4. **Production schema state with respect to `service_regions.tenant_id` is unknown** from the repository. It is either: (a) the column does not exist (migration failed at CREATE COLUMN) — which would break every 004+ call site that assumes `tenant_id`; (b) the column exists but NOT NULL conversion failed with leftover nulls — which would break the new unique constraint; (c) someone manually patched production out-of-band and never cleaned up `_prisma_migrations`.
5. **This is the most serious finding of the three.** Production is in an unrepairable state from the repository's perspective: `migrate deploy` will reject every new migration until the failed row is resolved via `prisma migrate resolve --applied 20260407000003_add_tenant_id_to_service_regions` or `--rolled-back`, executed against Supabase directly with operator credentials.

**Defect 3 — Broken SQL in `20260408000002_add_audit_logs_fulltext_index`**
1. The migration SQL reads `CREATE INDEX "AuditLog_fulltext_idx" ON "AuditLog" USING GIN (...)`. It references the Prisma **model name** `AuditLog` instead of the actual database table name `audit_logs`. The Prisma model uses `@@map("audit_logs")` — the model name only exists at the Prisma client level.
2. Against a clean database: fails with `ERROR: relation "AuditLog" does not exist`.
3. Against production: either has always been in a failed state (consistent with Defect 2), or has been silently skipped.
4. The fix is a one-line edit: change `"AuditLog"` to `"audit_logs"`. The column references (`reason`, `metadata_json`) are correct.

**Defect 4 — Duplicate migration timestamps**
1. Two migration directories share the prefix `20260407000003`: `20260407000003_add_partial_unique_index_service_price_rules_null_branch` and `20260407000003_add_tenant_id_to_service_regions`.
2. Prisma orders by the full directory name alphabetically, so both eventually run, but the duplicate timestamp is a code-smell and makes the history harder to audit. The canonical Prisma migration workflow generates unique timestamps — this duplication implies a manual rename or a concurrent `migrate dev` run.

#### Why removing the empty directory is not a fix

Deleting the empty directory unblocked the FIRST failure. Defects 2, 3, and 4 remained underneath it. Sprint 1 W-1 pivoted from `prisma migrate deploy` to `prisma db push` in the harness to bypass the broken migration chain entirely. This is the correct scoped choice — the harness exists to provide a real-schema database for T061/T111, not to validate migration correctness. But it means the harness **cannot** verify that a clean-install environment will build successfully. That verification belongs to W-6 (CI migration validation) and is now explicitly blocked until the four defects above are resolved.

#### Why removing the empty directory is not a fix

Deleting the empty directory unblocked W-1 in Sprint 1 because `prisma migrate deploy` now runs without erroring. **But the underlying drift is unchanged.** A clean testcontainer database (or any fresh environment) will not have the `password_reset_tokens` table after all migrations apply. Any code path that touches password reset will crash with `relation "password_reset_tokens" does not exist`. The current tests never hit that path because they mock Prisma, which is exactly why the drift was invisible until the W-1 harness surfaced it.

#### Scope of work to resolve

This is **not** audit-ready backlog scope. It is a new finding that needs its own schema-reconciliation sprint. Minimum remediation in priority order:

1. **Defect 2 first (urgent — production is in a failed state)**: investigate the Supabase `_prisma_migrations` row for `20260407000003_add_tenant_id_to_service_regions`. Determine whether `service_regions.tenant_id` exists in production, whether it is NOT NULL, whether the unique index was created, whether the FK to `tenants` is in place. Based on that, either:
   - Run `prisma migrate resolve --applied 20260407000003_add_tenant_id_to_service_regions` if the schema state matches the migration's final goal, or
   - Run `prisma migrate resolve --rolled-back` and generate a corrective migration that backfills null tenant_ids before applying the constraint.
2. **Defect 3**: edit `20260408000002_add_audit_logs_fulltext_index/migration.sql` to change `"AuditLog"` to `"audit_logs"`. Then verify the index exists in production (run the CREATE INDEX manually if missing) and run `prisma migrate resolve --applied` against that migration.
3. **Defect 1**: generate a migration for `password_reset_tokens` that matches the current deployed table structure (use `prisma db pull` against production first, then `prisma migrate diff` against the schema to generate the corrective SQL). Commit as a new migration.
4. **Defect 4**: rename `20260407000003_add_tenant_id_to_service_regions` to a unique timestamp (e.g., `20260407000004_add_tenant_id_to_service_regions`), update `_prisma_migrations` on production to match.
5. **General audit**: grep every `@@map` in `schema.prisma` against the migration SQL — any model whose table name is not created by any migration is drifted.
6. **CI gate (this is `W-6`)**: add a CI step that runs `prisma migrate deploy` against a fresh database and asserts every model table is queryable post-migration. **This step is now blocked on Defects 1–4 being resolved first.**

#### Explicit follow-up registration

**Owner**: _unassigned_
**Target review date**: _not set_
**Last reviewed**: 2026-04-13 (Sprint 1 W-1)
**Recommended sprint**: schema-reconciliation sprint, before the next production deploy. This finding is **more urgent than any of the C-1..C-9 items in the audit-ready backlog** because it means the repository cannot rebuild the database from scratch today.

---

### CORRECTION-001: OP Must Be Tenant-Scoped (ALL features)

**Status**: **SUPERSEDED by DEC-003 (2026-04-19)** — see `specs/DECISIONS.md`. Superseded phrasing: "OPEN — product decision pending (as of 2026-04-13)".
**Impact**: ~~HIGH — security and data isolation concern~~ (resolved)
**Detail**: `.specify/memory/correction-op-tenant-scope.md`

The codebase treats OP as tenant-free in list/read paths (`tenant_id = null`, cross-tenant access). The approved dossier requires OP to have a mandatory `tenant_id` and operate only within its tenant. This affects every feature (001–011 + several 012+ flows). AM is the only tenant-free role.

**Verification 2026-04-13**: the divergence is still live. Grep of `actor.role === 'OP'` returns hits in at least 20 use-case files across `appointment`, `property`, `billing`, `user`, `tenant`, and `inspector` modules, and the pattern consistently reads `actor.role === 'AM' || actor.role === 'OP' ? filters.tenantId : actor.tenantId!` (i.e., OP is allowed to omit the tenant filter). `AuthorizationService.assertTenantScope` short-circuits on `actor.role === 'AM'` only, but list endpoints that accept a nullable `tenantId` bypass it.

**Why this was not closed by the 015–020 window**: feature 015 centralized `AuthorizationService` and the role matrix but deliberately did **not** rewire every cross-tenant list call site — that was out of the 015 scope. Subsequent features (016..020) inherited the existing pattern.

**Superseded 2026-04-19 (DEC-003)**: QA + auth-middleware audit confirmed OP cross-tenant is the correct and intended behaviour per CLAUDE.md §6. OP `tenant_id = null` in JWT; scope is supplied via `?tenantId=` query param when needed. This correction is closed.

**Explicit follow-up registration**:

This is the single open follow-up from the 001–020 reconciliation sprint that still requires a product decision. The options below are mutually exclusive and none is chosen here.

| Option | What it means | Cost | Trade-off |
|---|---|---|---|
| **Accept as-is** | Document that OP is intentionally cross-tenant in read/list paths because operational support staff need a cross-tenant view. Write paths remain guarded by `assertTenantScope` when a target tenant is specified. | Zero implementation cost. Requires updating the dossier / `.specify/memory/correction-op-tenant-scope.md` to record the decision. | Accepts a standing deviation from the original approved rule. |
| **Close it** | Rewire every `actor.role === 'AM' \|\| actor.role === 'OP'` cross-tenant branch to `actor.role === 'AM'` only. Add `tenantId` to OP JWT claims. Rewire `assertTenantScope` to enforce OP tenant equality. Update OP-related tests. | ~20 use-case files + JWT model + middleware + tests. Estimated 1–2 days. | Aligns code with the approved rule. Reduces OP operational reach until tenant-specific support tooling is built. |
| **Defer with owner + date** | Accept as-is for the 001–020 package release. Assign a named owner and a target date to revisit the decision (e.g., as a 021 scope). Add an alert to the JWT key-rotation runbook so OP tenant scoping is re-evaluated at the next rotation. | Zero implementation cost today. Requires a named owner and a scheduled review. | Lowest disruption for the current release; leaves the risk on the books with a clear handoff. |

**Decision needed**: the three options above are on the table. No option is selected in this reconciliation sprint. This entry exists so the decision cannot be silently forgotten.

**Owner**: _unassigned_
**Target review date**: _not set_
**Last reviewed**: 2026-04-13 (editorial reconciliation sprint)

### CORRECTION-002: Promote 001#GAP-003 and 001#GAP-009 to Approved Rules

**Status**: **CLOSED (2026-04-09)** — both items delivered.

- **001#GAP-003** (CL_USER fine-grained permissions) — delivered by feature 015 (`48a6a3d`, 2026-04-09) via the shared role matrix + 7 `CL_USER` permission flags enforced through `AuthorizationService.assertClUserPermission`. Further consolidated in feature 018/020 via per-use-case assertions.
- **001#GAP-009** (blacklist enforcement on create & admin reset) — delivered in commit `33039b8` (2026-04-07, 001 Phase 2 wave).

Both are classified `IMPLEMENTED` in their respective call sites. This correction is now editorial only (headers in `001-identity-access/spec.md` have been updated 2026-04-13 to reflect the delivered state).

### CORRECTION-003: 001 spec missing rules

**Status**: **CLOSED (editorial, 2026-04-07)** — the four missing rules were added to `specs/001-identity-access/spec.md` during the 001 Phase 2 closure wave (`33039b8`). `CL_ADMIN` user management is gated by the `allowClientUserManagement` tenant setting (enforced via `AuthorizationService.assertTenantSetting` in commit `7191794`). Audit event list, hybrid rate limiting, and password policy language are all present in the current spec.

### CORRECTION-004: ServiceRegion Must Be Per-Tenant (features 004, 005, 008)

**Status**: **CLOSED (2026-04-07)** — resolved in commit `017a883` (`feat(service-catalog): close all 10 gaps + CORRECTION-004 (Waves 1–4)`). Verified 2026-04-13.
**Impact**: HIGH — data model divergence, marketplace logic change (when the correction was open)
**Detail**: `.specify/memory/correction-service-region-scope.md`

**Delivered state**: `ServiceRegion.tenant_id` is a non-nullable `String` column with a foreign key to `Tenant` in `apps/backend/prisma/schema.prisma`. The domain entity (`service-region.entity.ts`) declares `readonly tenantId: string`. Every repository method (`findById`, `findByName`, `count`, `findAll`, `resolveRegionsForAppointments`, `findContainingPoint`, plus the region-containment queries) takes a mandatory `tenantId` parameter. Region names are unique per tenant. The 013 spec header was updated 2026-04-13 to reflect the resolved state.

**Residual**: the 013 User Story blocks still carry legacy `DIVERGENCE` labels from the original extraction pass — these are kept for historical context but the code-level divergence is closed.

### CORRECTION-005: Reclassify implementation decisions across all features

**Status**: **CLOSED (editorial, 2026-04-08)** — `Source:` label reclassification was applied across the 001–011 Phase 2 wave commits. The table below is preserved as the reclassification record. New features (012+) follow the `Source: code (implementation decision)` pattern by default.

| Feature | Item | Reclassified to |
|---|---|---|
| 002 | PENDING as initial tenant status | `Source: code (implementation decision)` |
| 003 | PropertyType enum (RESIDENTIAL, COMMERCIAL, INDUSTRIAL, RURAL) | `Source: code` |
| 003 | Property import XLSX/CSV | `Source: code` |
| 003 | Delete blocked by open appointments | `Source: inferred` |
| 005 | Service group state machine (DRAFT→PUBLISHED→ACCEPTED) | `Source: code (modeling decision)` |
| 005 | Exception type size limits (1-3, 1-8, 1-25) | `Source: code` |
| 006 | FR-014 AWAITING_INSPECTOR requires service_group_id | `Source: code (implementation decision)` — dossier allows AWAITING_INSPECTOR without group |
| 007 | Token revocation on reschedule | `Source: code (security decision)` |
| 007 | actorType=ANONYMOUS | `Source: code` |
| 008 | Min 1 photo hardcoded | `Source: code` — should be per service type |
| 009 | Zenvia for WhatsApp | `Source: code` — not canonical |
| 010 | Two-person approval universal for ALL entries | `Source: code (more restrictive than dossier)` |
| 010 | Refund only against APPROVED TENANT_DEBIT, one per debit | `Source: code` |
| 011 | Date range limits per report type | `Source: code` |
| 011 | Concurrent report limit (3 per user) | `Source: code` |

### CORRECTION-006: 002 spec — OP can deactivate tenants and branches

**Status**: **CLOSED (2026-04-07)** — delivered by commit `6963198` (002 Phase 2 wave). OP can now deactivate tenants and branches within their own tenant (the `actor.role === 'AM'` guard was widened to `AM` or `OP` with tenant-equality check). Subsumed by the transversal CORRECTION-001 review if OP is later re-scoped; until then, this deactivation path follows the current OP cross-tenant posture.

---

## Purpose

A single index of every `GAP-xxx` currently open across migrated features. Use this to prioritize Phase 2 work, spot cross-feature dependencies, and avoid reimplementing the same concern in multiple places.

Operational detail for each gap lives in the corresponding feature's `tasks.md`. This file is the index, not the source of truth.

## Reading guide

- **ID** — globally qualified `FEATURE#GAP-xxx`.
- **Impact** — `H`igh (blocks product or other features), `M`edium (degrades UX or ops), `L`ow (nice to have).
- **Depends on** — other gaps that must close first.
- **Blocks** — features or gaps that wait on this one.
- **Classification** — `APPROVED` rule not yet implemented, vs. `PROPOSED` (needs product approval before promoting).

## Open gaps

After the 2026-04-13 reconciliation, the only items kept in the Open table are:

1. `PROPOSED` items (future ideas that were never approved and therefore never in Phase 2 scope).
2. `CORRECTION-001` (OP tenant scoping) — tracked at the top of this file as a separate section with explicit product-decision options.

Everything previously listed as `APPROVED` for features 001–011 has been moved to the **Closed gaps** table with its closing commit, either by the 001–011 Phase 2 wave commits (2026-04-07 / 2026-04-08) or by a later feature (015, 017, 018, 019, 020). See the Closed table below.

| ID | Title | Impact | Classification | Notes |
|---|---|---|---|---|
| 001#GAP-005 | Device/session trust signals | M | PROPOSED | Not approved; future hardening idea |
| 001#GAP-008 | Soft-delete email reuse policy | L | PROPOSED | Not approved |
| 004#GAP-002 | Pricing rule currency coupling | M | PROPOSED | Not approved; 010 billing accuracy dependency if promoted |
| 004#GAP-007 | Pricing rule history | M | PROPOSED | Not approved; audit replay / billing disputes dependency if promoted |
| 004#GAP-008 | Service type hard-delete policy | L | PROPOSED | Not approved |
| 005#GAP-003 | Expire published groups after priority window | M | PROPOSED | Not approved |
| 005#GAP-004 | Re-publish after cancellation | L | PROPOSED | Not approved |
| 006#GAP-005 | Appointment soft-delete policy | L | PROPOSED | Not approved |
| 006#GAP-008 | Appointment number runbook | L | PROPOSED | Not approved |
| 007#GAP-003 | Token replay detection / single-use mutations | M | PROPOSED | Not approved; security hardening idea |
| 008#GAP-007 | Re-open finished execution | L | PROPOSED | Not approved |
| 008#GAP-008 | Asset retention policy | L | PROPOSED | Not approved |
| 009#GAP-005 | Proper templating engine | L | PROPOSED | Not approved |
| 009#GAP-010 | SMS fallback when email missing | M | PROPOSED | Not approved |
| 010#GAP-003 | Partial refunds | M | PROPOSED | Not approved; real-world refund scenarios idea |
| 010#GAP-006 | Void approved entries | L | PROPOSED | Not approved; legal compliance idea |
| 011#GAP-005 | User-defined column sets | L | PROPOSED | Not approved; report customization idea |
| 011#GAP-009 | Audit log full-text search | L | PROPOSED | Not approved; investigation ergonomics idea |

**Plus**: `CORRECTION-001` (OP tenant scoping) — **SUPERSEDED by DEC-003 (2026-04-19)**; see `specs/DECISIONS.md` and the `Critical Corrections` section. Superseded phrasing: "OPEN — product decision pending".

## Closed gaps

Every APPROVED gap from features 001–011 was closed either by the feature's Phase 2 wave commit (2026-04-07 / 2026-04-08) or by a downstream feature in the 015–020 window. The table below attributes each closure to its canonical closing commit. Commit hashes marked with a dagger (†) refer to work still held on the `015-permissions-rbac-matrix` integration branch that has not yet been squashed into named feature commits — those entries reference the feature rather than a hash.

| ID | Title | Closed on | Closing commit / PR |
|---|---|---|---|
| 001#GAP-001 | Self-service forgot password | 2026-04-07 | `33039b8` (001 Phase 2, Waves 1–6) |
| 001#GAP-002 | Admin manual unlock | 2026-04-07 | `33039b8` |
| 001#GAP-003 | CL_USER fine-grained permissions | 2026-04-09 | `48a6a3d` (feature 015, AuthorizationService + role matrix + 7 CL_USER flags) |
| 001#GAP-004 | TOTP opt-in for non-AM roles | 2026-04-07 | `33039b8` |
| 001#GAP-006 | Password history | 2026-04-07 | `33039b8` |
| 001#GAP-007 | Admin invite flow | 2026-04-07 | `33039b8` |
| 001#GAP-009 | Blacklist on create & admin reset | 2026-04-07 | `33039b8` |
| 001#GAP-010 | JWT key rotation runbook + alerting | 2026-04-07 | `33039b8` (runbook) + `8c9e7af` (Phase 3 audit polish) |
| 002#GAP-001 | Activate tenant endpoint | 2026-04-07 | `6963198` (002 Phase 2, Waves 1–5) |
| 002#GAP-002 | Rich tenant settings schema | 2026-04-07 | `6963198` |
| 002#GAP-003 | Billing period cross-field validation | 2026-04-07 | `6963198` |
| 002#GAP-004 | CL_ADMIN fine-grained settings scope | 2026-04-07 | `6963198` (+ `7191794` for `allowClientUserManagement` enforcement) |
| 002#GAP-005 | Domain events emission (`tenant.*.v1`, `branch.*.v1`) | 2026-04-07 | `6963198` |
| 002#GAP-006 | Branch reactivation | 2026-04-07 | `6963198` |
| 002#GAP-007 | Case-insensitive branch name uniqueness | 2026-04-07 | `6963198` |
| 002#GAP-008 | Get-branch-by-id endpoint | 2026-04-07 | `6963198` |
| 002#GAP-009 | Tenant hard-delete runbook | 2026-04-07 | `6963198` |
| 002#GAP-010 | Tenant branding asset upload | 2026-04-07 | `6963198` |
| 002#GAP-011 | Branch address schema | 2026-04-07 | `0808dae` (subsumed by 003#GAP-001 shared address schema) |
| 003#GAP-001 | Shared address schema across tenant, property, appointments | 2026-04-07 | `0808dae` (003 Phase 2, Waves 1–4) |
| 003#GAP-002 | Manual coordinate unlock path | 2026-04-07 | `0808dae` |
| 003#GAP-003 | PostGIS `coordinates` column population | 2026-04-07 | `0808dae` |
| 003#GAP-004 | Property hard-delete runbook | 2026-04-07 | `0808dae` |
| 003#GAP-005 | Batch audit for imports | 2026-04-07 | `0808dae` |
| 003#GAP-006 | Import idempotency payload verification | 2026-04-07 | `0808dae` |
| 003#GAP-007 | `property.rules_json` schema contract | 2026-04-07 | `0808dae` |
| 003#GAP-008 | Import error CSV export | 2026-04-07 | `0808dae` |
| 003#GAP-009 | Address autocomplete caching & rate limit | 2026-04-07 | `0808dae` |
| 003#GAP-010 | Geocoding retry and DLQ alerting | 2026-04-07 | `0808dae` |
| 004#GAP-001 | `requiresTenantConfirmation` default drift | 2026-04-07 | `017a883` (004 Phase 2, Waves 1–4 + CORRECTION-004) |
| 004#GAP-003 | `bonus_rule_json` schema contract | 2026-04-07 | `017a883` |
| 004#GAP-004 | PostGIS `geom` population on service regions | 2026-04-07 | `017a883` |
| 004#GAP-005 | Pricing rule NULL-branch uniqueness verification | 2026-04-07 | `017a883` |
| 004#GAP-006 | MultiPolygon + holes in service regions | 2026-04-07 | `017a883` |
| 004#GAP-009 | Region deactivation notifications | 2026-04-07 | `017a883` |
| 004#GAP-010 | Larger resolve-regions batches | 2026-04-07 | `017a883` (raised max from 25 to 200) |
| CORRECTION-004 | ServiceRegion per-tenant scoping | 2026-04-07 | `017a883` |
| 005#GAP-001 | Marketplace spatial indexing | 2026-04-07 | `25434b9` (005 Phase 2, Waves 1–4) |
| 005#GAP-002 | Extract shared PricingResolver service | 2026-04-07 | `25434b9` |
| 005#GAP-005 | Domain events for offer lifecycle | 2026-04-07 | `25434b9` |
| 005#GAP-006 | Lightweight marketplace list view | 2026-04-07 | `25434b9` |
| 005#GAP-007 | Accept-offer idempotency identity check | 2026-04-07 | `25434b9` |
| 005#GAP-008 | Manual assign idempotency | 2026-04-07 | `25434b9` |
| 005#GAP-009 | Wider update schema for DRAFT groups | 2026-04-07 | `25434b9` |
| 005#GAP-010 | Exception usage report | 2026-04-07 | `25434b9` |
| 006#GAP-001 | Typed reason codes (cancellation/rejection) | 2026-04-07 | `1c6aa70` (006 Phase 2, Waves 1–3) |
| 006#GAP-002 | Financial compensation on DONE → REJECTED | 2026-04-07 | `1c6aa70` |
| 006#GAP-003 | Tenant portal reschedule handoff protocol | 2026-04-07 | `1c6aa70` |
| 006#GAP-004 | Appointment import idempotency payload verification | 2026-04-07 | `1c6aa70` |
| 006#GAP-006 | Typed transition event contract | 2026-04-07 | `1c6aa70` |
| 006#GAP-007 | CL_USER permission set schema | 2026-04-09 | `48a6a3d` (feature 015 consolidated via shared role matrix) |
| 006#GAP-009 | `done_marked_by_user_id` column | 2026-04-07 | `1c6aa70` (column + `PerformCrossCheckUseCase` preference) |
| 006#GAP-010 | Compound DONE + cross-check endpoint | 2026-04-07 | `1c6aa70` |
| 007#GAP-001 | Formal reschedule handoff with feature 006 | 2026-04-07 | `4188fe8` (007 Phase 2, Waves 1–4) |
| 007#GAP-002 | Domain events for portal actions | 2026-04-07 | `4188fe8` |
| 007#GAP-004 | Auto-generate new token on reschedule | 2026-04-07 | `4188fe8` |
| 007#GAP-005 | Portal activity export endpoint | 2026-04-07 | `4188fe8` |
| 007#GAP-006 | Web UX for EXPIRED tokens | 2026-04-07 | `4188fe8` |
| 007#GAP-007 | Configurable cutoff per tenant | 2026-04-07 | `4188fe8` |
| 007#GAP-008 | Configurable reschedule window per tenant | 2026-04-07 | `4188fe8` |
| 007#GAP-009 | `last_accessed_at` telemetry dashboard | 2026-04-07 | `4188fe8` |
| 007#GAP-010 | DST correctness tests | 2026-04-07 | `4188fe8` |
| 008#GAP-001 | Geolocation verification at start | 2026-04-08 | `2226b1d` (008 Phase 2, Waves 1–3) |
| 008#GAP-002 | Consolidate inspector region data | 2026-04-08 | `2226b1d` |
| 008#GAP-003 | Availability slot booking integration | 2026-04-08 | `2226b1d` |
| 008#GAP-004 | Centralize T-1 rule | 2026-04-08 | `2226b1d` |
| 008#GAP-005 | Configurable time window per tenant | 2026-04-08 | `2226b1d` |
| 008#GAP-006 | Pause / auto-save in-progress execution | 2026-04-08 | `2226b1d` |
| 008#GAP-009 | Typed JSON fields on inspector | 2026-04-08 | `2226b1d` |
| 008#GAP-010 | Extract time-window service for feature 006 reuse | 2026-04-08 | `2226b1d` |
| 009#GAP-001 | Unsubscribe / opt-out management | 2026-04-11 | feature 018 † — `ProcessUnsubscribeUseCase`, `ReOptInUseCase`, HMAC token service, public `/v1/notifications/unsubscribe` route (spec: `specs/018-consent-notification-prefs/spec.md`) |
| 009#GAP-002 | WhatsApp template approval tracking | 2026-04-08 | `ec2a873` (009 Phase 2, Waves 1–4) |
| 009#GAP-003 | Per-tenant notification budget / rate limit | 2026-04-08 | `ec2a873` |
| 009#GAP-004 | Strict variables validation on send | 2026-04-08 | `ec2a873` |
| 009#GAP-006 | Poll-retryable batch cap | 2026-04-08 | `ec2a873` |
| 009#GAP-007 | Webhook signature validation | 2026-04-08 | `ec2a873` |
| 009#GAP-008 | Handler exception alerting | 2026-04-08 | `ec2a873` |
| 009#GAP-009 | Per-attempt audit trail | 2026-04-08 | `ec2a873` |
| 010#GAP-001 | Cancel use case for PENDING entries | 2026-04-08 | `fe8c822` (010 Phase 2, Waves 1–3) |
| 010#GAP-002 | Auto compensation on DONE → REJECTED | 2026-04-08 | `fe8c822` |
| 010#GAP-004 | Tenant invoice rolled-up document | 2026-04-08 | `fe8c822` |
| 010#GAP-005 | Tenant-timezone period boundaries | 2026-04-08 | `fe8c822` |
| 010#GAP-007 | Invoice regeneration | 2026-04-08 | `fe8c822` |
| 010#GAP-008 | Invoice PAID marking endpoint | 2026-04-10 | `175fdcb` (feature 017, single + batch mark-as-paid + reversal + reconciliation summary) |
| 010#GAP-009 | Summary endpoint date range | 2026-04-08 | `fe8c822` |
| 010#GAP-010 | Consolidate duplicate invoice routes | 2026-04-08 | `fe8c822` |
| 011#GAP-001 | Audit log retention policy | 2026-04-13 | feature 020 † — hot→cold retention worker with preservation rules, `AuditLegalHold`, IN_PROGRESS concurrency guard, 3-category minimums (`FINANCIAL ≥ 7y`, `OPERATIONAL_CRITICAL ≥ 5y`, `OPERATIONAL_GENERAL ≥ 2y`) |
| 011#GAP-002 | CL_ADMIN audit log read access | 2026-04-13 | feature 020 † — `ListAuditLogsUseCase` role-based masking (AM raw / OP partial / CL_ADMIN `[MASKED]`) |
| 011#GAP-003 | PII redaction in audit snapshots | 2026-04-13 | feature 020 † — on-demand `ExecuteDataSubjectErasureUseCase` + `redactByFieldPath`, PII field mapping registry |
| 011#GAP-004 | Scheduled / recurring reports | 2026-04-12 | feature 019 † — schedule lifecycle (create/read/update/pause/resume/soft-delete), `ScheduledReportRun` ledger, delivery fan-out, AM ownership reassignment |
| 011#GAP-006 | CSV and PDF output formats | 2026-04-08 | `d935015` (011 Phase 2, Waves 1–3) |
| 011#GAP-007 | Read replica routing for report reader | 2026-04-08 | `d935015` |
| 011#GAP-008 | Per-tenant concurrent report limit | 2026-04-08 | `d935015` |
| 011#GAP-010 | Email delivery of completed reports | 2026-04-12 | feature 019 † — `REPORT_READY` + `REPORT_FAILED` notification templates, `ProcessReportJobUseCase` emits on happy + failure paths |
| 012#GAP-002 | Overlapping time-slot rejection (FR-003b) | 2026-04-08 | `1c92edd` (feature 012) |
| CORRECTION-002 | Promote 001#GAP-003 and 001#GAP-009 to approved rules | 2026-04-09 | Editorial — delivered via `48a6a3d` + `33039b8` |
| CORRECTION-003 | 001 spec missing rules | 2026-04-07 | Editorial — `33039b8` (001 Phase 2 wave) + `7191794` (`allowClientUserManagement`) |
| CORRECTION-005 | Reclassify `Source:` labels across features | 2026-04-08 | Editorial — applied through 001–011 Phase 2 waves |
| CORRECTION-006 | OP can deactivate tenants and branches | 2026-04-07 | `6963198` (002 Phase 2 wave) |

**Legend**: † = delivered on the `015-permissions-rbac-matrix` integration branch as part of the 018 / 019 / 020 feature packages; not yet squashed into dedicated feature commits. Spec-level attribution is the canonical reference.

**Reconciliation note**: this table was compiled on 2026-04-13 from (a) the commit log for 001–014 Phase 2 closure waves, (b) the explicit `Closes XXX#GAP-YYY` references in the 015–020 feature closures, and (c) grep-verification of `CORRECTION-004`. Any PROPOSED items that never entered Phase 2 scope are kept in the Open table above as future-idea candidates.

## High-impact recommendations (historical, 2026-04-06)

The 7 items below were the load-bearing recommendations from the 2026-04-06 planning snapshot. All of them have since been delivered. This list is preserved as historical context — the actual delivery state lives in the **Closed gaps** table above.

1. ~~**003#GAP-001** (shared address schema)~~ — delivered `0808dae` (2026-04-07). Also closed **002#GAP-011**.
2. ~~**002#GAP-002** (rich tenant settings)~~ — delivered `6963198` (2026-04-07).
3. ~~**003#GAP-006** (import idempotency payload hash)~~ — delivered `0808dae` (2026-04-07).
4. ~~**PostGIS pair**: **003#GAP-003** + **004#GAP-004**~~ — delivered `0808dae` + `017a883` (2026-04-07).
5. ~~**002#GAP-001** (activate tenant)~~ — delivered `6963198` (2026-04-07).
6. ~~**001#GAP-003** (CL_USER permissions)~~ — delivered `48a6a3d` (feature 015, 2026-04-09).
7. ~~**004#GAP-005** (pricing rule NULL-branch uniqueness)~~ — delivered `017a883` (2026-04-07).

## Coordinated work bundles (historical, 2026-04-06)

All four bundles below shipped in the 2026-04-07 / 2026-04-08 Phase 2 wave. They are preserved as historical context.

### Bundle A — Shared address schema ✅ delivered (2026-04-07)

- ~~**002#GAP-011** (branch address)~~ — subsumed, closed by `0808dae`
- ~~**003#GAP-001** (shared address across tenant/property/appointment)~~ — driver, closed by `0808dae`

### Bundle B — PostGIS spatial readiness ✅ delivered (2026-04-07)

- ~~**003#GAP-003** (properties `coordinates` backfill)~~ — `0808dae`
- ~~**004#GAP-004** (service_regions `geom` backfill)~~ — `017a883`
- ~~**004#GAP-006** (MultiPolygon + holes)~~ — `017a883`
- ~~**005#GAP-001** (marketplace spatial indexing)~~ — `25434b9`
- ~~**004#GAP-010** (larger resolve-regions batches)~~ — `017a883`

Fully delivered via `ST_Contains` / `ST_Intersects` in the resolver and marketplace repository.

### Bundle C — Domain event bus ✅ delivered (2026-04-07)

- ~~**002#GAP-005** (tenants/branches domain events)~~ — `6963198`
- ~~**004#GAP-009** (region deactivation notifications)~~ — `017a883`
- ~~**005#GAP-005** (offer lifecycle events)~~ — `25434b9`

`DomainEventBus` is wired in `container.ts` and consumed by downstream features.

### Bundle D — Tenant settings overhaul ✅ delivered (2026-04-07)

- ~~**002#GAP-002** (rich tenant settings schema)~~ — `6963198`
- ~~**002#GAP-003** (billing period cross-field validation)~~ — `6963198`
- ~~**002#GAP-004** (CL_ADMIN fine-grained settings scope)~~ — `6963198` + `7191794` (`allowClientUserManagement` enforcement)
- ~~**002#GAP-010** (tenant branding asset upload)~~ — `6963198`

## Housekeeping rules

- When promoting a gap to `IMPLEMENTED`, move the row to "Closed gaps" with a date and commit reference, and update the corresponding `spec.md` Known Gaps table.
- When adding a new feature, append its gaps here in the same order as the feature's spec.
- A gap that spans multiple features lives under the feature that owns the decision, not under every consumer — cross-feature effects are captured in the Blocks column.
- Do NOT delete rows — history of closed gaps is useful for audit and retrospectives.
