# Feature Specification: Tenants & Branches

**Feature Branch**: `002-tenants-branches`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED (Phase 1) — pending review for Phase 2/3 gaps
**Sources**:
- Code: `apps/backend/src/modules/tenant/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/{schemas,enums}/tenant*`, `apps/web/src/features/tenants/**`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `apps/backend/CLAUDE.md`, `projeto-consolidado/modelo-dados-executavel.md`
- Legacy spec (to be superseded on approval): `specs/backend/tenant.spec.md`

> **Domain clarification.** In Properfy, **Tenant** means *real-estate agency* (imobiliária / cliente B2B). It is not a generic SaaS tenant abstraction, and it is NOT the same as the `TNT` role in identity-access, which represents the property inquilino (renter) authenticated via tenant-portal unique links.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, and `Source`.
> `Status` values: `IMPLEMENTED` (reality on the active branch), `APPROVED` (binding rule, implementation may be partial or absent), `GAP` (not yet approved as a rule, candidate for a future phase).
> `Source` values: `code`, `dossier`, `inferred`.

## User Scenarios & Testing

### User Story 1 — Onboard a new real-estate agency as a tenant

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Admin Master (AM) creates a new agency account in the platform by providing its commercial name, legal name, timezone, currency, and optional initial settings. The tenant is created in `PENDING` status and must be explicitly activated before CL users can operate. Creating the tenant also seeds two default appointment time slots so the agency can start scheduling.

**Why this priority**: Every downstream feature (users, properties, appointments, billing) requires a tenant record. Without this, nothing else starts.

**Independent Test**: As AM, call `POST /v1/tenants` with a valid payload and confirm the tenant appears in list/get endpoints with status `PENDING`, default time slots are present, and an audit record is written.

**Acceptance Scenarios**:

1. **Given** an AM actor with valid credentials, **When** they submit `POST /v1/tenants` with `name`, `legalName`, `timezone`, `currency`, **Then** a tenant row is created with `status = PENDING`, `deletedAt = null`, default timezone `Australia/Sydney` if omitted, default currency `AUD` if omitted, and two default time slots (`09:00-12:00`, `14:00-17:00`) are seeded.
2. **Given** a legal name already in use by any tenant (including inactive/deleted), **When** AM attempts to create a new tenant with the same `legalName`, **Then** the request fails with `TenantLegalNameConflict`.
3. **Given** a non-AM actor, **When** they call `POST /v1/tenants`, **Then** the request is rejected with `Forbidden`.
4. **Given** any actor, **When** required fields are missing or invalid per `createTenantSchema`, **Then** the request fails with `ValidationError` listing the offending fields.

---

### User Story 2 — List, search, and read tenants

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM browses all tenants with pagination, status filter, and text search. OP can only read their own tenant (same as CL_ADMIN). CL_ADMIN and CL_USER can read their own tenant for display in portal headers and settings screens. Each list row includes a `branchCount` aggregate to aid operations.

**Independent Test**: Seed multiple tenants with different statuses, call `GET /v1/tenants` as AM with filters, and confirm pagination, sorting, and branch counts match seed data.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they call `GET /v1/tenants`, **Then** the response is paginated (`page`, `pageSize`, `total`) with tenants including `branchCount`.
2. **Given** a `status` filter, **When** provided, **Then** only tenants matching that status are returned. The `search` query matches `name` or `legalName` substrings.
3. **Given** an OP, CL_ADMIN, or CL_USER, **When** they call `GET /v1/tenants`, **Then** the request is rejected with `Forbidden`. OP can only view their own tenant via `GET /v1/tenants/:tenantId`.
4. **Given** any authorized actor, **When** they call `GET /v1/tenants/:tenantId`, **Then** the tenant detail is returned; soft-deleted tenants are treated as `TenantNotFound`.

---

