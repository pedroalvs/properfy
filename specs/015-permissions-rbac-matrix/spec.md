# Feature Specification: Permissions & RBAC Matrix

**Feature Branch**: `015-permissions-rbac-matrix`
**Created**: 2026-04-06
**Feature Status**: FOUNDATION COMPLETE — AuthorizationService centralized with audit-on-denial across ~70 use cases; shared role matrix operational; all 7 CL_USER flags enforced; privilege escalation and self-approval prevention centralized; frontend permission guard ready. Remaining items are additional integration test coverage and UI adoption (non-blocking).
**Sources**:
- Code: `apps/backend/src/modules/*/application/use-cases/*.ts`, `apps/backend/src/shared/domain/cl-user-permissions.ts`, `apps/backend/src/shared/interfaces/auth-middleware.ts`
- Approved rules: `.specify/memory/constitution.md` (RBAC section), `.specify/memory/correction-op-tenant-scope.md`
- Cross-feature: `001-identity-access` (authentication, user CRUD), `006-appointments` (state machine actors), `010-billing-ledger` (financial authorization)

> **Reading guide.** This is a **cross-cutting specification** — it defines the canonical authorization model that all feature specs reference. It does NOT redefine authentication mechanics (login, tokens, sessions) covered by `001-identity-access`. It focuses on **who can do what, under which scope, and gated by which conditions**.
>
> `Status` values: `IMPLEMENTED` (enforced in code), `APPROVED` (binding rule, may not be fully enforced), `DIVERGENCE` (code contradicts an approved rule), `GAP` (not yet approved or implemented).

> **Cross-feature integration.** When writing or reviewing any feature spec, **reference this spec** for authorization rules instead of redefining permissions locally. Use the format: "Authorization per `015#role-matrix` — AM, OP (cross-tenant operational scope)." If a feature needs a new permission not listed here, propose an amendment to this spec.

## Approved Product Overrides - 2026-05-09

1. `AM` owns governance and master configuration:
   - tenant lifecycle
   - client records
   - service-type catalog
   - client pricing tables
   - inspector earnings rules
   - internal user management
2. `OP` is cross-tenant for operational flows only:
   - create services/appointments
   - group appointments on the map
   - offer groups/jobs to inspectors
   - communicate tenants
   - operate inspector marketplace and execution follow-up
3. `OP` does **not** inherit `AM` governance powers by convenience:
   - no tenant lifecycle management
   - no master pricing governance
   - no master service-type governance unless an explicit future decision says otherwise
4. `CL_ADMIN` and `CL_USER` remain tenant-scoped.
5. `INSP` is limited to own offers, schedule, execution, rejection-with-reason, and invoice-related surfaces promised by product.
6. Runtime actor `TNT` is limited to the appointment token flow:
   - accept
   - reject/decline
   - reschedule
   - request keys/access
   - submit free-text tenant note
7. User-facing appointment references and routine search MUST use `appointmentCode`, not raw UUIDs.

## User Scenarios & Testing

### User Story 1 — System enforces role-based scope on every protected action (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code + dossier

Every action in the platform is scoped by the actor's role. AM operates globally across all tenants. OP operates globally for operational flows only, but does not gain AM-only governance actions. CL_ADMIN and CL_USER operate within their own tenant. INSP operates within their own inspector identity and assignments. TNT is limited to a single tokenized appointment journey. No actor may see or modify data beyond the scope granted by this matrix.

**Why this priority**: Scope enforcement is the foundation of multi-tenant safety. Without it, data leaks between tenants.

