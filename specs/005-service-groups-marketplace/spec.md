# Feature Specification: Service Groups & Marketplace

**Feature Branch**: `005-service-groups-marketplace`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED — Phase 1 shipped; Phase 2 gaps closed in commit `25434b9` (2026-04-07, Waves 1–4). Editorial reconciliation 2026-04-13. See `specs/GAPS.md` for the gap status table.
**Sources**:
- Code: `apps/backend/src/modules/service-group/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/{schemas,enums}/service-group.ts`, `apps/web/src/features/{service-groups,marketplace}/**`, `apps/pwa/src/features/offers/**`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `apps/backend/CLAUDE.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`, `projeto-consolidado/state-machine-executavel.md`, `projeto-consolidado/service-group-exceptions.md`
- Legacy specs (to be superseded on approval): `specs/backend/service-group.spec.md`, `specs/web/service-groups.spec.md`, `specs/pwa/marketplace.spec.md`

> **Domain clarification.** A **Service Group** bundles several appointments of the same service type, tenant, date, and time window so that an inspector can accept them as a single job. The **Marketplace** is the inspector-facing view of published groups; inspectors compete to accept them first (optimistic concurrency) and, once accepted, the linked appointments transition from `AWAITING_INSPECTOR` to `SCHEDULED`. Operators may also assign groups manually without going through the marketplace.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## Approved Product Overrides - 2026-05-09

1. The approved hard cap for service groups is now **30 appointments**, superseding older 25-cap references unless an explicit smaller sub-limit is reintroduced by a later decision.
2. The operator role in this flow explicitly covers:
   - creating new services,
   - grouping services,
   - offering jobs/groups to inspectors,
   - communicating with tenants.
3. Group offer and assignment flows must respect the admin-configured matrix of which **service types each inspector may execute for each client**.
4. Non-confirmed appointments rejected by the `7:00 PM` day-before cutoff leave the service group; they do **not** collapse a group that still retains valid appointments.

## User Scenarios & Testing

### User Story 1 — Create a service group from pending appointments

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator (AM for any tenant; OP for own tenant only) selects a set of appointments in `DRAFT` or `AWAITING_INSPECTOR` status, all from the same tenant and service type, and bundles them into a new service group. The group carries a target date, time window, optional name, description, service region, priority mode, and an optional exception type. On creation, the appointments are linked to the group and any `DRAFT` appointment transitions to `AWAITING_INSPECTOR`. Standard groups require 5–25 appointments; exception types relax the minimum (see FR-003).

**Why this priority**: Without grouping, the marketplace has nothing to offer and operators cannot batch operational work.

**Independent Test**: Seed 6 `AWAITING_INSPECTOR` appointments under one tenant with the same service type. As OP, `POST /v1/service-groups` with all 6 IDs. Confirm the group is created in `DRAFT` with `groupSize = 6`, the 6 appointments are linked, and an audit record is written.

**Acceptance Scenarios**:

1. **Given** an AM (any tenant) or OP (own tenant only) actor and 5–25 eligible appointments, **When** they `POST /v1/service-groups`, **Then** a group is created in `DRAFT`, the appointments are linked (`service_group_id` set), any `DRAFT` appointment transitions to `AWAITING_INSPECTOR`, and an audit record is written.
2. **Given** fewer than 5 appointments and no `exceptionType`, **When** create is attempted, **Then** the request fails with `GROUP_SIZE_TOO_SMALL`.
3. **Given** appointments from more than one tenant, **When** create is attempted, **Then** the request fails with `Appointments must belong to the same tenant`.
4. **Given** appointments with different `serviceTypeId`s, **When** create is attempted, **Then** the request fails with `SERVICE_TYPE_MISMATCH`.
5. **Given** an appointment already linked to another group, **When** create is attempted, **Then** the request fails with `APPOINTMENT_ALREADY_IN_GROUP`.
6. **Given** an appointment not in `AWAITING_INSPECTOR` or `DRAFT`, **When** create is attempted, **Then** the request fails with `APPOINTMENT_INVALID_STATUS`.
7. **Given** `priorityMode = PRIORITY_24H`, **When** `scheduledDate` is less than 24 hours from now, **Then** the request fails with `PRIORITY_DATE_TOO_CLOSE`.
8. **Given** an `exceptionType` (`LOW_DENSITY_REGION`, `ISOLATED_SERVICE`, `PRIORITY_CLIENT`), **When** create is attempted, **Then** `exceptionReason` is required (both present or both omitted), and the size limits relax per FR-003.
9. **Given** a `serviceRegionId` that is inactive, **When** create is attempted, **Then** the request fails with `SERVICE_REGION_INACTIVE`.
10. **Given** a non-AM/OP actor, **When** they call create, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 2 — Update service group metadata before publishing

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

