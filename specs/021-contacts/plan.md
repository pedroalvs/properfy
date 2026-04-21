# Implementation Plan: 021-contacts

**Branch**: `021-contacts` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/021-contacts/spec.md` + `specs/021-contacts/data-model.md`

## Summary

Feature 021 introduces a **per-tenant contact registry** as a cross-cutting capability for the Properfy platform. It promotes contacts from embedded appointment-local fields to first-class entities with stable UUIDs, tenant scoping, and reuse across appointments.

**What it does:**
- Creates a `contacts` table per tenant with identity, type, primary + additional channels, soft-delete
- Exposes CRUD + search/autocomplete endpoints (`POST`, `PATCH`, `GET /v1/contacts`)
- Revises `appointment_contacts` from an inline data table to a junction + snapshot pattern, where `contact_id` FK links to the registry and `snapshot_*` fields freeze the contact's state at link time
- Defines the "select or create inline" pattern for appointment creation/editing
- Provides the entity that `propertyManagerContactId` (bulk-edit), Job Details PM section, and notification recipient resolution depend on

**What it does NOT do:**
- No CRM functionality (no activity tracking, no pipeline, no scoring)
- No contact merge/dedup engine
- No cross-tenant contact sharing
- No notification preference management (that's 018-consent-notification-prefs, future extension via 021#GAP-003)
- No contact import (bulk CSV/XLSX) — tracked as 021#GAP-001
- No changes to appointment state machine, billing, or financial flows

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 + Fastify
**Primary Dependencies**: Prisma ORM, Zod (shared schemas), shared `AuditService`
**Storage**: PostgreSQL (Supabase). New table `contacts`. Revised table `appointment_contacts`. Requires `pg_trgm` extension for trigram search (enabled by default on Supabase).
**Testing**: Vitest (unit), Supertest (API integration), real-DB integration with testcontainers PostGIS image
**Target Platform**: Backend API (consumed by web + PWA)
**Project Type**: Backend module + shared schema additions + consumer updates
**Performance Goals**: Contact search (autocomplete) p95 < 200 ms. List p95 < 300 ms.
**Constraints**: Strict multi-tenant isolation. Snapshot immutability. Backward-compatible with nullable `contact_id` for legacy data.
**Scale/Scope**: Initial target ~500 contacts per tenant, ~5 contacts per appointment (bounded). No unbounded growth concerns in Phase 1.

### Implemented Reality vs Approved Target

| Aspect | Current Code | Target (this plan) |
|---|---|---|
| `appointment_contacts` table | 1-to-1 with inline `tenant_name`, `primary_email`, `secondary_email`, `primary_phone`, `secondary_phone` | Junction + snapshot with `contact_id` FK, `snapshot_name`, `snapshot_email`, `snapshot_phone`, `role` enum, `is_primary` |
| Contact registry | Does not exist | New `contacts` table with CRUD, search, tenant scoping |
| `packages/shared/src/schemas/contact.ts` | Flat `contactSchema` with `tenantName`, `primaryEmail`, `secondaryEmail`, `primaryPhone`, `secondaryPhone` | Two schemas: `contactRegistrySchema` (registry CRUD) and `appointmentContactLinkSchema` (junction linkage with `contactId` or `inline`) |
| PM/broker contact | No entity — referenced in specs as phantom `propertyManagerContactId` | `contacts` row with `type = PROPERTY_MANAGER`, linkable via `appointment_contacts` junction with `role = PROPERTY_MANAGER` |
| Contact entity | `AppointmentContactEntity` in `appointment/domain/` — read-only value object tied to appointment | New `ContactEntity` in `contact/domain/` — registry entity with its own identity + `AppointmentContactEntity` revised to junction shape |
| Notification recipient | `AppointmentContact.primaryEmail` read directly | `appointment_contacts.snapshot_email WHERE is_primary = TRUE` |
| Portal contact update | Writes to `appointment_contacts` row directly | Dual-write: snapshot on junction + registry on `contacts` (with conflict handling) |
| `ListAppointmentContactsUseCase` | Lives in appointment module, reads inline contact data | Stays in appointment module but reads from junction; reverse-lookup ("all appointments for contact X") moves to contact module |

### Modules Impacted

| Module | Impact | Nature |
|---|---|---|
| **`contact/` (NEW)** | Full module: domain, application, infrastructure, interfaces | New module |
| **`appointment/`** | Entity revision, repository revision, use case revisions (create, update, list-contacts), junction pattern | Significant revision |
| **`tenant-portal/`** | `UpdateContactUseCase` gains dual-write to contact registry | Minor revision |
| **`notification/`** | Handlers read `snapshot_email` instead of `primaryEmail` | Minor revision (field rename in repository reads) |
| **`inspector-execution/`** | No direct code change — PWA endpoint already delegates to appointment read, which changes its shape | Indirect (shape change in appointment detail response) |
| **`packages/shared/`** | New enums (`ContactType`, `ContactChannelType`, `AppointmentContactRole`), revised schemas | Shared changes |

### Entities / Repositories / Use Cases / Endpoints

**New (module: `contact/`)**:
- `ContactEntity` — domain entity
- `contact-validation.service.ts` — pure validation helpers (no I/O)
- `IContactRepository` — domain port
- `PrismaContactRepository` — infrastructure adapter
- `CreateContactUseCase`, `UpdateContactUseCase`, `DeactivateContactUseCase` — application
- `ListContactsUseCase`, `GetContactUseCase`, `SearchContactsUseCase` — application
- `POST /v1/contacts`, `PATCH /v1/contacts/:contactId`, `GET /v1/contacts`, `GET /v1/contacts/:contactId` — interfaces
- `contact.errors.ts` — `CONTACT_NOT_FOUND`, `CONTACT_EMAIL_ALREADY_EXISTS`, `CONTACT_PHONE_ALREADY_EXISTS`, `CONTACT_CHANNEL_DUPLICATED`, `CONTACT_NO_CHANNEL`

**Revised (module: `appointment/`)**:
- `AppointmentContactEntity` — revised from inline fields to junction shape (`contactId`, `role`, `isPrimary`, `snapshotName`, `snapshotEmail`, `snapshotPhone`)
- `IAppointmentRepository` — `saveContact(contact)` signature changes to accept junction shape; `findById` enrichment includes junction data
- `PrismaAppointmentRepository` — queries rewritten for junction table shape
- `CreateAppointmentUseCase` — accepts `contacts` array with `contactId` or `inline` pattern; calls `IContactRepository` for inline creates
- `UpdateAppointmentUseCase` — contact linkage changes propagated
- `ListAppointmentContactsUseCase` — reads from junction; optional JOIN to registry

**Revised (module: `tenant-portal/`)**:
- `UpdateContactUseCase` — dual-write to snapshot + registry (new dependency on `IContactRepository`)

**Revised (module: `notification/`)**:
- `notify-on-status-transition.handler.ts` — reads `snapshot_email` from junction instead of `primaryEmail`
- `notify-on-tenant-portal-action.handler.ts` — same field rename
- `DispatchRemindersUseCase` — same field rename

### Schema Changes (Prisma)

**New model**: `Contact` with all columns from `specs/021-contacts/data-model.md`.

**Revised model**: `AppointmentContact`:
- Add: `contact_id` (uuid, nullable FK), `snapshot_name` (varchar 200), `snapshot_email` (varchar 254, nullable), `snapshot_phone` (varchar 30, nullable), `role` (enum), `is_primary` (boolean)
- Backfill: copy `tenant_name` → `snapshot_name`, `primary_email` → `snapshot_email`, `primary_phone` → `snapshot_phone`, set `is_primary = true`, set `role = 'TENANT'`
- Phase 3 (later, after code migrated): drop `tenant_name`, `primary_email`, `secondary_email`, `primary_phone`, `secondary_phone`

**New enums**: `ContactType`, `ContactChannelType`, `AppointmentContactRole` (Prisma enum definitions).

**New indexes**: trigram GIN on `contacts.display_name`, partial uniques on email/phone per tenant, junction indexes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture** | ✅ PASS | New `contact/` module follows `domain/ → application/ → infrastructure/ → interfaces/` layering. Cross-module access via ports (e.g., appointment module imports `IContactRepository` port, not Prisma adapter). |
| **II. Multi-Tenant Safety** | ✅ PASS | `contacts.tenant_id` is mandatory. Repository always scopes by tenant. AM and OP are both cross-tenant accessors per CLAUDE.md §6 (list endpoints honour `?tenantId=` filter). Superseded note: "OP is tenant-scoped" — restored per `specs/DECISIONS.md` DEC-003 (2026-04-19). Partial unique indexes are per-tenant. No cross-tenant contact sharing by design. |
| **III. Test-Driven Development** | ✅ PASS | Plan includes unit tests (validation helpers, entity), integration tests (CRUD, search, junction linkage, snapshot immutability, portal dual-write), real-DB tests for migration safety. |
| **IV. Contract-First APIs** | ✅ PASS | New endpoints use Zod schemas in `packages/shared`. Existing schemas revised. OpenAPI auto-generated from Fastify routes. |
| **V. Simplicity** | ✅ PASS | No speculative abstractions. No merge engine. No cross-tenant features. JSON for additional channels (bounded cardinality, no need for separate table). Nullable `contact_id` for backward compat instead of forced migration. |
| **Audit** | ✅ PASS | All contact mutations audited (`contact.created`, `contact.updated`, `contact.deactivated`, `contact.reactivated`). Portal dual-write audited. |
| **RBAC** | ✅ PASS | CRUD restricted to AM, OP, CL_ADMIN. CL_USER creates contacts implicitly via appointment inline path only. INSP and TNT have no access. |
| **Knowledge Classification** | ✅ PASS | Plan distinguishes IMPLEMENTED REALITY (current code) from APPROVED TARGET (spec). Divergences documented in the table above. |

### Post-Design Re-Check

After Phase 1 design, verify:
- [ ] `IContactRepository` port is in `contact/domain/`, not in `contact/infrastructure/`
- [ ] `appointment/` module imports `IContactRepository` via DI container, never direct Prisma import
- [ ] All new endpoints validate via Zod schemas from `packages/shared`
- [ ] Migration is expand/contract — no destructive steps in a single deploy
- [ ] No code path queries `contacts` without `tenant_id` scope (except AM explicit cross-tenant)

## Project Structure

### Documentation (this feature)

```text
specs/021-contacts/
├── spec.md              # Feature specification (exists)
├── data-model.md        # Data model (exists)
├── plan.md              # This file
├── research.md          # Phase 0 output (below)
├── contracts/           # Phase 1 output (below)
│   └── contact-endpoints.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code

