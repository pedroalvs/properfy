# Feature Specification: Contacts Cross-Tenant Model (024)

**Feature Branch**: `022-contacts-screen-enhancement` (stacked on 022+023 — same branch / same PR; do NOT push until 024 lands)
**Created**: 2026-05-09
**Feature Status**: NEW — schema-level refactor of the Contact model from tenant-scoped to cross-tenant
**Predecessors**:
- `specs/021-contacts/` (initial registry — Contact tenant-scoped)
- `specs/022-contacts-screen-enhancement/` (REV 4 — Constitution v1.3.0 OP rollback + BUG-001)
- `specs/023-contacts-ux-refactor/` (REV 5 — UX unification + bulk re-send + RelationsTab)
**Source-of-truth user decision**: `memory/project_contacts_cross_tenant_model.md`
**Constitution alignment**: v1.3.0 (AM/OP cross-tenant) — proposes amendment to v1.4.0 (see §Constitution Amendment Proposal below)
**Dossier precedent**: `projeto-consolidado/modelo-dados-executavel.md` §2.4 (Inspector — cross-tenant entity) + §2.5 (junction-based linkage)

> **Stacking note.** This is the third feature stacked on the same branch (`022-contacts-screen-enhancement`). Commit chain at start: 022 (3 commits) → 023 (5 commits — design + impl + 2 fixes + docs). 024 stacks on top. **Do NOT push the branch until 024 is complete and QA cycle 2/2 passes** — the user wants 022+023+024 to ship as a single consolidated PR.

## Problem

After the 022+023 work shipped to local QA (5/5 PASS), the user observed that the current Contact model — tenant-scoped — forces operational duplication: the same person (property manager, broker, tenant/inquilino) often serves multiple agencies and ends up with N copies in the registry, one per tenant. The tenant relationship is operational (via appointments) not part of the contact's identity. This is structurally wrong — and contradicts the platform's existing pattern for cross-tenant entities.

## Goals

- Promote `Contact` from tenant-scoped (foreign key NOT NULL) to **cross-tenant intrinsically** — same entity model as `Inspector` (per dossier `modelo-dados-executavel.md` §2.4).
- Allow standalone contact creation (no appointment required at creation time).
- Enforce **global** uniqueness on `primary_email` and `primary_phone` (not per-tenant).
- Preserve current operational visibility: CL_ADMIN/CL_USER see only contacts with appointments in their tenant; AM/OP see everything.
- Preserve the Constitution v1.3.0 invariant: AM/OP cross-tenant; CL_* tenant-pinned.
- Preserve BUG-001 regression guards (`::text` casts only).
- Preserve all 022+023 behavioral guarantees (lazy-fetch, RelationsTab, bulk re-send, primary-only enforcement, BUG-001 source-scan, T-2-907 cross-form contract).

## Non-Goals

- Per-property primary entity (out of scope; "primary in N" stays derived from `appointment_contacts.is_primary`).
- Search by linked property/branch name (GAP-002 from 022 — still deferred).
- Audit event for contact↔appointment link/unlink (GAP-001 from 022 — still deferred).
- Cross-tenant contact merge UI (any future "merge contacts that are the same person across tenants" tooling is out of scope; the global uniqueness on email/phone naturally enforces this at the registry level once dedup migration completes).
- Materialized views or trigger-maintained caches (Phase 2 — this spec keeps the read path on a composite-indexed EXISTS subquery, with EXPLAIN ANALYZE pinned to the PR; if NFR-301 fails under realistic load, a follow-up spec adds a denormalized `contacts.linked_tenant_ids` cache).

## Dossier alignment (validated with Regras)

The 024 model is not a divergence — it is a **realignment** of `Contact` to the platform's existing cross-tenant pattern.