Operators edit a group's mutable metadata (`name`, `serviceRegionId`, `description`) before publishing it. The group size, service type, tenant, date, and time window are immutable after creation — to change them, the operator cancels and recreates.

**Independent Test**: Create a group, patch its `name` and `serviceRegionId`, confirm the update is persisted and audited.

**Acceptance Scenarios**:

1. **Given** an AM (any tenant) or OP (own tenant only) and a group in any non-terminal status, **When** they `PATCH /v1/service-groups/:id` with mutable fields, **Then** the fields persist and are audited.
2. **Given** the update payload includes immutable fields, **When** submitted, **Then** those fields are silently ignored by the schema (not in `updateServiceGroupSchema`).
3. **Given** a non-AM/OP actor, **When** they attempt update, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 3 — Publish a service group to the marketplace

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Operators publish a `DRAFT` group to expose it to eligible inspectors via the marketplace. Publication has strict preconditions: the group must have an active service region, all linked appointments must still be `AWAITING_INSPECTOR`, and — if `PRIORITY_24H` is set — the priority window must not have expired. Publication is idempotent: calling publish on an already-`PUBLISHED` group returns the current state without side effects.

**Independent Test**: Create a group with a valid active region. Publish it → confirm `status = PUBLISHED`, `publishedAt` set, `offeredCount` incremented. Publish again → confirm no state change (idempotent).

**Acceptance Scenarios**:

1. **Given** an AM (any tenant) or OP (own tenant only) and a `DRAFT` group with all preconditions met, **When** they `POST /v1/service-groups/:id/publish`, **Then** the group transitions to `PUBLISHED`, `publishedAt` is set, `offeredCount` is incremented by 1, and an audit record is written.
2. **Given** a group without a `serviceRegionId`, **When** publish is attempted, **Then** the request fails with `SERVICE_REGION_REQUIRED`.
3. **Given** a group whose assigned region has become `INACTIVE`, **When** publish is attempted, **Then** the request fails with `SERVICE_REGION_INACTIVE`.
4. **Given** any linked appointment whose status is no longer `AWAITING_INSPECTOR`, **When** publish is attempted, **Then** the request fails with `APPOINTMENT_INVALID_STATUS`.
5. **Given** a `PRIORITY_24H` group whose priority window has elapsed, **When** publish is attempted, **Then** the request fails with `PRIORITY_EXPIRED`.
6. **Given** an already-`PUBLISHED` group, **When** publish is called again, **Then** the current state is returned with no side effects (idempotent).
7. **Given** a non-AM/OP actor, **When** they attempt publish, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 4 — Inspector browses marketplace offers

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

A logged-in inspector opens the PWA marketplace tab and sees a paginated list of `PUBLISHED` groups eligible for them, filtered by their service type eligibility (`serviceTypesJson`), their client eligibility (`clientEligibilityJson`), and implicitly by their assigned regions. Each offer surfaces the tenant name, service type name, group size, scheduled date, time window, priority mode, suburb list, full property addresses, `keyRequired` flag, and an estimated payout.

**Independent Test**: Seed an inspector eligible for two tenants and one service type. Publish three groups under those tenants plus one under an ineligible tenant. As the inspector, `GET /v1/marketplace/offers` and confirm only the three eligible groups appear with the right field shape.

**Acceptance Scenarios**:

1. **Given** an `INSP` actor, **When** they call `GET /v1/marketplace/offers`, **Then** the response is paginated and each row includes tenant, service type, scheduled date, time window, priority, suburbs, addresses, key requirement, and payout estimate.
2. **Given** a non-`INSP` actor, **When** they call the endpoint, **Then** the request is rejected with `FORBIDDEN`.
3. **Given** an inactive inspector, **When** they call the endpoint, **Then** the request is rejected with `INSPECTOR_INACTIVE`.
4. **Given** groups whose service type or tenant is outside the inspector's eligibility JSON, **When** the list runs, **Then** those groups are excluded.

---

### User Story 5 — Inspector accepts a marketplace offer

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An inspector taps "Accept" on an offer. The backend uses an optimistic-lock acceptance (`acceptOptimistic`) to prevent two inspectors from winning the same group; only the first one transitions the group to `ACCEPTED` and schedules the linked appointments (`AWAITING_INSPECTOR → SCHEDULED`, assigning the inspector). The operation is idempotent: replaying the request with the same key (default `accept-offer:{groupId}:{inspectorId}`, retention 24 h) returns the cached result.

**Independent Test**: Publish a group. Run two concurrent `POST /v1/marketplace/offers/:groupId/accept` from two inspectors. Exactly one succeeds with `appointmentsScheduled > 0`; the other fails with `GROUP_ALREADY_ACCEPTED`.

**Acceptance Scenarios**:

1. **Given** an eligible inspector and a `PUBLISHED` group, **When** they `POST /v1/marketplace/offers/:groupId/accept`, **Then** the group transitions to `ACCEPTED`, `assignedInspectorId` and `assignedAt` are set, the linked appointments become `SCHEDULED` with the inspector, `confirmedCount` is updated, and an audit record is written.
2. **Given** two inspectors racing on the same group, **When** both submit accept, **Then** exactly one succeeds; the other fails with `GROUP_ALREADY_ACCEPTED`.
3. **Given** an inspector ineligible for the service type, **When** they submit accept, **Then** the request fails with `INSPECTOR_SERVICE_TYPE_INELIGIBLE`.
4. **Given** an inspector ineligible for the tenant, **When** they submit accept, **Then** the request fails with `INSPECTOR_INELIGIBLE`.
5. **Given** an inactive inspector, **When** they submit accept, **Then** the request fails with `INSPECTOR_INACTIVE`.
6. **Given** a `PRIORITY_24H` group whose priority has expired, **When** accept is attempted, **Then** the request fails with `PRIORITY_EXPIRED`.
7. **Given** any linked appointment that is no longer `AWAITING_INSPECTOR` after the optimistic claim, **When** acceptance re-verifies, **Then** the request fails with `APPOINTMENTS_NOT_AWAITING_INSPECTOR` listing the offending appointments.
8. **Given** a replayed request with the same `Idempotency-Key` (or the default `accept-offer:{groupId}:{inspectorId}` scope), **When** submitted, **Then** the cached result is returned.

---

### User Story 6 — Operator assigns an inspector manually

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator (AM for any tenant; OP for own tenant only) skips the marketplace and assigns an inspector directly to a group. Works on groups in `DRAFT` or `PUBLISHED` state. Inspector must be active, eligible for service type and tenant, and the inspector's regions must cover the properties of every linked appointment. On success, the group goes directly to `ACCEPTED` and the linked appointments transition to `SCHEDULED`. Idempotent: assigning the same inspector twice returns the current state.

**Independent Test**: Create a group, assign an inspector whose regions cover all property suburbs → success. Re-assign the same inspector → same response, no side effects. Try to assign a different inspector → `ASSIGNED_INSPECTOR_CONFLICT`.

**Acceptance Scenarios**:

1. **Given** an AM (any tenant) or OP (own tenant only), a group in `DRAFT` or `PUBLISHED`, and a fully eligible inspector, **When** they `POST /v1/service-groups/:id/assign`, **Then** the group transitions to `ACCEPTED`, linked appointments become `SCHEDULED`, `assignedInspectorId` is set, and an audit record with `reason = "Manual assignment by <role>"` is written.
2. **Given** the same inspector already assigned, **When** assignment is called again, **Then** the current state is returned (idempotent).
3. **Given** a different inspector already assigned, **When** assignment is attempted, **Then** the request fails with `ASSIGNED_INSPECTOR_CONFLICT`.
4. **Given** an inspector whose regions do not cover every property in the group, **When** assignment is attempted, **Then** the request fails with `INSPECTOR_INELIGIBLE`.
5. **Given** a group in `CANCELLED` or `REJECTED`, **When** assignment is attempted, **Then** the request fails with `SERVICE_GROUP_INVALID_STATUS`.
6. **Given** a non-AM/OP actor, **When** they attempt assignment, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 7 — Cancel or reject a service group

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Operators (AM for any tenant; OP for own tenant only) cancel a group (tenant or operational reason, any non-terminal state) or reject it (operational impossibility; only from `PUBLISHED` or `ACCEPTED`). Both require a `reason` and produce audit records. Cancellation also unlinks the appointments so they can be re-grouped.

**Acceptance Scenarios**:

1. **Given** an AM or OP and a group in `DRAFT`, `PUBLISHED`, or `ACCEPTED`, **When** they `POST /v1/service-groups/:id/cancel` with a reason, **Then** the group transitions to `CANCELLED`, appointments are detached from the group, and an audit record carries the reason.
2. **Given** an AM or OP and a group in `PUBLISHED` or `ACCEPTED`, **When** they `POST /v1/service-groups/:id/reject` with a reason, **Then** the group transitions to `REJECTED` and an audit record carries the reason.
3. **Given** a group already in a terminal status, **When** cancel or reject is attempted, **Then** the request fails with `SERVICE_GROUP_INVALID_STATUS`.
4. **Given** a non-AM/OP actor, **When** they attempt cancel or reject, **Then** the request is rejected with `FORBIDDEN`.

---

### Edge Cases

- **Priority expiry is pre-window, not post-window**: `priority_expires_at = scheduledDate - 24h`. Publishing or accepting after this moment fails with `PRIORITY_EXPIRED`, even though the appointment itself is still in the future.
- **DRAFT → AWAITING_INSPECTOR transition on group create**: when a `DRAFT` appointment is added to a group, it is transitioned in-line to `AWAITING_INSPECTOR`. The state machine invariant is satisfied only because this transition runs through `IAppointmentRepository.update`, not a direct SQL write. Reviewers must keep this path aligned with feature 006.
- **Optimistic lock race**: `acceptOptimistic` returns `updatedCount = 0` when another inspector has already claimed the group. After a successful claim, the use case re-reads appointments to verify they are still `AWAITING_INSPECTOR` — if any has moved on (e.g. manually re-assigned in the meantime), the acceptance fails with `APPOINTMENTS_NOT_AWAITING_INSPECTOR`.
- **Exception type limits override defaults**: any declared `exceptionType` replaces the default (5..25) limit with its own (1..25, 1..3, 1..8). Shared schema still enforces the hard boundary of 1..25.
- **Idempotency scope for accept-offer**: the default key `accept-offer:{groupId}:{inspectorId}` is derived when the client omits `Idempotency-Key`. A different client-supplied key produces an independent cache entry — the backend trusts the header.
- **Publication increments `offered_count`**: the counter exists to support re-publish flows (e.g., after cancellation) but Phase 1 does not re-publish. Any Phase 2 flow that republishes must understand this counter.
- **Marketplace region filtering**: filtered in the repository layer based on inspector regions and the group's `service_region_id`. In-memory GeoJSON matching depends on feature 004 (GAP-004) for spatial indexes.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Service Group lifecycle