**Independent Test**: As OP, list appointments for two tenants and confirm operational visibility where intended, then attempt an AM-only governance action and confirm forbidden. As CL_ADMIN of tenant A, attempt to create a user in tenant B — expect forbidden. As INSP, attempt to view an appointment they are not assigned to — expect not found.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they perform any action, **Then** they may target any tenant by specifying `tenantId`. No scope restriction applies.
2. **Given** an OP actor, **When** they perform an operational action, **Then** they may target any tenant by specifying `?tenantId=` (OP is cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003); when omitted, list endpoints return cross-tenant operational rows. Privilege-escalation and governance guards still apply: OP may not create internal users, mutate tenants, or execute AM-only configuration.
3. **Given** a CL_ADMIN or CL_USER actor, **When** they perform any action, **Then** the system scopes all queries and writes to their `tenantId` (from JWT). Attempting to access another tenant's data returns not found or forbidden.
4. **Given** an INSP actor, **When** they access appointments, **Then** only appointments where `inspectorId` matches the actor's `inspectorId` are visible. Unassigned appointments are not found.
5. **Given** any actor with a `tenantId` set, **When** their tenant is inactive or deleted, **Then** all requests are rejected at the middleware level with `TenantInactive`.

---

### User Story 2 — Platform enforces the role-action permission matrix (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

Each action in the platform has a defined set of roles that may perform it. The permission matrix is enforced in the application layer (use cases), not at the route level. When a role attempts an action it is not permitted to perform, the system returns a forbidden error.

**Why this priority**: The role-action matrix is the core authorization contract. Every feature depends on it.

**Independent Test**: For each row in the role matrix below, attempt the action as each role. Verify allowed roles succeed and forbidden roles are rejected.

**Acceptance Scenarios**:

1. **Given** any action listed in the role matrix, **When** a permitted role performs it, **Then** the action succeeds (assuming other business rules pass).
2. **Given** any action listed in the role matrix, **When** a non-permitted role attempts it, **Then** the system returns `FORBIDDEN` without executing the action.
3. **Given** a sensitive action (appointment state transition, financial operation, user deactivation), **When** performed by a permitted role, **Then** an audit record is produced.

**Role Matrix (canonical)**:

| Action | AM | OP | CL_ADMIN | CL_USER | INSP | Notes |
|--------|:--:|:--:|:--------:|:-------:|:----:|-------|
| **User Management** | | | | | | |
| Create internal user (AM/OP) | Yes | No | No | No | No | AM-only |
| Create tenant user | Yes | Yes | Cond. | No | No | CL_ADMIN: own tenant, requires tenant setting |
| List/read users | Yes | Yes | Yes | Yes | No | Scoped to own tenant for CL roles |
| Update user | Yes | Yes | Yes | No | No | CL_ADMIN: own tenant, client roles only |
| Deactivate user | Yes | Yes | No | No | No | |
| Reset user password | Yes | Yes | No | No | No | |
| **Tenant Management** | | | | | | |
| Create/update tenant | Yes | No | No | No | No | AM-only governance |
| Deactivate tenant | Yes | No | No | No | No | AM-only governance |
| **Property Management** | | | | | | |
| Create/update property | Yes | Yes | Yes | Flag | No | CL_USER: via permission flag |
| List/read properties | Yes | Yes | Yes | Yes | No | Scoped |
| Import properties | Yes | Yes | No | No | No | |
| **Master Configuration** | | | | | | |
| Manage client records | Yes | No | No | No | No | AM-only governance |
| Manage service-type catalog | Yes | No | No | No | No | AM-only governance |
| Manage client pricing tables | Yes | No | No | No | No | AM-only governance |
| Manage inspector earnings rules | Yes | No | No | No | No | AM-only governance |
| Manage inspector eligibility matrix | Yes | Yes | No | No | No | OP may operate the matrix needed to offer work correctly |
| **Appointment Lifecycle** | | | | | | |
| Create appointment | Yes | Yes | Yes | Flag | No | CL_USER: via `create_appointments` permission |
| Cancel appointment | Yes | Yes | Yes | Flag | No | CL_USER: via `cancel_appointments` permission; reason required |
| Reject appointment | Yes | Yes | No | Flag | No | CL_USER: via `reject_appointments` permission; reason required |
| Release (DRAFT -> AWAITING) | Yes | Yes | No | No | No | |
| Mark DONE (SCHEDULED -> DONE) | No | Yes | No | No | Yes | INSP marks from field; OP confirms via cross-check |
| Reopen DONE (DONE -> DRAFT) | Yes | No | No | No | No | AM-only; reason required |
| Force manual confirmation | Yes | Yes | No | Flag | No | CL_USER: via `force_confirmation` permission |
| Perform cross-check | Yes | Yes | No | No | No | Cannot self-approve (actor != inspector) |
| Communicate tenant / dispatch portal flow | Yes | Yes | No | No | No | Operational owner is OP |
| **Inspector Management** | | | | | | |
| Create/update inspector | Yes | Yes | No | No | No | Inspectors are cross-tenant entities |
| Deactivate inspector | Yes | Yes | No | No | No | Requires no open appointments |
| View inspector (own) | No | No | No | No | Yes | INSP sees own profile only |
| View inspector (eligible) | No | No | Yes | Yes | No | CL roles see eligible inspectors only |
| **Service Groups & Marketplace** | | | | | | |
| Create/manage service group | Yes | Yes | No | No | No | |
| Publish service group | Yes | Yes | No | No | No | |
| View marketplace offers | No | No | No | No | Yes | INSP-only |
| Accept marketplace offer | No | No | No | No | Yes | INSP-only; eligibility checks apply |
| Reject assigned work with reason | No | Yes | No | No | Yes | INSP action; OP may perform operational override where documented |
| Generate/view invoice flow | No | No | No | No | Yes | Inspector-facing invoice surface only |
| **Service Regions** | | | | | | |
| Create/update/delete region | Yes | Yes | No | No | No | OP may operate cross-tenant region flows where the product exposes them |
| List regions | Yes | Yes | Yes | Yes | Asgn | INSP: assigned regions only |
| Resolve regions | Yes | Yes | No | No | No | |
| **Financial Operations** | | | | | | |
| View financial entries | Yes | Yes | No | No | No | |
| Approve financial entry | Yes | Yes | No | No | No | Cannot self-approve |
| Create manual adjustment | Yes | Yes | No | No | No | Idempotent |
| Create refund | Yes | Yes | No | No | No | Idempotent |
| **Configuration** | | | | | | |
| Manage time slots | Yes | Yes | Yes | No | No | CL_ADMIN: own tenant |
| Manage service types | Yes | No | No | No | No | Master catalog, not day-to-day operations |
| Manage pricing rules | Yes | No | No | No | No | Master pricing governance |
| Manage notification templates | Yes | No | No | No | No | Master template governance |
| **Reports & Audit** | | | | | | |
| View reports | Yes | Yes | No | No | No | |
| Export reports | Yes | Yes | No | No | No | |
| View audit logs | Yes | Yes | No | No | No | |

**Legend**: `Yes` = always allowed in scope; `No` = forbidden; `Cond.` = conditional on tenant settings; `Flag` = requires CL_USER permission flag; `Asgn` = assigned resources only.

---

### User Story 3 — Admin configures CL_USER permissions per tenant (Priority: P1)