- **Inspector precedent** (`modelo-dados-executavel.md` §2.4 lines 75-103): Inspectors are global entities with `client_eligibility_json` listing tenants they serve. Their tenant relationship is operational, not identity. Contact follows this pattern with `appointment_contacts` as the operational junction.
- **Junction pattern** (§2.5 lines 105-124): `appointment_contacts` snapshots the contact's data at link time, so PII contracts with the appointment's tenant are preserved per-link. The cross-tenant contact change does not weaken the snapshot guarantee — it strengthens it (a contact's email change in their canonical record never re-leaks across tenants because each `appointment_contacts` row froze the snapshot at link time).
- **Email/phone uniqueness silent in dossier** (cross-checked: §10 line 572 LGPD pendency open). The Inspector pattern + User pattern (login email is unique global) both treat person-keyed identifiers as globally unique. 024 aligns Contact to that platform convention.
- **Visibility silent in dossier**. The user's decision (CL_* see only own-tenant via EXISTS; AM/OP see all) is consistent with how Properties/Appointments are visible today (CL_* tenant-scoped via `auth.tenantId`; AM/OP unscoped).

### Conflicts with dossier — resolved

Regras consultation flagged four points where the user's locked decisions interact with the dossier; each is resolved in this spec.

**Conflict A — Portal update propagation.** The dossier (preserved in 021 FR-052) says portal-side contact updates by the inquilino write to BOTH the appointment snapshot AND the canonical registry contact. Under the new cross-tenant model, the registry write becomes visible to other tenants on future linkages (existing junction snapshots stay frozen). **Resolution**: preserve the 021 contract unchanged. Rationale: the inquilino is correcting their own data; the correction propagating to future use is the desired outcome. Existing snapshots in unrelated tenants are unaffected because the snapshot pattern (021 FR-034) freezes the data at link time. This resolution is documented in spec FR-345 below and gets a regression test (T-2-407 inherits — augmented to assert global registry propagation does NOT mutate other tenants' snapshots).

**Conflict B — Cardinality 1:1 obligatory in dossier §4 line 510.** The dossier currently states that contact↔appointment cardinality is 1:1 mandatory; standalone contacts are not contemplated. **Resolution**: this is an explicit override approved by the user (memory `project_contacts_cross_tenant_model.md`) — standalone is allowed; cardinality becomes 0..N (zero or more appointments per contact). The Constitution v1.4.0 amendment formalizes this; the dossier text should be marked `[SUPERSEDED 2026-05-09 by Constitution v1.4.0]` in a follow-up housekeeping pass (out of scope for 024 implementation, but flagged in the PR body so the dossier maintainer picks it up).

**Conflict C — Standalone orphan cleanup policy.** A standalone contact never linked to any appointment lives in the registry indefinitely, visible only to AM/OP. **Resolution**: no automatic cleanup. Operators may deactivate via the existing `is_active = false` flow (021 US3). A future "orphan janitor" tool is captured as GAP-304 — out of scope for 024.

**Conflict D — LGPD legal basis for cross-tenant visibility.** Dossier §10 line 572 marks LGPD compliance as a pending track; there is no explicit base legal documented for AM/OP viewing the same contact across multiple agencies. **Resolution**: the legal basis already in place for AM/OP cross-tenant access (Constitution v1.3.0 §RBAC: AM and OP are the platform's operational team) extends to Contact under the same umbrella — they were already viewing per-tenant copies of the same person; consolidation does not expand their access surface, it removes accidental duplication. The role-based PII mask from feature 020 continues to apply to audit reads. The dossier LGPD pendency is flagged in the PR body; no new contract is introduced by 024.

## Constitution Amendment Proposal (v1.4.0)

Constitution v1.3.0 §RBAC documents AM/OP as cross-tenant operational team and lists Inspector as cross-tenant. It does not yet mention Contact. v1.4.0 amendment (proposed by 024):

- §RBAC tenant-scope rule: add a sentence under the OP/AM rows clarifying that "operational entities a single person can map to multiple agencies — Inspector and Contact — are global rows linked to tenants via junctions; per-tenant access remains gated by `actor.role` plus the visibility rule below".
- New section "Per-tenant visibility on cross-tenant entities":
  - For AM and OP: full visibility, no scope filter applied.
  - For CL_ADMIN and CL_USER: visibility is filtered to entities reachable from `auth.tenantId` via the operational junction (`appointment_contacts → appointments` for Contact; `inspectors.client_eligibility_json` for Inspector — already implemented).
  - Standalone (junction-less) entries are visible only to AM/OP. Once a standalone contact is linked to an appointment, the contact becomes visible to the appointment's tenant via the operational junction.
- Amendment Log entry referencing this spec and `memory/project_contacts_cross_tenant_model.md`.

The amendment is not strictly required for the 024 implementation (the visibility rule lives in the use-case layer), but it formalizes the pattern so future features (e.g. a global Contact in 025-X tooling) cite the active rule rather than re-derive it. **Decision**: include the amendment in the 024 PR.

## User Scenarios & Testing

### User Story 1 — Operator creates a standalone contact (no appointment yet)

- **Priority**: P1
- **Status**: NEW
- **Source**: user-decision-2026-05-09

An operator (AM/OP/CL_ADMIN — write requires permission `contact.create` per 022 role-matrix) opens `/contacts` and creates a contact without linking it to an appointment. The contact lands with `tenant_id = NULL` (standalone). AM/OP can see it immediately in their listing; CL_ADMIN cannot see it (because there is no appointment yet that ties the contact to their tenant) — even the CL_ADMIN who created it. The CL_ADMIN sees the contact only after creating an appointment that links it.

**Acceptance Scenarios**:

1. **Given** an AM, **When** they `POST /v1/contacts` without `tenantId`, **Then** the contact is created with `tenant_id = NULL` and is visible to AM in `GET /v1/contacts`.
2. **Given** an OP at tenant X, **When** they `POST /v1/contacts` without `tenantId`, **Then** the contact is created with `tenant_id = NULL` (OP is cross-tenant per Constitution v1.3.0; the contact is platform-wide standalone), and is visible to OP in `GET /v1/contacts`.
3. **Given** a CL_ADMIN at tenant Y who creates a standalone contact, **When** they `GET /v1/contacts`, **Then** the contact is **not** in the response (no operational junction yet). The system creates the contact with `tenant_id = NULL`; the CL_ADMIN sees it only after linking it to an appointment in tenant Y.
4. **Given** any actor, **When** they create a contact whose `primary_email` collides with an existing active contact (anywhere on the platform), **Then** the request fails with `CONTACT_EMAIL_ALREADY_EXISTS`. Same for `primary_phone`.

### User Story 2 — Operator at tenant Y sees a contact who has appointments in tenant Y AND tenant X

- **Priority**: P1
- **Status**: NEW
- **Source**: user-decision-2026-05-09

A contact (the same person) is linked to appointments in tenants X and Y. CL_ADMIN at tenant Y sees the contact in `/contacts` (because the operational junction exists in Y) but only sees the appointments and properties from tenant Y in the detail view — never the data from tenant X. AM/OP see the full picture (all junctions from both tenants).

**Acceptance Scenarios**:

1. **Given** a contact with appointments in tenants X and Y, **When** a CL_ADMIN at Y queries `GET /v1/contacts`, **Then** the contact appears in the list.
2. **Given** the same contact, **When** the CL_ADMIN at Y opens `GET /v1/contacts/:id`, **Then** the response includes only the appointments and properties from Y (the tenant X linkage is filtered out).
3. **Given** the same contact, **When** an AM queries `GET /v1/contacts`, **Then** the contact appears (no scope filter for AM); the detail returns the full set of linkages from both tenants.
4. **Given** the same contact, **When** a CL_ADMIN at tenant Z (no linkage) queries `GET /v1/contacts/:id`, **Then** the response is `CONTACT_NOT_FOUND` (not FORBIDDEN — preserves the existing leakage-avoidance contract from 021 FR-022).

### User Story 3 — Operator updates a contact's email; the change does not retroactively re-leak across tenants

- **Priority**: P1
- **Status**: NEW
- **Source**: user-decision-2026-05-09

The snapshot pattern from 021 FR-034 is preserved: editing a contact's `primary_email` updates the canonical row but does NOT mutate `appointment_contacts.snapshot_email` for any existing junction row. This means a contact that had email `old@x.com` in tenant Y's appointment last month still shows `old@x.com` in tenant Y's audit/inspector views, even after the contact's email is updated to `new@x.com`. New appointments link with the new value. (This was already the behaviour in 021 — 024 does not change it; the spec re-asserts it because the cross-tenant model creates a stronger reason to depend on the snapshot.)

**Acceptance Scenarios**:

1. **Given** a contact linked to appointments in tenants X and Y with snapshot email `old@x.com`, **When** an AM updates the contact to `new@x.com`, **Then** all 4 acceptance scenarios from 021 US2 still pass: registry row updated, snapshots untouched.

### User Story 4 — Existing contacts continue to work after the migration

- **Priority**: P1
- **Status**: NEW
- **Source**: user-decision-2026-05-09 ("BACKFILL")

The 20+ existing contacts in local + staging today have `tenant_id NOT NULL`. After the expand phase migration, they keep their `tenant_id` value and continue to function exactly as before. New contacts may have `tenant_id = NULL` (standalone) or carry `tenant_id` if a writer chooses to set it (backward-compatible).

**Acceptance Scenarios**:

1. **Given** the production-like seed (20+ contacts, all with `tenant_id NOT NULL`), **When** the expand migration is applied, **Then** every existing row is preserved unchanged; `tenant_id` is now nullable but no row gains NULL.
2. **Given** an OP at tenant Y after the migration, **When** they query `GET /v1/contacts`, **Then** they see the same contacts they saw before the migration (no behavioral change for the existing data set).

### Edge Cases

- **Email collision during dedup migration**: if two contacts in different tenants today share an email, the migration MUST detect this and fail loudly (NOT silently merge or pick one). The dedup pass produces a report; the user resolves manually before re-running. (See Migration Strategy §3.)
- **Contact deactivation across tenants**: a deactivated contact is hidden from search/autocomplete globally (the `is_active = false` flag is on the canonical row). CL_ADMIN at tenant Y with appointments referencing the deactivated contact still sees the snapshot data on those appointments (junction rows untouched).
- **Bulk re-send (023) cross-tenant**: the bulk endpoint dispatches per appointment, scoped by the actor's role per Constitution v1.3.0. AM/OP can target any appointment; CL_* can target only their tenant's appointments. The contact reachability rule (US2) does not change this — the appointment ownership is what governs the dispatch.
- **Audit `tenant_id` on standalone create**: the audit row records `actor.tenantId` as context (so OP at tenant X creating a standalone contact leaves a trail attributed to X) AND sets the `tenant_id` column on `audit_logs` to NULL (because the entity is not tenant-scoped). When a tenant later links the contact via an appointment, the `appointment.created` audit row carries the tenant's `tenant_id` (already true today).

## Requirements

### Functional Requirements

#### Schema migration (expand/contract)

- **FR-301**: System MUST execute a Prisma migration that makes `contacts.tenant_id` `NULLABLE` (`String?`).
- **FR-302**: System MUST execute a migration that drops the partial unique indexes `contacts_tenant_email_active_unique` and `contacts_tenant_phone_active_unique` (currently scoped by `tenant_id`) and replaces them with global partial unique indexes `contacts_email_active_unique` and `contacts_phone_active_unique` (`UNIQUE (primary_email) WHERE is_active = true AND primary_email IS NOT NULL` and the same for phone).
- **FR-303**: The migration MUST be **expand-only in this PR**. The contract phase (drop the existing per-tenant uniques, add global ones) requires a dedup pre-pass — see FR-310 below. Both phases run together if dedup completes; if dedup finds collisions, the migration aborts with a report and the user resolves manually before re-running.
- **FR-304**: Indexes on `contacts(tenant_id, *)` (the existing composites for type/is_active/display_name) are preserved during expand. They become hint-only: queries no longer use `tenant_id` as the primary filter for CL roles (they use the EXISTS subquery instead). The composites stay because some AM/OP browse paths still filter by tenant.
- **FR-305**: `Contact.tenant` Prisma relation becomes optional (`tenant Tenant? @relation(fields: [tenant_id], references: [id])`).

#### Dedup pre-pass

- **FR-310**: Before the global unique constraints are created, the migration MUST run a dedup pre-check: `SELECT primary_email, count(*) FROM contacts WHERE is_active = true AND primary_email IS NOT NULL GROUP BY primary_email HAVING count(*) > 1` (and the same for phone). If any rows return, the migration MUST abort and emit a report listing the colliding pairs. The user manually resolves (deactivate one of each pair, or merge — out of scope for 024) and re-runs the migration.
- **FR-311**: The dedup report MUST be a structured artifact (JSON) committed to the repo OR generated by a Prisma seed script invoked manually before migration. Decision: a one-off pre-migration script `apps/backend/prisma/scripts/024-pre-migration-dedup-check.ts` that queries the DB and exits 0 if no collisions, 1 with a report otherwise. The migration's `migration.sql` includes a guard at the top: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM contacts WHERE ...) THEN RAISE EXCEPTION 'Dedup pre-check failed; run prisma/scripts/024-pre-migration-dedup-check.ts'; END IF; END $$;` so the migration cannot be applied if collisions exist.

#### Visibility rule (CL roles see filtered set; AM/OP see all)

- **FR-320**: `GET /v1/contacts` for CL_ADMIN and CL_USER MUST filter the result set to contacts where `EXISTS (SELECT 1 FROM appointment_contacts ac JOIN appointments a ON a.id = ac.appointment_id WHERE ac.contact_id = c.id AND a.tenant_id = $auth.tenantId)`. AM and OP do NOT receive this filter — they see all contacts including standalone (NULL) and contacts of other tenants.
- **FR-321**: `GET /v1/contacts/:id` for CL_ADMIN and CL_USER MUST return `CONTACT_NOT_FOUND` if no operational junction exists in `auth.tenantId` (preserves 021 FR-022 leakage avoidance).
- **FR-322**: `GET /v1/contacts/:id?includeAppointments=true&includeProperties=true` (the Relations tab data) for CL_ADMIN and CL_USER MUST return only appointments and properties whose `tenant_id = auth.tenantId`. AM/OP receive the full set.
- **FR-323**: `branchIds` filter (from 023 FR-220) MUST continue to work; for CL roles, the branch filter applies AFTER the visibility filter (intersection). For AM/OP, branchIds applies as today (cross-tenant branch filter; AM/OP must already pick a tenant or accept cross-tenant results — current 023 behaviour).
- **FR-324**: The `propertyCount` and `primaryInPropertyCount` aggregations (022 FR-130 / 023 FR-221) for CL_ADMIN and CL_USER MUST count only properties whose `tenant_id = auth.tenantId` (do not double-count cross-tenant linkages). For AM/OP the aggregations remain unscoped.

#### Standalone contact creation

- **FR-330**: `POST /v1/contacts` MUST accept payloads without a resolvable tenant — i.e. `tenantId` may be omitted entirely OR explicitly set to `null` for AM/OP. For CL_ADMIN, the body `tenantId` is ignored and `tenant_id` is set to `auth.tenantId` (CL_ADMIN can create a contact in their tenant; the contact still passes the global email/phone uniqueness check).
- **FR-331**: The `Contact` Zod schema (`packages/shared/src/schemas/contact.ts`) MUST update `tenantId` to be optional and explicitly nullable for AM/OP path; remain auto-resolved for CL_ADMIN.
- **FR-332**: Standalone contact creation MUST emit an audit `contact.created` with `tenant_id = NULL` AND `metadata.actor_tenant_id = auth.tenantId` (for context — see Edge Case "Audit `tenant_id` on standalone create").

#### Audit

- **FR-340**: For contact CRUD events (`contact.created`, `contact.updated`, `contact.deactivated`, `contact.reactivated`), `audit_logs.tenant_id` is set to:
  - `null` when the contact is standalone (no `contacts.tenant_id` AND no operational junction yet), with `metadata.actor_tenant_id` recording the actor's tenant for traceability.
  - The contact's `tenant_id` when the contact has one (legacy behaviour for backfilled rows).
- **FR-341**: For `appointment.*` events that link a contact, `audit_logs.tenant_id` continues to be `appointment.tenant_id` (current behaviour — unchanged). The contact's own `tenant_id` is irrelevant here; the operational tenant of the appointment is the audit subject.

#### Portal update propagation (Conflict A resolved)

- **FR-345**: Portal-side contact updates by the inquilino (021 FR-052) MUST continue to write to BOTH the appointment snapshot AND the canonical registry contact. Under the cross-tenant model, the canonical write is now globally visible — meaning an inquilino who corrects their email via tenant Y's portal will see that email used in FUTURE linkages by tenant X (and any other tenant). EXISTING junction snapshots in unrelated tenants remain frozen per 021 FR-034 — no historical re-leakage. Regression test (extends T-2-407 from 023): inquilino updates email via portal → registry updated globally → existing snapshots in OTHER tenants unchanged.

#### Standalone orphan policy (Conflict C resolved)

- **FR-346**: System does NOT automatically clean up standalone contacts (those never linked to an appointment). Operators may deactivate via the existing `is_active = false` flow (021 US3). A future orphan-janitor tool is captured as GAP-304 — out of scope for 024.

### Non-Functional Requirements

- **NFR-301**: `GET /v1/contacts` p95 < 400 ms for CL_ADMIN at a tenant with up to 500 contacts visible (out of, say, 5,000 platform-wide). The EXISTS subquery uses indexes on `appointment_contacts(contact_id)`, `appointments(tenant_id, *)`, `properties(tenant_id)` — verified at planning time. Verification gate: EXPLAIN ANALYZE pinned to PR description.
- **NFR-302**: `GET /v1/contacts` p95 < 350 ms for AM/OP at a tenant with up to 5,000 contacts visible. (Slightly lower budget because no EXISTS filter applies.)
- **NFR-303**: Migration MUST complete in under 30 seconds against a Supabase staging DB seeded with 20+ contacts. (Realistic for the current scale; revisit at 100k contacts.)
- **NFR-304**: All 022 BUG-001 regression guards (source-scan + Testcontainers `pg_typeof`) MUST stay green. The 024 query additions use `::text` only.
- **NFR-305**: All 023 lazy-fetch invariants MUST stay green. RelationsTab continues to defer fetch until the tab is activated.

### Key Entities

No new entities. `Contact` schema mutates: `tenant_id` becomes nullable; partial unique indexes change scope. `AppointmentContact` (the junction) is unchanged. `Audit_logs` semantics are unchanged at the column level; only the use-case logic that populates them is refined per FR-340/341.

## Success Criteria

- **SC-301**: A CL_ADMIN at tenant Y querying `/contacts` sees only contacts reachable through their tenant's appointments (visibility filter applied).
- **SC-302**: An AM querying `/contacts` sees the full list including standalone contacts and contacts of any tenant (no filter).
- **SC-303**: Two contacts cannot both be created with the same active `primary_email` anywhere on the platform; the second create returns 400 `CONTACT_EMAIL_ALREADY_EXISTS`. Same for `primary_phone`.
- **SC-304**: The migration runs cleanly on the seeded staging DB (20+ contacts, no collisions). Backfill report is committed.
- **SC-305**: A CL_ADMIN at tenant Y who tries `GET /v1/contacts/:id` for a contact reachable only via tenant X receives `CONTACT_NOT_FOUND` — never the contact's data.
- **SC-306**: All 022+023 regression guards remain green: BUG-001 source-scan (now covering 4 methods + the new EXISTS subquery method), `pg_typeof` integration, T-2-907 cross-form contract, BUG-023-001 portal-token whitelist test, Constitution v1.3.0 OP cross-tenant Supertest.
- **SC-307**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green. `pnpm generate:api` re-run; `api-types.ts` reflects schema changes (`tenantId` optional in contact create payload).
- **SC-308**: PR description updated with the 024 reference label, the migration safety note, and EXPLAIN ANALYZE artifacts for the new EXISTS query.

## Assumptions

- The dedup pre-pass on the seeded staging DB returns zero collisions. **The user has 20+ contacts; if any pre-existing duplicate emails/phones exist, the migration aborts with a report and the user manually deactivates one of each pair before re-running.** This is the safest expand/contract pattern.
- Standalone contacts will be a minority of writes in the near term; the visibility-by-junction model (US2) is acceptable to operators because the typical workflow is to create-with-appointment.
- The Inspector cross-tenant model is the right precedent (validated with Regras). If the user disagrees later, 024 can be reverted by reapplying a migration that re-adds NOT NULL after re-tenanting standalone rows; the operational data model is not destructively changed by 024.
- LGPD/PII compliance for cross-tenant contacts is open in the dossier (`regras-negocio-respostas-cliente.md` §10 line 572). 024 does NOT introduce new PII visibility — it consolidates existing rows. The role-based mask from 020 still applies to audit reads.

## Known Gaps (carried + new)

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Audit log for contact↔appointment link/unlink | M | Carried from 022. Still deferred. The cross-tenant model makes this gap slightly more visible (operators may want to see "linked from tenant X" in the timeline), but the 020 audit mask + the `appointment.created/updated` events still cover the operational story. |
| GAP-002 | Search by linked property name/code | L | Carried from 022/023. Still deferred. |
| GAP-301 | Contact merge UI | M | If the user later wants to merge two pre-existing contacts that the dedup pass surfaces (same person, two tenants, two rows today), they need a merge tool. 024 enforces global uniqueness but does not provide a merge affordance. **Practical workaround for the dedup pre-pass**: deactivate one row, re-link any appointment that pointed at it to the other (manual SQL during migration window). |
| GAP-302 | Materialized view / cache for visibility filter | L | This spec keeps the read path on a composite-indexed EXISTS subquery (Phase 1). If NFR-301 fails under realistic load, a Phase 2 follow-up adds a `contacts.linked_tenant_ids text[]` cache populated by trigger. Out of scope for 024. |
| GAP-303 | Multi-row dedup tooling | L | Currently the dedup script only reports collisions; manual resolution. A future "merge wizard" UI is out of scope. |
| GAP-304 | Standalone orphan janitor | L | Standalone contacts (never linked) live indefinitely until manually deactivated. If volume becomes a problem, a scheduled job that flags orphans older than X days could be added. Out of scope for 024. |
| GAP-305 | Dossier housekeeping | L | After 024 lands, the dossier text at `regras-negocio-respostas-cliente.md` §4 line 510 (cardinality 1:1 mandatory) needs an `[SUPERSEDED 2026-05-09 by Constitution v1.4.0]` annotation. Tracked here for the dossier maintainer; not a code change. |

## Cross-References

- **021-contacts**: original tenant-scoped registry. Schema migration in 024 mutates the constraints; the snapshot pattern (FR-034) is preserved.
- **022-contacts-screen-enhancement** REV 4: BUG-001 regression guards + Constitution v1.3.0. 024 extends the source-scan to include any new repository methods.
- **023-contacts-ux-refactor** REV 5: bulk re-send, RelationsTab, primary-only enforcement. 024 layers visibility filter on top — the RelationsTab data fetch already groups by property; for CL_* the new visibility filter narrows the set further.
- **020-audit-retention-pii-redaction**: audit reads inherit the role-based mask unchanged.
- **Constitution v1.3.0**: AM/OP cross-tenant. 024 proposes amendment v1.4.0 to formalize the per-tenant visibility on cross-tenant entities (Inspector + Contact).
- **Memory `project_contacts_cross_tenant_model.md`**: user decisions locked 2026-05-09.

## Reference label for PR

`refactor.contacts.cross_tenant_model` (added on top of `refactor.contacts_ux.unify_and_align` from 023; both labels remain in the commit history of the consolidated PR).