- **FR-001** (`Status: IMPLEMENTED (implementation decision), Source: code — dossiê lists status as a field but does not enumerate the state machine values or transitions`): System MUST support the state machine `DRAFT → PUBLISHED → ACCEPTED` with `CANCELLED` and `REJECTED` as terminal states. Transitions follow the matrix in [`data-model.md`](./data-model.md).
- **FR-002**: System MUST allow a group to be created only by AM (any tenant) or OP (own tenant only), and only from appointments of the same tenant + service type in `DRAFT` or `AWAITING_INSPECTOR` that are not already in a group.
- **FR-003** (`Source: dossier — projeto-consolidado/service-group-exceptions.md; standard 5..25 is an approved rule; exception limits are Scenario 2 (manual override) values chosen for current phase`): System MUST enforce group size limits: standard 5..25; exception types — `LOW_DENSITY_REGION` 1..25, `ISOLATED_SERVICE` 1..3, `PRIORITY_CLIENT` 1..8. Enforced by `ServiceGroupValidator` in the domain layer; shared Zod schema allows 1..25. The specific numeric limits for exceptions follow Scenario 2 (manual override) from the dossiê; Scenario 1 (data-driven automatic) defines different thresholds and is a future evolution.
- **FR-004**: System MUST require `exceptionType` and `exceptionReason` together (both present or both omitted).
- **FR-005** (`Status: IMPLEMENTED (implementation decision), Source: code`): System MUST require `PRIORITY_24H` groups to have `scheduledDate ≥ now + 24h` at creation. The current `STANDARD | PRIORITY_24H` mode is a global hardcoded switch. The dossiê defines priority offer as configurable per client, branch, and operational region — that configurability is not yet implemented (see FR-005b).
- **FR-005b** (`Status: APPROVED RULE NOT YET IMPLEMENTED, Source: dossier — fluxo-operacional.md:75 "Prioridade de 24h para inspetores selecionados"; dossiê establishes configurability per client/branch/region`): Priority offer configuration (whether a group uses priority mode, the offer window duration, and which inspectors receive priority access) MUST be configurable per tenant, branch, and operational region via tenant settings — not hardcoded as a global binary mode. Tracked as GAP-011.
- **FR-006**: System MUST link the supplied appointments to the group and transition any `DRAFT` appointment to `AWAITING_INSPECTOR` atomically with group creation.
- **FR-007**: System MUST reject publication if `serviceRegionId` is null, if the region is inactive, if any linked appointment is not `AWAITING_INSPECTOR`, or if the priority window has expired.
- **FR-008**: System MUST treat publication as idempotent — an already-`PUBLISHED` group returns its current state without side effects.
- **FR-009** (`implementation decision — offered_count exists in the dossiê data model but its increment-on-publish semantics and the republish flow it enables are not dossiê-mandated`): System MUST increment `offered_count` on each successful publication. This counter supports a possible future republish flow (GAP-004) that is not yet an approved rule.

#### Marketplace

- **FR-010**: System MUST restrict `GET /v1/marketplace/offers` and `POST /v1/marketplace/offers/:groupId/accept` to `INSP` actors.
- **FR-011** (`Source: dossier for inspector filtering by tipo de serviço, cliente autorizado, região, disponibilidade; per-offer field list is implementation decision`): System MUST filter offers by the inspector's `serviceTypesJson` and `clientEligibilityJson` (dossiê-mandated), and MUST surface per-offer fields: `tenantName`, `serviceTypeName`, `groupSize`, `scheduledDate`, `timeWindow`, `priorityMode`, `priorityExpiresAt`, `suburbs`, `payoutEstimate` (`implementation decision` — computed inline, not a dossiê-mandated field), `addresses`, `keyRequired`. Marketplace reads are **cross-tenant by design** — inspectors see offers from every tenant they are eligible for; tenant-scoping MUST NOT be applied to the marketplace list (see FR-042).
- **FR-012**: System MUST use optimistic concurrency (`acceptOptimistic`) to guarantee exactly one inspector wins a given group.
- **FR-013**: System MUST re-verify all linked appointments remain `AWAITING_INSPECTOR` after the optimistic claim and fail with `APPOINTMENTS_NOT_AWAITING_INSPECTOR` otherwise.
- **FR-014**: System MUST persist an idempotency entry with scope `accept-offer` and 24 h retention; the default key is `accept-offer:{groupId}:{inspectorId}` when the client omits `Idempotency-Key`.
- **FR-015**: System MUST reject acceptance on expired `PRIORITY_24H` windows with `PRIORITY_EXPIRED`, even if the group has not been explicitly moved out of `PUBLISHED`.
- **FR-016**: System MUST transition linked appointments to `SCHEDULED` and set their `assigned_inspector_id` on successful acceptance.