### User Story 3 — Update tenant profile and settings

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM updates any tenant field (`name`, `legalName`, `timezone`, `currency`, `settings`). OP updates their own tenant only, with the same field restrictions as CL_ADMIN — `name` and `settings` only (`IMPLEMENTED (implementation decision)` — dossiê does not specify OP's editable fields; see FR-007b). CL_ADMIN updates only their own tenant and only `name` and `settings`. Settings updates are **deep-merged** (`IMPLEMENTED (implementation decision)` — dossiê does not define merge vs. replace; see FR-005) with existing settings so that a partial patch does not erase unrelated keys.

**Independent Test**: As AM, patch a tenant's timezone and confirm the change persists. As CL_ADMIN, attempt to patch `timezone` on own tenant and confirm the field is ignored while `name`/`settings` persist. As CL_ADMIN of tenant A, attempt to patch tenant B and confirm `Forbidden`.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they call `PATCH /v1/tenants/:tenantId` with any combination of `name`, `legalName`, `timezone`, `currency`, `settings`, **Then** the supplied fields are updated and an audit record with `before`/`after` is written.
2. **Given** an OP actor and their own tenant, **When** they include `legalName`, `timezone`, or `currency` in the payload, **Then** those fields are silently stripped and only `name` and `settings` are applied (same restriction as CL_ADMIN).
3. **Given** an OP actor and a tenant that is not their own, **When** they call `PATCH`, **Then** the request is rejected with `Forbidden`.
4. **Given** a CL_ADMIN actor and their own tenant, **When** they include `legalName`, `timezone`, or `currency` in the payload, **Then** those fields are silently stripped and only `name` and `settings` are applied.
5. **Given** a CL_ADMIN actor and a tenant that is not their own, **When** they call `PATCH`, **Then** the request is rejected with `Forbidden`.
6. **Given** a `settings` patch containing a subset of keys, **When** applied, **Then** the existing `settings_json` is deep-merged so untouched keys remain intact.
7. **Given** a `legalName` change to a value already used by another tenant, **When** submitted, **Then** the request fails with `TenantLegalNameConflict`.

---

### User Story 4 — Deactivate a tenant

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM or OP (own tenant) deactivates a tenant that is no longer using the platform. Deactivation is blocked if the tenant has any open appointments (in `DRAFT`, `AWAITING_INSPECTOR`, or `SCHEDULED`) and requires a textual reason for audit. Deactivated tenants cause the auth middleware (feature 001) to reject client-role tokens for that tenant.

**Independent Test**: Create a tenant with open appointments, attempt to deactivate → expect `TenantHasOpenAppointments`. Cancel or complete the appointments, deactivate again → expect success and audit record. Verify a CL_ADMIN user of that tenant can no longer authenticate (cross-feature with 001).

**Acceptance Scenarios**:

1. **Given** an AM or OP (own tenant) actor and a tenant in `ACTIVE` or `PENDING` status with no open appointments, **When** they call `POST /v1/tenants/:tenantId/deactivate` with a reason, **Then** the tenant's `status` becomes `INACTIVE` and an audit record is written with `before`, `after`, and `reason`.
2. **Given** a tenant with at least one open appointment, **When** AM or OP attempts deactivation, **Then** the request fails with `TenantHasOpenAppointments` and the tenant stays unchanged.
3. **Given** an already-inactive tenant, **When** AM or OP attempts deactivation, **Then** the request fails with `TenantAlreadyInactive`.
4. **Given** a non-AM/OP actor (or OP attempting on a different tenant), **When** they call the deactivation endpoint, **Then** the request is rejected with `Forbidden`.
5. **Given** a soft-deleted tenant, **When** AM attempts any action on it, **Then** the request fails with `TenantNotFound`.

---

### User Story 5 — Create a branch inside an agency

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM (any tenant), OP (own tenant only), or CL_ADMIN (own tenant, **conditional on tenant enabling branch management** — see note below) creates a new branch (filial) under an active tenant. The branch gets an operational name, optional address, and an optional contact email. Branch names must be unique within the tenant.

> **CL_ADMIN conditional note**: The dossiê establishes that CL permissions for managing internal resources depend on explicit agency enablement in tenant settings. Whether CL_ADMIN can create branches is classified as `Source: code (implementation decision)` — the dossiê does not explicitly address CL_ADMIN branch creation. The code currently allows it.

**Independent Test**: Create two branches under the same tenant with different names → success. Attempt to create a third with a duplicate name → expect `BranchNameConflict`. Attempt to create a branch under an inactive tenant → expect `TenantInactive`.

**Acceptance Scenarios**:

1. **Given** an AM, OP (own tenant), or CL_ADMIN (own tenant), **When** they call `POST /v1/tenants/:tenantId/branches` with valid payload, **Then** a branch is created with `status = ACTIVE`, linked to the tenant, and an audit record is written.
2. **Given** a tenant in `PENDING` or `INACTIVE` status, **When** any actor attempts to create a branch, **Then** the request fails with `TenantInactive`.
3. **Given** a branch name already used within the same tenant, **When** a new branch is attempted, **Then** the request fails with `BranchNameConflict`. (Uniqueness is scoped to the tenant — the same name can exist in a different tenant.)
4. **Given** a CL_ADMIN actor and a tenant that is not their own, **When** they call create-branch, **Then** the request is rejected with `Forbidden`.

---

### User Story 6 — Update a branch

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

AM (any tenant), OP (own tenant only), or CL_ADMIN (own tenant) updates branch details (`name`, `address`, `contactEmail`). Status is **not** mutated via PATCH; activation/deactivation is handled through explicit endpoints.

**Independent Test**: Patch each field individually, confirm persistence. Rename a branch to a name already used in the same tenant → expect `BranchNameConflict`.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they call `PATCH /v1/tenants/:tenantId/branches/:branchId` with any subset of mutable fields, **Then** the supplied fields are updated and an audit record is written.
2. **Given** a rename collision within the tenant, **When** submitted, **Then** the request fails with `BranchNameConflict`.
3. **Given** a CL_ADMIN and a branch outside their tenant, **When** they attempt the update, **Then** the request is rejected with `Forbidden`.
4. **Given** any actor, **When** they include a `status` field in the payload, **Then** the field is ignored (status is controlled by activate/deactivate endpoints).

---

### User Story 7 — List and filter branches

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Operators and agency users browse branches with pagination, status filter, and text search. AM can query any tenant's branches; OP, CL_ADMIN, and CL_USER are scoped to their own tenant automatically via JWT context. Two shapes are exposed:

- `GET /v1/tenants/:tenantId/branches` — tenant-scoped path variant, used when the caller already has the tenant id.
- `GET /v1/branches` — flat variant used by the web portal; derives tenant from JWT for OP and client roles, or from the `tenantId` query param for AM. If AM omits `tenantId`, an empty paginated list is returned.

**Independent Test**: Seed branches across two tenants. As CL_USER of tenant A, call `GET /v1/branches` → expect only tenant A branches. As AM, call `GET /v1/branches?tenantId=<B>` → expect tenant B branches.

**Acceptance Scenarios**:

1. **Given** an AM with a `tenantId` query param, **When** they call `GET /v1/branches`, **Then** the branches of that tenant are returned.
2. **Given** an AM without a `tenantId` query param, **When** they call `GET /v1/branches`, **Then** an empty page is returned (no silent cross-tenant disclosure).
3. **Given** an OP, CL_ADMIN, or CL_USER, **When** they call `GET /v1/branches`, **Then** branches of their own tenant are returned regardless of any query param.
4. **Given** any authorized actor with the tenant-scoped path variant, **When** they call `GET /v1/tenants/:tenantId/branches`, **Then** results are paginated and filterable by `status` and `search`.

---

### User Story 8 — Deactivate a branch

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM or OP (own tenant) deactivates a branch that is being closed. Deactivation is blocked while the branch has open appointments and requires a textual reason for audit.

**Independent Test**: Create an open appointment on a branch → attempt deactivation → expect `BranchHasOpenAppointments`. Resolve the appointment → deactivate again → expect success.

**Acceptance Scenarios**:

1. **Given** an AM or OP (own tenant) actor and an `ACTIVE` branch with no open appointments, **When** they call `POST /v1/tenants/:tenantId/branches/:branchId/deactivate` with a reason, **Then** the branch's `status` becomes `INACTIVE` and an audit record is written.
2. **Given** a branch with at least one open appointment, **When** AM or OP attempts deactivation, **Then** the request fails with `BranchHasOpenAppointments`.
3. **Given** an already-inactive branch, **When** AM or OP attempts deactivation, **Then** the request fails with `BranchAlreadyInactive`.
4. **Given** a non-AM/OP actor (or OP attempting on a different tenant), **When** they call the deactivation endpoint, **Then** the request is rejected with `Forbidden`.

---

### Edge Cases

- **Soft-deleted tenant or branch** (`deleted_at IS NOT NULL`): excluded from all queries, all operations return `NotFound`. The row is retained for historical referential integrity (audit logs, past appointments).
- **Legal name reuse**: legal name uniqueness is global and does NOT exclude soft-deleted rows. To reuse a legal name, the old tenant must be hard-deleted at the database level (not exposed via API).
- **Settings deep-merge vs. delete**: the current update path deep-merges and therefore cannot clear a nested key. Setting a key to `null` is respected only if the JSON merge preserves the null. Explicit key removal is not supported in Phase 1.
- **Branch uniqueness case-sensitivity**: branch names are compared as stored — the current index is `UNIQUE (tenant_id, name)` with no lower-cased projection. Rename collisions are detected case-sensitively. The legacy spec calls for case-insensitive comparison (see GAP-007).
- **Cross-tenant branch access**: OP and CL users attempting to read a branch of another tenant receive `BranchNotFound` (not `Forbidden`) because the tenant-scoped repository hides existence.
- **Empty `tenantId` query on `GET /v1/branches` by AM**: intentionally returns an empty page rather than 400 — this simplifies the frontend when no tenant is selected yet. OP always sees their own tenant's branches.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

- **FR-001** (`Status: IMPLEMENTED, Source: code — PENDING is the schema default but the dossiê does not explicitly mandate it as a business rule; it is an implementation decision consistent with the data model`): System MUST create tenants in `PENDING` status, requiring explicit activation before CL users can operate. Activation path: see GAP-001.
- **FR-002**: System MUST enforce global uniqueness of `legal_name` across all tenants including soft-deleted rows.
- **FR-003**: System MUST enforce `UNIQUE (tenant_id, name)` on branches.
- **FR-004**: System MUST seed two default appointment time slots (`09:00-12:00`, `14:00-17:00`) when a new tenant is created.
- **FR-005** (`Status: IMPLEMENTED (implementation decision), Source: code — dossiê does not define merge vs. replace semantics`): System MUST deep-merge `settings_json` on tenant update so that partial patches preserve unrelated keys.
- **FR-006**: System MUST allow only AM to create or fully update tenants. AM or OP (own tenant) may deactivate tenants.
- **FR-007** (`Status: IMPLEMENTED, Source: code`): System MUST allow CL_ADMIN to update only `name` and `settings` of their own tenant; other fields are silently stripped at the use-case layer.
- **FR-007b** (`Status: IMPLEMENTED (implementation decision), Source: code — dossiê does not detail which fields OP may edit on a tenant; the code applies the same CL_ADMIN restriction to OP`): OP updating their own tenant is subject to the same field restrictions as CL_ADMIN (`name` and `settings` only); `legalName`, `timezone`, `currency` are AM-only.
- **FR-008** (`Status: IMPLEMENTED, Source: code — CL_ADMIN branch creation is an implementation decision; dossiê does not explicitly address whether CL_ADMIN can create branches`): System MUST allow AM, OP (own tenant), or CL_ADMIN (own tenant) to create and update branches; AM or OP (own tenant) may deactivate branches.
- **FR-009**: System MUST block tenant deactivation if any of its appointments are in `DRAFT`, `AWAITING_INSPECTOR`, or `SCHEDULED`.
- **FR-010**: System MUST block branch deactivation under the same open-appointments rule (scoped to the branch).
- **FR-011**: System MUST require a textual `reason` on every deactivation, persisted in the audit record.
- **FR-012**: System MUST produce an audit record for every tenant/branch create, update, and deactivate operation, including `before`/`after` snapshots.
- **FR-013**: System MUST scope all tenant-aware queries by `tenant_id` and MUST NOT trust tenant identifiers from request bodies/queries when the caller is OP or a client role (CL_ADMIN, CL_USER) — tenant is read from JWT. Only AM may specify a `tenantId` in the request.
- **FR-014**: System MUST validate all tenant/branch payloads against Zod schemas in `packages/shared/src/schemas/tenant.ts`.
- **FR-015**: System MUST reject branch creation when the tenant is not `ACTIVE`.
- **FR-016**: System MUST treat soft-deleted tenants and branches as non-existent in all read and write operations except historical foreign-key references.
- **FR-017**: System MUST return the per-tenant `branchCount` aggregate in tenant list responses.
- **FR-018** (`Status: APPROVED, Source: dossier`): System MUST check `tenant.status` in the auth middleware and reject client-role JWTs when the tenant is not `ACTIVE`. (Enforcement implemented in feature 001; this feature supplies the source of truth.)

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Tenant and branch endpoints SHOULD respond within 300 ms p95 under nominal load.
- **NFR-002** (`Status: IMPLEMENTED, Source: code`): Tenant and branch list endpoints MUST paginate; unbounded list responses are forbidden.
- **NFR-003** (`Status: IMPLEMENTED, Source: code`): All tenant/branch writes must be auditable — integration tests assert the audit record exists.

### Key Entities

- **Tenant** — `id`, `name`, `legal_name` (unique), `status` (`PENDING|ACTIVE|INACTIVE`), `timezone`, `currency`, `settings_json`, timestamps + `deleted_at`.
- **Branch** — `id`, `tenant_id`, `name`, `address_json`, `contact_email`, `status` (`ACTIVE|INACTIVE`), timestamps + `deleted_at`. Unique within tenant.
- **AppointmentChecker** (port) — domain interface consumed by deactivation use cases; validates the "no open appointments" invariant against the appointment module without creating a direct dependency.

Full field list, indexes, and invariants in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: 100% of tenant and branch list queries execute with a `tenant_id` scope or an explicit AM-authorized override. No query returns cross-tenant data to OP or client roles.
- **SC-002**: Every tenant/branch create, update, and deactivate operation produces exactly one audit record with `before` and `after` fields.
- **SC-003**: Deactivation attempts blocked by open appointments are asserted by integration tests using a real appointment checker (not the stub).
- **SC-004**: Default time-slot seeding on tenant creation is verified by an integration test reading the seeded rows.
- **SC-005**: The `branchCount` aggregate in list responses matches the actual count returned by `branchRepo.countByTenantIds`.
- **SC-006**: Legal name uniqueness rejects reuse across active and inactive tenants (test coverage).
- **SC-007**: CL_ADMIN update path silently strips non-permitted fields — integration test asserts unchanged values for stripped fields.

## Assumptions

- A tenant corresponds to a single real-estate agency. Multi-brand or sub-agency structures are out of scope for Phase 1.
- Timezone and currency are set at tenant level and inherited by branches. Per-branch overrides are out of scope.
- Branch reactivation (`INACTIVE → ACTIVE`) is not exposed in Phase 1. Operationally, an inactive branch is recreated if needed.
- Billing configuration (period, day) lives in `settings_json.billingPeriod` and is consumed by feature 010-billing-ledger; this feature owns persistence but not computation.
- Notification template overrides and branding assets are planned within `settings_json` but not yet represented in the Zod schema (GAP-002).
- `GET /v1/branches` with no tenant context for AM returns an empty page by design — no cross-tenant listing. OP always sees their own tenant's branches.
- **CL_ADMIN permissions are conditional**: the dossiê establishes that CL permissions for sensitive operations (including user management, financial view, report export, appointment cancel/reschedule) require **explicit agency enablement** in `tenant.settings_json`. CL_ADMIN is NOT free by default for all operations — each capability depends on whether the tenant has enabled it. Branch creation by CL_ADMIN is an `implementation decision` not explicitly addressed by the dossiê.
- **ServiceRegion is per-tenant** (decision 2026-04-06): geographic coverage regions belong to individual tenants. Any feature referencing service regions must scope them by `tenant_id`. The region entity is NOT global. See feature 004 CORRECTION-004 and the constitution v1.2.0 for the binding rule.

## Known Gaps

> Summary index only. Operational detail per gap lives in [`tasks.md`](./tasks.md) under Phase 2. Each gap is `Status: GAP` until promoted.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Activate tenant endpoint | ~~Tenants stuck in PENDING with no API path out.~~ **IMPLEMENTED** (Wave 1). | `ActivateTenantUseCase` AM-only. `PENDING→ACTIVE` and `INACTIVE→ACTIVE`. Route `POST /v1/tenants/:tenantId/activate`. Optional reason. Audit logged. |
| GAP-002 | Rich tenant settings schema | ~~Schema only had 4 keys.~~ **IMPLEMENTED** (Wave 2). | `tenantSettingsSchema` expanded to 20+ keys: branding (logo, color), notification sender (3 keys), billing config (period + day), 5 feature flags, inspector offer config (2 keys), `clUserPermissions` array, email template overrides (8 events). `.passthrough()` mode. Design doc at `settings-design.md`. |
| GAP-003 | Billing period cross-field validation | ~~No cross-field validation.~~ **IMPLEMENTED** (Wave 3). | `validateBillingSettings()` function in shared package. WEEKLY/BIWEEKLY requires `billingDayOfWeek`, MONTHLY requires `billingDayOfMonth`. 6 tests. |
| GAP-004 | CL_ADMIN fine-grained settings scope | ~~CL_ADMIN can merge arbitrary settings keys.~~ **IMPLEMENTED** (Wave 3). | `CL_ADMIN_SETTINGS_ALLOW_LIST` in `UpdateTenantUseCase`. Only branding + sender + email templates writable. Billing, permissions, feature flags are AM-only. 6 new tests. |
| GAP-005 | Domain events emission | ~~No typed domain events.~~ **IMPLEMENTED** (Wave 5). | `DomainEventBus` in `shared/application/events/`. 8 event types emitted from all tenant/branch write use cases. Fire-and-forget via `Promise.allSettled`. Bus exported on container for subscriber registration. 8 tests. |
| GAP-006 | Branch reactivation | ~~No API to reactivate branches.~~ **IMPLEMENTED** (Wave 1). | `ActivateBranchUseCase` AM-only. `INACTIVE→ACTIVE`. Route `POST /v1/tenants/:tenantId/branches/:branchId/activate`. Audit logged. |
| GAP-007 | Branch name uniqueness case-insensitivity | ~~Case-sensitive comparison.~~ **IMPLEMENTED** (Wave 4). | Functional unique index on `lower(name)`. `findByName` uses `mode: 'insensitive'`. Renaming own branch to different casing allowed. Migration `20260407000000`. 3 tests. |
| GAP-008 | Get-branch-by-id endpoint | ~~No GET branch by ID.~~ **IMPLEMENTED** (Wave 1). | `GetBranchUseCase` tenant-scoped. Route `GET /v1/tenants/:tenantId/branches/:branchId`. AM/OP/CL_ADMIN/CL_USER with tenant scope. |
| GAP-009 | Tenant hard-delete operational path | ~~No runbook.~~ **IMPLEMENTED** (Wave 5). | Runbook at `docs/runbooks/tenant-hard-delete.md`. Full cascade order (19 steps), verification queries, audit retention notes. No admin endpoint (decision documented). |
| GAP-010 | Per-tenant logo/branding asset upload | ~~No upload pipeline.~~ **IMPLEMENTED** (Wave 5). | `IBrandingStorageService` port + Supabase/stub impls. `GenerateLogoUploadUrlUseCase` + `ConfirmLogoUploadUseCase`. Routes: `POST .../branding/logo/presign`, `POST .../branding/logo/confirm`. AM + CL_ADMIN own tenant. 17 tests. |
| GAP-011 | Branch address schema | ~~Freeform address JSON.~~ **IMPLEMENTED** (Wave 4). | `branchAddressSchema` in `packages/shared/src/schemas/address.ts`. Structured: street, number?, complement?, suburb, city, state, postcode, country (ISO alpha-2, default AU), lat/lng?. Replaces `z.record(z.unknown())` in create/update branch schemas. 12 tests. |