```text
# NEW module
apps/backend/src/modules/contact/
├── domain/
│   ├── contact.entity.ts
│   ├── contact.repository.ts          # IContactRepository port
│   ├── contact.errors.ts
│   └── contact-validation.service.ts  # Pure validation helpers
├── application/
│   └── use-cases/
│       ├── create-contact.use-case.ts
│       ├── update-contact.use-case.ts
│       ├── deactivate-contact.use-case.ts
│       ├── get-contact.use-case.ts
│       ├── list-contacts.use-case.ts
│       └── search-contacts.use-case.ts
├── infrastructure/
│   └── prisma-contact.repository.ts
└── interfaces/
    └── http/
        └── contact.routes.ts

# REVISED modules (files changed, not new)
apps/backend/src/modules/appointment/
├── domain/
│   ├── appointment-contact.entity.ts   # Revised: junction shape
│   └── appointment.repository.ts       # Revised: saveContact signature
├── application/use-cases/
│   ├── create-appointment.use-case.ts  # Revised: contacts array, inline/select
│   ├── update-appointment.use-case.ts  # Revised: contact linkage
│   └── list-appointment-contacts.use-case.ts # Revised: junction reads
└── infrastructure/
    └── prisma-appointment.repository.ts # Revised: junction queries

apps/backend/src/modules/tenant-portal/
└── application/use-cases/
    └── update-contact.use-case.ts       # Revised: dual-write

apps/backend/src/modules/notification/
└── application/handlers/
    ├── notify-on-status-transition.handler.ts  # Revised: snapshot_email
    └── notify-on-tenant-portal-action.handler.ts # Revised: snapshot_email

apps/backend/src/modules/notification/
└── application/use-cases/
    └── dispatch-reminders.use-case.ts   # Revised: snapshot_email

# SHARED package
packages/shared/src/
├── enums/
│   ├── contact-type.ts              # NEW: ContactType enum
│   ├── contact-channel-type.ts      # NEW: ContactChannelType enum
│   ├── appointment-contact-role.ts  # NEW: AppointmentContactRole enum
│   └── index.ts                     # REVISED: export new enums
├── schemas/
│   ├── contact.ts                   # REVISED: contactRegistrySchema + appointmentContactLinkSchema
│   └── index.ts                     # REVISED: export new schemas
└── types/
    ├── entities.ts                  # REVISED: Contact interface, AppointmentContact revised
    └── index.ts

# PRISMA SCHEMA
apps/backend/prisma/
├── schema.prisma                    # REVISED: Contact model, AppointmentContact revised, new enums
└── migrations/
    └── YYYYMMDDHHMMSS_add_contacts_registry/  # NEW migration
```