#### Manual assignment

- **FR-020**: System MUST allow AM (any tenant) or OP (own tenant only) to assign an inspector to a `DRAFT` or `PUBLISHED` group bypassing the marketplace.
- **FR-021**: System MUST validate inspector eligibility: active, supports the service type, eligible for the tenant, and covers every property in the group via `InspectorRegion` mappings.
- **FR-022**: System MUST treat manual assignment as idempotent when re-assigning the same inspector and as a conflict when a different inspector is already assigned (`ASSIGNED_INSPECTOR_CONFLICT`).
- **FR-023**: System MUST set the audit reason to `Manual assignment by <role>` on successful manual assignment.

#### Cancellation and rejection

- **FR-030**: System MUST allow AM (any tenant) or OP (own tenant only) to cancel a group in `DRAFT`, `PUBLISHED`, or `ACCEPTED` with a mandatory reason.
- **FR-031**: System MUST allow AM (any tenant) or OP (own tenant only) to reject a group in `PUBLISHED` or `ACCEPTED` with a mandatory reason.
- **FR-032**: System MUST detach linked appointments from the group on cancellation so they become available for a new group.

#### Cross-cutting

- **FR-040**: System MUST validate all service-group and marketplace payloads against Zod schemas in `packages/shared/src/schemas/service-group.ts`.
- **FR-041**: System MUST audit every state transition with `before`/`after` snapshots and `tenantId`.
- **FR-042** (`Source: dossier — marketplace queries are scoped by inspector_id and eligibility, never by tenant_id; see modelo-dados-executavel.md:98`): System MUST scope service group reads by tenant for **client roles (CL_ADMIN, CL_USER)**. AM and OP are cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003 — their list endpoints return cross-tenant rows by default and accept an optional `?tenantId=` filter for narrowing. (Superseded phrasing: "scope service group reads by tenant for OP and client roles".) **For marketplace reads (INSP actor), scoping is by inspector eligibility (service type + client + region), NOT by tenant_id** — inspectors see cross-tenant offers by design. Future changes MUST NOT add implicit tenant-scope filtering to the marketplace list.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Marketplace list p95 < 400 ms per page; accept-offer p95 < 500 ms excluding dependency calls (appointment update batch).
- **NFR-002** (`Status: APPROVED, Source: dossier`): Optimistic concurrency on accept MUST be correct under load — no two inspectors may observe `ACCEPTED` for the same group with different `assigned_inspector_id`.
- **NFR-003** (`Status: IMPLEMENTED, Source: code`): All list endpoints paginate.

### Key Entities

- **ServiceGroup** — tenant-scoped; stores group metadata, state, counts, priority window, optional exception, assigned inspector, service region FK, `created_by_user_id`. Uniqueness: none (multiple groups can share (tenant, service_type, date)).
- **Appointment link** — `Appointment.service_group_id` FK owned by feature 006; set and unset by this feature via the repository port.
- **Domain functions**: `canPublish`, `canAssign`, `canAccept`, `canCancel`, `canReject`, `isPriorityExpired` on the entity.
- **Domain validator**: `ServiceGroupValidator.validate(appointments, serviceTypeId, tenantId, exceptionType?)` — enforces size and status preconditions.

Full schema in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: Exactly one inspector can accept any given group — asserted by concurrent integration tests against a real Postgres.
- **SC-002**: Every state transition produces exactly one audit record with complete `before`/`after` snapshots and a `reason` where applicable.
- **SC-003**: `DRAFT → AWAITING_INSPECTOR` transitions on group creation always go through `IAppointmentRepository.update`, never via direct SQL — verified by code review and integration tests.
- **SC-004**: Publication preconditions are all enforced: missing region, inactive region, appointment drift, priority expired — each covered by an integration test.
- **SC-005**: Manual assignment inspector-region coverage check is enforced: tests seed a property outside the inspector's regions and confirm `INSPECTOR_INELIGIBLE`.
- **SC-006**: Idempotency on accept-offer: replaying within 24 h returns the cached result; after expiry, a fresh attempt is allowed.
- **SC-007**: Marketplace list excludes groups outside inspector service type or client eligibility — tested with seeded eligibility JSON.