- **Status**: APPROVED RULE, PARTIALLY IMPLEMENTED
- **Source**: dossier + code (001#GAP-003)

An Admin Master or Operator configures which fine-grained permissions CL_USER actors have within a specific tenant. These permissions are stored in tenant settings and checked at action time. Without explicit enablement, CL_USER is limited to read-only access for most features.

**Why this priority**: CL_USER permissions are an approved binding rule. Without centralized enforcement, CL_USER actors either have too much or too little access.

**Independent Test**: Configure tenant A with `cancel_appointments` enabled for CL_USER. As CL_USER of tenant A, cancel an appointment — expect success. Remove the permission. Retry — expect forbidden. As CL_USER of tenant B (without the permission), attempt the same — expect forbidden.

**Acceptance Scenarios**:

1. **Given** an AM or OP actor, **When** they update a tenant's settings to include a CL_USER permission (e.g., `cancel_appointments`), **Then** the setting is persisted and an audit record is written.
2. **Given** a CL_USER actor whose tenant has `cancel_appointments` enabled, **When** they attempt to cancel an appointment, **Then** the system allows the action.
3. **Given** a CL_USER actor whose tenant does NOT have `cancel_appointments` enabled, **When** they attempt to cancel an appointment, **Then** the system returns `FORBIDDEN`.
4. **Given** a CL_USER actor, **When** they attempt any action not listed in the CL_USER permission flags (e.g., financial operations), **Then** the system returns `FORBIDDEN` regardless of tenant settings.

**CL_USER Permission Flags (canonical list)**:

| Flag | Action Gated | Status |
|------|-------------|--------|
| `cancel_appointments` | Cancel appointments (any cancellable status) | IMPLEMENTED |
| `reject_appointments` | Reject appointments | IMPLEMENTED |
| `force_confirmation` | Force manual tenant confirmation | IMPLEMENTED |
| `reschedule_appointments` | Reschedule appointments | IMPLEMENTED |
| `create_appointments` | Create new appointments | APPROVED, NOT YET IMPLEMENTED |
| `create_properties` | Create new properties | APPROVED, NOT YET IMPLEMENTED |
| `export_reports` | Export report data | APPROVED, NOT YET IMPLEMENTED |

---

### User Story 4 — CL_ADMIN capabilities are conditional on tenant settings (Priority: P2)

- **Status**: APPROVED RULE, NOT YET IMPLEMENTED
- **Source**: dossier (001#GAP-003, constitution)

Certain CL_ADMIN powers are not automatic — they depend on whether the tenant (agency) has enabled them in their settings. The most prominent example: CL_ADMIN can create and manage internal users only if the tenant explicitly enables user management.

**Why this priority**: Without this gate, every CL_ADMIN can create users, which may not be desired by all agencies.

**Independent Test**: Create tenant A with user management disabled. As CL_ADMIN of tenant A, attempt to create a user — expect forbidden. Enable user management for tenant A. Retry — expect success.

**Acceptance Scenarios**:

1. **Given** a tenant with user management disabled in settings, **When** a CL_ADMIN attempts to create a user, **Then** the system returns `FORBIDDEN`.
2. **Given** a tenant with user management enabled, **When** a CL_ADMIN attempts to create a CL_USER for their own tenant, **Then** the action succeeds.
3. **Given** a CL_ADMIN, **When** they attempt to create a non-client role (AM, OP, INSP), **Then** the request is rejected with `FORBIDDEN` regardless of tenant settings.

**CL_ADMIN Conditional Capabilities**:

| Setting | Capability Gated | Status |
|---------|-----------------|--------|
| `enable_user_management` | CL_ADMIN can create/manage users | APPROVED, NOT YET IMPLEMENTED |
| `enable_time_slot_management` | CL_ADMIN can manage appointment time slots | IMPLEMENTED (assumed enabled) |

---

### User Story 5 — System prevents privilege escalation and self-approval (Priority: P1)

- **Status**: IMPLEMENTED
- **Source**: code

The system enforces guardrails against privilege escalation (e.g., CL_ADMIN promoting a user to AM) and self-approval (e.g., an inspector cross-checking their own work, or an operator approving a financial entry they created).

**Why this priority**: These are critical security invariants. A failure here is a security vulnerability.

**Independent Test**: As CL_ADMIN, attempt to create a user with role AM — expect forbidden. As the inspector who marked an appointment DONE, attempt to perform the cross-check — expect forbidden. As the operator who created a financial entry, attempt to approve it — expect forbidden.

**Acceptance Scenarios**:

1. **Given** a CL_ADMIN actor, **When** they attempt to create or promote a user to AM, OP, or INSP, **Then** the request is rejected with `FORBIDDEN`.
2. **Given** an OP actor, **When** they attempt to create an internal user (AM or OP), **Then** the request is rejected with `FORBIDDEN` by the privilege-escalation rule — OP may only create `CL_ADMIN` / `CL_USER`. (OP is cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003; the earlier "tenant-scoped" justification has been superseded — the restriction persists but its rationale is privilege escalation, not tenant scope.)
3. **Given** the inspector who marked an appointment as DONE, **When** the same inspector's user account attempts the cross-check, **Then** the system rejects with `CROSS_CHECK_SELF_APPROVAL`.
4. **Given** the operator who initiated a financial entry, **When** they attempt to approve the same entry, **Then** the system rejects with `SELF_APPROVAL_FORBIDDEN`.

---

### User Story 6 — Runtime actors (TNT, SYS) perform actions with limited scope (Priority: P3)

- **Status**: PARTIALLY IMPLEMENTED
- **Source**: code + dossier

Two runtime-only actors exist that are not persisted as user roles: TNT (tenant portal visitor, authenticated via unique link token) and SYS (system actor for automated flows like pg-boss jobs). These actors have narrowly scoped permissions.

**Why this priority**: Lower priority because these actors have fixed, narrow scope. But they must be documented to prevent scope creep.

**Independent Test**: As TNT actor (via tenant portal token), attempt to confirm a reschedule — expect success. Attempt to cancel an appointment — expect forbidden. Verify SYS actor can trigger automated transitions (DRAFT -> AWAITING) but cannot perform manual actions.

**Acceptance Scenarios**:

1. **Given** a TNT actor (tenant portal), **When** they access the platform, **Then** they may only confirm, reschedule, or provide availability for the specific appointment linked to their token. No other actions are permitted.
2. **Given** a SYS actor (automated job), **When** it triggers a state transition (e.g., DRAFT -> AWAITING_INSPECTOR), **Then** the transition is attributed to `SYS` in the audit log with no human user ID.
3. **Given** a SYS actor, **When** it attempts a sensitive manual action (e.g., reopen DONE, create refund), **Then** the action is rejected — SYS cannot perform elevated manual operations.

---

### Edge Cases

- **OP tenant scope — status**: ~~When OP is corrected to be tenant-scoped, all use cases that currently pass `null` as `tenantId` for OP must be updated to use `actor.tenantId`.~~ **Superseded by `specs/DECISIONS.md` DEC-003 (2026-04-19)**: after a brief tenant-scoping roll-forward that broke every OP request in staging, the restoration confirmed OP as cross-tenant per CLAUDE.md §6. Use cases pass `null` as `tenantId` for AM/OP and honour `?tenantId=` query filters where applicable. No migration pending.
- **CL_USER with no permissions**: A CL_USER whose tenant has zero CL_USER permissions enabled is effectively read-only. They can list/view entities but cannot create, modify, or transition anything.
- **CL_ADMIN of inactive tenant**: The auth middleware rejects client-role tokens for inactive tenants before the request reaches any use case. CL_ADMIN cannot perform actions on their own inactive tenant.
- **Inspector deactivation with open appointments**: Deactivating an inspector requires no open (non-terminal) appointments assigned to them. The system blocks deactivation until appointments are reassigned or completed.
- **Race condition on permission removal**: If a tenant admin removes a CL_USER permission while a CL_USER is mid-action, the permission check runs at action execution time — the action will fail if the permission was removed before the check.
- **AM acting on behalf of a tenant**: When AM specifies a `tenantId`, the system validates the tenant exists and is active. AM does not inherit the target tenant's CL_USER permissions — AM always has full access.

## Requirements

### Functional Requirements

#### Role Scope Model

- **FR-001** (`SUPERSEDED by specs/DECISIONS.md DEC-003, 2026-04-19`): AM and OP both have `tenant_id = null` (platform-wide roles per CLAUDE.md §6). CL_ADMIN, CL_USER, and INSP-as-user MUST have a non-null `tenant_id`. OP list endpoints honour an optional `?tenantId=` query param to narrow the operational view; OP get/mutation endpoints are cross-tenant only where the action is operationally allowed by the canonical role matrix.
- **FR-002**: CL_ADMIN and CL_USER MUST only see and modify data belonging to their own tenant. Cross-tenant access MUST return not-found or forbidden.
- **FR-003**: INSP MUST only access resources they are personally assigned to (appointments via `inspectorId`, regions via `InspectorRegion`, own profile). Unassigned resources MUST not be visible.
- **FR-004**: TNT actors MUST only access the specific appointment linked to their authentication token. No other platform data is accessible.
- **FR-005**: SYS actors MUST only perform automated transitions and jobs. Manual elevated actions (reopen DONE, financial adjustments, user management) MUST be forbidden for SYS.

#### Permission Enforcement

- **FR-006**: Authorization MUST be enforced in the application layer (use cases), not at the route or middleware level. The auth middleware only extracts context and checks tenant status.
- **FR-007**: Every action MUST be checked against the role matrix. Non-permitted roles MUST receive `FORBIDDEN` (403) without executing the action.
- **FR-008**: UI elements (buttons, navigation items, table actions) MUST be hidden — not disabled — for non-permitted roles (per 014#FR-030).
- **FR-009**: Every action rejection MUST produce an audit record with the actor, attempted action, and reason.

#### CL_USER Permission Flags

- **FR-010** (`APPROVED, PARTIALLY IMPLEMENTED`): CL_USER actions beyond read-only MUST be gated by permission flags stored in tenant settings (`tenants.settings_json.clUserPermissions`).
- **FR-011**: The canonical list of CL_USER permission flags MUST be: `cancel_appointments`, `reject_appointments`, `force_confirmation`, `reschedule_appointments`, `create_appointments`, `create_properties`, `export_reports`.
- **FR-012**: When a CL_USER attempts a flagged action, the system MUST check the flag against the tenant's settings. If the flag is absent or false, the action MUST be rejected with `FORBIDDEN`.
- **FR-013**: CL_USER MUST always retain read access to entities within their tenant scope regardless of permission flags. Permission flags only gate write/transition actions.

#### CL_ADMIN Conditional Capabilities

- **FR-014** (`APPROVED, NOT YET IMPLEMENTED`): CL_ADMIN user management (create, update, deactivate users) MUST be gated by a tenant setting (`enable_user_management`). If the setting is absent or false, CL_ADMIN MUST be rejected from user management actions.
- **FR-015**: CL_ADMIN MUST never create non-client roles (AM, OP, INSP) regardless of tenant settings.
- **FR-015b** (`APPROVED`): CL_ADMIN MUST not gain AM-only governance surfaces such as tenant lifecycle, master pricing governance, or master service-type catalog management.

#### Anti-Escalation & Self-Approval

- **FR-016**: The system MUST prevent vertical privilege escalation: CL_ADMIN cannot create AM/OP/INSP; OP cannot create AM; CL_USER cannot create any user.
- **FR-017**: The system MUST prevent self-approval: the inspector who marks DONE cannot perform the cross-check; the operator who initiates a financial entry cannot approve it.
- **FR-018**: The system MUST prevent horizontal scope escalation: no role (except AM) can access or modify data in a tenant other than their own.
- **FR-018b** (`APPROVED`): OP cross-tenant reach does not override the role matrix. If an action is governance-owned by AM, OP must still be rejected even though OP is platform-wide.

#### Audit

- **FR-019**: Every permission check failure (FORBIDDEN response) MUST produce an audit record with actor identity, attempted action, target entity, and rejection reason.
- **FR-020**: Every tenant settings change that affects permissions MUST be audited with before/after values.

### Key Entities

- **UserRole** (enum) — The persisted role on the `users` table: `AM`, `OP`, `CL_ADMIN`, `CL_USER`, `INSP`. Determines base capabilities and scope.
- **RuntimeActor** (not persisted) — `TNT` (tenant portal, token-authenticated) and `SYS` (system jobs). Used for audit attribution and scope enforcement.
- **AuthContext** (request-scoped) — `userId`, `tenantId`, `role`, `branchId`, `inspectorId`. Extracted from JWT by auth middleware, consumed by every use case.
- **TenantSettings.clUserPermissions** — Array of permission flag strings stored in `tenants.settings_json`. Gates CL_USER actions beyond read-only.
- **TenantSettings.enableUserManagement** — Boolean stored in `tenants.settings_json`. Gates CL_ADMIN user management capability.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of use cases enforce role-based authorization — verified by integration test suite that attempts each action as each role and asserts correct allow/deny.
- **SC-002**: No cross-tenant data leakage — verified by multi-tenant integration test seeding data in 2 tenants and asserting isolation for each role.
- **SC-003**: CL_USER permission flags are enforced on all 7 flagged actions — verified by per-flag toggle test (enable, assert allowed; disable, assert forbidden).
- **SC-004**: CL_ADMIN user management is gated by tenant setting — verified by integration test.
- **SC-005**: Self-approval is prevented on cross-check and financial approval — verified by integration test with same-actor attempts.
- **SC-006**: Every permission denial produces an audit record — verified by integration test asserting audit row count after forbidden actions.
- **SC-007**: The role matrix in this spec matches the actual code behavior for 100% of actions — verified by a matrix-driven integration test that programmatically tests every role x action combination.

## Assumptions

- Authentication (login, tokens, sessions, TOTP) is fully covered by `001-identity-access`. This spec does not redefine those mechanics.
- The `AuthContext` is populated by the auth middleware and is available in every use case. This is established infrastructure.
- Tenant settings are stored in `tenants.settings_json` (a JSON column). No separate settings table exists. This is sufficient for the current permission model.
- ~~The OP tenant scope correction (DIVERGENCE) is a known cross-feature correction tracked in `.specify/memory/correction-op-tenant-scope.md`.~~ **Superseded by `specs/DECISIONS.md` DEC-003 (2026-04-19)** — OP is cross-tenant per CLAUDE.md §6. The correction-to-tenant-scope track was rolled back after a QA regression. No migration is pending.
- CL_USER permission flags are additive: start with zero permissions (read-only), add flags to enable specific actions. There is no "deny" mechanism — absence of flag means denied.
- The permission model is **flat** (flag-based), not hierarchical. CL_USER permissions do not inherit from CL_ADMIN. Each role has its own independent capability set.
- INSP has no configurable permissions — their access is fixed to own assignments and marketplace.
- The 7 CL_USER permission flags listed represent the complete set needed for the current product scope. New flags may be added as features evolve, but must be added to this spec first.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| ~~GAP-001~~ | ~~OP tenant scope correction~~ | **CLOSED / SUPERSEDED** | Superseded by `specs/DECISIONS.md` DEC-003 (2026-04-19). OP is cross-tenant per CLAUDE.md §6; the tenant-scope roll-forward was reverted after staging QA. List endpoints honour `?tenantId=` filter; get-by-id is cross-tenant. No migration pending. |
| GAP-002 | CL_ADMIN user management gate | H | CL_ADMIN can currently create users without checking the `enable_user_management` tenant setting. Must add the check. Tracked as `001#GAP-003`. |
| GAP-003 | CL_USER permission enforcement completeness | RESOLVED | All 7 canonical CL_USER permission flags are implemented and enforced in their respective use cases: `cancel_appointments`, `reject_appointments`, `force_confirmation`, `reschedule_appointments`, `create_appointments`, `create_properties`, `export_reports`. |
| GAP-004 | Centralized authorization service | M | Permission checks are currently inline in each use case. A shared `AuthorizationService` exposing `can(actor, action, resource)` would reduce duplication and ensure consistency. Tracked as `001#GAP-003` (T122). |
| GAP-005 | Permission denial audit | M | Not all FORBIDDEN responses currently produce audit records. Must be verified and standardized across all use cases. |
| GAP-006 | CL_USER read scope restrictions | L | CL_USER currently has broad read access within their tenant. Some tenants may want to restrict which CL_USER users can see (e.g., only appointments for their branch). Future enhancement. |