**Structure Decision**: New `contact/` module follows the exact same Clean Architecture pattern as all other modules (`appointment/`, `billing/`, etc.). The module is thin — no workers, no scheduled jobs, no external service integrations. Pure CRUD + search.

## Execution Strategy

### Phase 0 — Research & Unknowns Resolution

No critical unknowns remain. The architectural decisions were made during the spec review. Minor items to confirm during implementation:

1. **`pg_trgm` availability on Supabase**: confirm the extension is enabled. If not, use `ILIKE` with `lower(display_name) varchar_pattern_ops` index as fallback.
2. **Prisma enum support for `ContactType` / `AppointmentContactRole`**: confirm Prisma handles multi-enum addition in a single migration without conflicts with existing enums.
3. **Testcontainers PostGIS image**: confirm it supports `pg_trgm` out of the box (it should — it's a standard Postgres extension, not PostGIS-specific).

**Output**: `research.md` documenting confirmations, filed in `specs/021-contacts/`.

### Phase 1 — Schema + Shared Package + Domain Layer

**Serial — must complete before any consumer touches the new types.**

| Step | What | Files | Checkpoint |
|---|---|---|---|
| 1.1 | Add enums to `packages/shared` | `contact-type.ts`, `contact-channel-type.ts`, `appointment-contact-role.ts`, `index.ts` | `pnpm typecheck` passes |
| 1.2 | Revise `packages/shared/src/schemas/contact.ts` | Replace `contactSchema` with `contactRegistrySchema`, `contactRegistryUpdateSchema`, `appointmentContactLinkSchema`, `additionalChannelSchema` | `pnpm test --filter shared` passes |
| 1.3 | Add `Contact` model to Prisma schema + revise `AppointmentContact` model (expand phase only — add new columns, don't drop old ones) | `schema.prisma` | `npx prisma validate` passes |
| 1.4 | Generate and apply migration | `prisma/migrations/` | `npx prisma migrate dev` succeeds; `npx prisma migrate status` clean |
| 1.5 | Write backfill migration (copy legacy fields to snapshot fields, set `is_primary`, set `role`) | SQL in migration | Verify with `SELECT count(*) FROM appointment_contacts WHERE snapshot_name IS NULL` = 0 |
| 1.6 | Create `contact/domain/` layer | `contact.entity.ts`, `contact.repository.ts` (port), `contact.errors.ts`, `contact-validation.service.ts` | Unit tests for validation helpers pass |

**Checkpoint**: `pnpm typecheck && pnpm test` across all workspaces. No breaking changes to existing code yet — all new columns are nullable or have defaults.

### Phase 2 — Contact Module (CRUD + Search)

**Can run in parallel within this phase. No consumer dependencies yet.**

| Step | What | Depends On | Parallel? |
|---|---|---|---|
| 2.1 | `PrismaContactRepository` implementing `IContactRepository` | 1.6 | Yes (with 2.2) |
| 2.2 | Use cases: `CreateContactUseCase`, `UpdateContactUseCase`, `DeactivateContactUseCase` | 1.6 | Yes (with 2.1) |
| 2.3 | Use cases: `GetContactUseCase`, `ListContactsUseCase`, `SearchContactsUseCase` | 1.6 | Yes (with 2.1, 2.2) |
| 2.4 | HTTP routes: `contact.routes.ts` (all endpoints) | 2.1, 2.2, 2.3 | No — needs all use cases |
| 2.5 | Integration tests: CRUD, search, tenant scoping, email uniqueness, deactivation | 2.4 | No — needs routes |

**Checkpoint**: All contact endpoints work independently. `GET /v1/contacts?search=...` returns results with < 200 ms p95 on a seeded DB with 500 contacts. All integration tests pass.

### Phase 3 — Consumer Revisions (appointment, portal, notifications)

**Partially parallel. Appointment must go first (junction pattern), then portal and notifications in parallel.**

| Step | What | Depends On | Parallel? |
|---|---|---|---|
| 3.1 | Revise `AppointmentContactEntity` to junction shape | Phase 2 | No — foundational |
| 3.2 | Revise `PrismaAppointmentRepository` for junction reads/writes | 3.1 | No |
| 3.3 | Revise `CreateAppointmentUseCase` — accept `contacts` array (contactId or inline) | 3.1, 3.2, Phase 2 (uses `IContactRepository` for inline creates) | No |
| 3.4 | Revise `UpdateAppointmentUseCase` — contact linkage changes | 3.2 | Yes (with 3.5) |
| 3.5 | Revise `ListAppointmentContactsUseCase` — reads from junction | 3.2 | Yes (with 3.4) |
| 3.6 | Revise `tenant-portal/UpdateContactUseCase` — dual-write | Phase 2 (uses `IContactRepository`) | Yes (after 3.2) |
| 3.7 | Revise notification handlers — `snapshot_email` field name | 3.2 | Yes (after 3.2) |
| 3.8 | Integration tests for revised flows | 3.3–3.7 | No — needs all revisions |

**Checkpoint**: Appointment creation with `contactId` reference works. Appointment creation with `inline` contact creates registry + junction atomically. Portal contact update writes to both snapshot and registry. Notification handlers read `snapshot_email`. All existing appointment tests still pass (possibly with fixture updates).

### Phase 4 — Cleanup & Verification

| Step | What |
|---|---|
| 4.1 | Run full test suite: `pnpm test` across all workspaces |
| 4.2 | Run `pnpm typecheck` |
| 4.3 | Run `pnpm lint` |
| 4.4 | Verify Prisma migration status is clean |
| 4.5 | Verify no remaining references to legacy `appointment_contacts` fields in new code paths (grep for `tenantName`, `primaryEmail`, `secondaryEmail` in non-migration code) |

**Note**: Phase 3 column drop (removing legacy `tenant_name`, `primary_email`, etc. from `appointment_contacts`) is NOT part of this plan. It happens in a separate follow-up after all consumers are confirmed working on the new junction shape. This is the expand/contract pattern.

## Testing Strategy

### Unit Tests

| Subject | Location | What |
|---|---|---|
| `contact-validation.service.ts` | `tests/unit/contact/` | No-duplicate-channels rule, at-least-one-channel rule, intra-array uniqueness |
| `ContactEntity` | `tests/unit/contact/` | Entity construction, read-only props |
| Shared schemas | `packages/shared/src/schemas/contact.test.ts` | `contactRegistrySchema` valid/invalid, `appointmentContactLinkSchema` valid/invalid, enum values |
| `AppointmentContactRole` enum | `packages/shared/` | All values present, no typos |

### Integration Tests (Real DB)

| Subject | Location | What |
|---|---|---|
| Contact CRUD | `tests/integration/contact/` | Create, read, update, deactivate, reactivate. Tenant scoping. AM cross-tenant. |
| Contact search/autocomplete | `tests/integration/contact/` | Trigram search by name, email, phone. Performance with 500 seeded contacts. |
| Email uniqueness | `tests/integration/contact/` | Duplicate active email in same tenant → error. Different tenants → OK. Deactivated + new → OK. |
| Phone uniqueness | `tests/integration/contact/` | Same pattern as email. |
| Appointment creation with `contactId` | `tests/integration/appointment/` | Link existing contact → junction created with snapshot. Contact in different tenant → error. Inactive contact → error. |
| Appointment creation with `inline` | `tests/integration/appointment/` | Registry contact + junction created atomically. Snapshot matches registry. |
| Snapshot immutability | `tests/integration/contact/` | Update contact registry → existing appointment snapshots unchanged. |
| Portal dual-write | `tests/integration/tenant-portal/` | Portal update → snapshot updated + registry updated. Email conflict → snapshot updated, registry skipped, audit written. |
| Notification recipient | `tests/integration/notification/` | Handler reads `snapshot_email` from primary contact junction row. |
| Migration backfill | `tests/integration/contact/` | After migration, all `appointment_contacts` have `snapshot_name` populated, `is_primary = true`, `role = 'TENANT'`. |

### Migration Safety

- Migration is additive only (Phase 1–2 of the expand/contract). No column drops, no renames.
- Backfill query is idempotent (runs on NULL `snapshot_name` rows only).
- `pg_trgm` extension creation is idempotent (`CREATE EXTENSION IF NOT EXISTS`).
- New enums do not conflict with existing Prisma enums.
- Run `prisma migrate deploy` in a clean testcontainers DB to verify the migration applies from scratch.

### Tenant Scoping Tests

- Create contact as CL_ADMIN → scoped to JWT tenant.
- Create contact as AM → scoped to payload tenant.
- Create contact as OP → scoped to JWT tenant.
- List contacts as CL_ADMIN → only own tenant.
- List contacts as AM with tenantId filter → cross-tenant OK.
- Read contact from different tenant as CL_ADMIN → `CONTACT_NOT_FOUND` (not FORBIDDEN).
- Appointment creation with `contactId` from different tenant → error.

## Residual Risks & Assumptions

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **`pg_trgm` not available on Supabase plan** | Low (Supabase enables it by default) | Fallback to `ILIKE` with B-tree on `lower(display_name)`. Performance acceptable for <500 contacts. |
| **Existing tests break on `appointment_contacts` shape change** | Medium | Phase 1 is additive (new columns, no drops). Existing code continues reading old fields. Fixture updates happen in Phase 3 alongside code revisions. |
| **Portal dual-write complexity** | Medium | The conflict-handling path (registry update skipped on email collision) is tested explicitly. Audit trail (`contact.portal_update_skipped_conflict`) enables operator reconciliation. |
| **`contact_id = NULL` for legacy data indefinitely** | Low | Accepted by design. Legacy appointments are read-only in practice (DONE/CANCELLED). Operators can manually link contacts to active appointments through the UI if desired. No forced backfill. |
| **Snapshot drift from registry** | None (by design) | Snapshots are intentionally frozen. The only mutation path is the portal dual-write, which is explicit and audited. This is a feature, not a bug — audit integrity depends on snapshot immutability. |

### Assumptions

1. **`pg_trgm` is available**: Supabase PostgreSQL has `pg_trgm` enabled by default. If not, the GIN index creation fails gracefully and we fall back to B-tree.
2. **No bulk contact import in this round**: agencies seed contacts one-by-one through the appointment creation flow (inline pattern) or the dedicated CRUD. Bulk import is GAP-001.
3. **No frontend changes in this plan**: the contact CRUD endpoints are backend-only. The frontend (web appointment creation form, PWA Job Details) will be updated in a follow-up plan for features 006 and 008.
4. **CL_USER cannot CRUD contacts directly**: they create contacts implicitly via the inline appointment creation path. Direct `/v1/contacts` CRUD is CL_ADMIN+.
5. **Legacy column drop is a separate deployment**: Phase 3 (drop `tenant_name`, `primary_email`, etc.) is NOT part of this plan. It runs after all consumers are confirmed working on the junction pattern, in a dedicated migration.

### Open Items (none blocking)

All open items from the feedback round (OQ-1 through OQ-4) are unrelated to this feature. Feature 021 has no unresolved decisions — the architectural review resolved all questions before this plan was written.

## Complexity Tracking

No constitution violations to justify. The plan introduces:
- 1 new backend module (within normal project structure)
- 1 new Prisma model + 3 new enums
- Revisions to 4 existing modules (appointment, tenant-portal, notification, shared)
- No new external dependencies, no new workers, no new scheduled jobs