## Assumptions

- One service type per group. Cross-type groups are out of scope; operators create separate groups.
- One tenant per group. Cross-tenant batching is out of scope.
- The `time_window` is a freeform label matching `HH:mm-HH:mm`; exact scheduling times live on individual appointments.
- Payout estimate in the marketplace is computed from pricing rules (feature 004). Shape is opaque here; feature 010-billing owns the computation.
- Inspector region coverage for manual assignment uses the inspector's current `InspectorRegion` mappings at the time of assignment; subsequent mapping changes do not retroactively invalidate accepted groups.
- `InspectorRepository.supportsServiceType(serviceTypeId)` and `isEligibleForTenant(tenantId)` are owned by the inspector module — this feature consumes them as a black box.
- Regrouping after cancellation is supported only by creating a new group; there is no "move appointment between groups" endpoint.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Marketplace spatial indexing | ~~In-memory GeoJSON.~~ **IMPLEMENTED** (Wave 1). | `findPublishedForInspector` rewritten to `ST_Intersects` with spatial joins. Tenant-scoped region matching. 8 tests. |
| GAP-002 | Payout estimate not centralized | ~~Risk of drift.~~ **IMPLEMENTED** (Wave 3). | Investigation: no duplication exists — pricing is snapshot-at-write. Design doc + 7 regression tests confirming consistency. |
| GAP-003 | No expire background job | ~~Stale groups in marketplace.~~ **IMPLEMENTED** (Wave 2). | `ExpirePriorityWorker` (hourly). Auto-cancels with system reason. Marketplace query also excludes expired in real-time. 3 tests. |
| GAP-004 | Re-publish after cancellation | ~~Must recreate from scratch.~~ **IMPLEMENTED** (Wave 2). | `RepublishServiceGroupUseCase` (CANCELLED→DRAFT). Clears assignment/priority. Route `POST .../republish`. 13 tests. |
| GAP-005 | Domain events for lifecycle | ~~Only audit logs.~~ **IMPLEMENTED** (Wave 2). | 5 events emitted: published, accepted, cancelled, rejected, manually_assigned. Optional `DomainEventBus` on all write use cases. 3 tests. |
| GAP-006 | Marketplace list too heavy | ~~Full addresses in list.~~ **IMPLEMENTED** (Wave 3). | List slimmed (no addresses/keyRequired, added appointmentCount). Detail endpoint `GET /v1/marketplace/offers/:groupId`. PWA updated. 5 tests. |
| GAP-007 | Accept-offer identity gap | ~~No actor verification on cache hit.~~ **IMPLEMENTED** (Wave 1). | Cached `assignedInspectorId` compared to `actor.inspectorId`. Mismatch → ForbiddenError. 1 test. |
| GAP-008 | Manual assign no idempotency | ~~Retry produces duplicate audit.~~ **IMPLEMENTED** (Wave 1). | Idempotency scope `assign-inspector` keyed by `(groupId, inspectorId)`. 24h retention. 4 tests. |
| GAP-009 | Update schema too narrow | ~~Can't edit DRAFT groups.~~ **IMPLEMENTED** (Wave 1). | 5 new fields: scheduledDate, timeWindow, priorityMode, exceptionType, exceptionReason. DRAFT-only guard. Priority recalculation. 15 tests. |
| GAP-010 | Exception usage not reported | ~~No analytics.~~ **IMPLEMENTED** (Wave 4). | Exception report design doc with SQL patterns and 011-reports-audit integration spec. |
| GAP-011 | Priority not configurable | ~~Hardcoded 24h.~~ **IMPLEMENTED** (Wave 4). | Reads `tenant.settings.priorityOfferHours` (default 24). Create + update use cases use configurable hours. 9 tests. |
