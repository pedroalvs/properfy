# Feature Specification: Appointment Time Slots

**Feature Branch**: `012-appointment-time-slot`
**Created**: 2026-04-06
**Feature Status**: IMPLEMENTED — code shipped ahead of editorial closure. The module `apps/backend/src/modules/appointment-time-slot/` carries 5 use cases (create / update / delete / list / list-effective), a Prisma repository, domain entity + errors, and Fastify routes. GAP-002 (time-slot overlap detection, FR-003b) was closed in commit `1c92edd` (2026-04-08). Feature integration with the appointment booking flow is live via `appointmentTimeSlotRepo` in `AppointmentImportWorker` and the tenant-scoped `list-effective` endpoint. Editorial reconciliation 2026-04-13 — see **Delivery Outcome** section at the end of this file.
**Input**: User description: "Create appointment time slot management feature"

## User Scenarios & Testing

### User Story 1 — Operator configures the time-slot catalog for a tenant (Priority: P1)

An operator (AM or OP for their own tenant) or a client admin (CL_ADMIN for their own tenant) defines the available inspection time windows for the agency. Each slot carries a human-readable `label` (e.g., "Morning"), a `startTime`, an `endTime`, and a `sortOrder` for display. Slots without a `branchId` are **tenant-wide defaults**; slots with a `branchId` are branch-specific overrides. When a branch has its own slots, the tenant defaults are hidden for that branch.

**Why this priority**: Appointments cannot be created without a valid time slot. The slot catalog gates the entire scheduling flow.

**Independent Test**: As OP, create a tenant-wide slot `09:00-12:00`. Create a second slot `14:00-17:00`. List effective slots for a branch with no branch-specific slots → expect both tenant defaults. Create a branch-specific slot `08:00-11:00` for that branch. List effective slots again → expect only the branch-specific slot (tenant defaults hidden).

**Acceptance Scenarios**:

1. **Given** an AM, OP (own tenant), or CL_ADMIN (own tenant), **When** they call `POST /v1/time-slots` with valid `label`, `startTime`, `endTime`, `sortOrder`, and optional `branchId`, **Then** a new active time slot is created, and an audit record is written.
2. **Given** a `startTime` that is equal to or after `endTime`, **When** create is attempted, **Then** the request fails with a validation error.
3. **Given** a `branchId` that does not belong to the resolved tenant, **When** create is attempted, **Then** the request fails with `BRANCH_NOT_FOUND`.
4. **Given** a duplicate `(tenant_id, branch_id, start_time, end_time)` tuple, **When** create is attempted, **Then** the request fails with `TIME_SLOT_CONFLICT`.
5. **Given** a new slot whose time range overlaps an existing active slot in the same scope (same `tenant_id` and `branch_id`), **When** create is attempted, **Then** the request fails with `TIME_SLOT_OVERLAP`. Adjacent slots (e.g., `09:00-12:00` + `12:00-15:00`) are allowed. (`APPROVED RULE NOT YET IMPLEMENTED` — code currently only enforces exact-match uniqueness; overlap detection must be added per FR-003b.)
6. **Given** a CL_ADMIN actor attempting to create a slot for a different tenant, **When** submitted, **Then** the request is rejected with `FORBIDDEN`.
7. **Given** a CL_USER or INSP actor, **When** they attempt to create a slot, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 2 — Operator updates or deactivates a time slot (Priority: P2)

An operator or client admin edits slot properties (`label`, `startTime`, `endTime`, `sortOrder`) or toggles `isActive` to hide a slot from scheduling without deleting it. Deactivated slots are no longer offered when creating or rescheduling appointments but remain visible in historical data.

**Why this priority**: Operational flexibility — agencies adjust their schedules without losing traceability.

**Independent Test**: Create a slot, then patch `isActive = false`. Verify the slot no longer appears in the effective-slots list for appointment creation, but still exists when listing all slots with `includeInactive = true`.

**Acceptance Scenarios**:

1. **Given** an AM, OP (own tenant), or CL_ADMIN (own tenant), **When** they call `PATCH /v1/time-slots/:id` with any subset of mutable fields, **Then** the supplied fields are updated, and an audit record with `before`/`after` is written.
2. **Given** a time change that would make `startTime >= endTime`, **When** submitted, **Then** the request fails with a validation error.
3. **Given** a CL_ADMIN updating a slot belonging to a different tenant, **When** submitted, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 3 — Operator deletes a time slot (Priority: P2)

An operator or client admin permanently removes a time slot via soft delete (`deleted_at` set). Soft-deleted slots are excluded from all reads and from the effective catalog. Historical appointments that referenced the deleted slot's composite value are not affected — the string on the appointment row is immutable.

**Why this priority**: Agencies sometimes discontinue a time window permanently.

**Independent Test**: Create a slot, then `DELETE /v1/time-slots/:id`. Verify the slot is no longer listed. Verify that an appointment created with the old slot's value still displays correctly.

**Acceptance Scenarios**:

1. **Given** an AM, OP (own tenant), or CL_ADMIN (own tenant), **When** they call `DELETE /v1/time-slots/:id`, **Then** the slot is soft-deleted and an audit record is written.
2. **Given** a CL_ADMIN deleting a slot belonging to a different tenant, **When** attempted, **Then** the request is rejected with `FORBIDDEN`.
3. **Given** a slot that is already soft-deleted, **When** delete is re-attempted, **Then** the request fails with `TIME_SLOT_NOT_FOUND`.

---

### User Story 4 — System resolves effective time slots for a branch (Priority: P1)

When a user creates or reschedules an appointment, the system needs to know which time slots are available for the target branch. The **effective catalog** follows a **branch-override-or-tenant-default** pattern: if the branch has any active, non-deleted slots of its own, only those are returned; otherwise, the tenant-wide defaults (slots with `branchId = null`) are returned. This resolution is consumed by:

- Feature 006-appointments (appointment creation validates `timeSlot` against effective slots)
- Feature 007-tenant-portal (reschedule flow: the renter picks from valid slots)
- Frontend forms (appointment create/edit pages populate the time-slot dropdown)

**Why this priority**: This is the core domain logic of the feature — the effective-slot resolution is what makes the catalog useful.

**Independent Test**: Seed a tenant with 2 default slots. Seed a branch under that tenant with 1 branch-specific slot. Call `GET /v1/time-slots/effective?branchId=<branch>` → expect only the branch-specific slot. Delete the branch-specific slot → call effective again → expect the 2 tenant defaults.

**Acceptance Scenarios**:

1. **Given** a branch with active branch-specific slots, **When** the effective catalog is queried, **Then** only the branch-specific active slots are returned (tenant defaults are hidden).
2. **Given** a branch with no branch-specific slots (or all branch-specific slots deleted/inactive), **When** the effective catalog is queried, **Then** the tenant-wide default active slots are returned.
3. **Given** an appointment creation with a `timeSlot` value that is NOT in the effective catalog for the target branch, **When** validated by feature 006, **Then** the creation fails with a validation error.
4. **Given** a tenant portal reschedule (feature 007), **When** the renter selects a new time slot, **Then** the options presented are the effective catalog for the appointment's branch.
5. **Given** any authenticated actor (AM, OP own tenant, CL_ADMIN/CL_USER own tenant), **When** they call `GET /v1/time-slots/effective?branchId=<id>`, **Then** the effective slots for that branch are returned. INSP actors are forbidden.

---

### User Story 5 — Default slots are seeded when a tenant is created (Priority: P1)

When feature 002-tenants-branches creates a new tenant, it also seeds two default appointment time slots: `09:00-12:00` ("Morning") and `14:00-17:00` ("Afternoon"). These are tenant-wide defaults (`branchId = null`) so every branch inherits them until overridden.

**Why this priority**: Without default slots, a newly created tenant cannot schedule any appointment until an operator manually creates the catalog.

**Independent Test**: Create a tenant via `POST /v1/tenants`. Immediately query the time-slot list for that tenant → expect exactly 2 rows.

**Acceptance Scenarios**:

1. **Given** a new tenant created by AM, **When** the tenant creation completes, **Then** exactly 2 default time slots exist for the tenant with `branchId = null`, `isActive = true`, and `sortOrder` 1 and 2 respectively.
2. **Given** the default slots, **When** an operator lists effective slots for any branch of that tenant, **Then** both defaults appear (because no branch-specific override exists yet).

---

### User Story 6 — Operator lists all time slots for administration (Priority: P2)

An operator or client admin browses the full time-slot catalog for a tenant to audit the configuration. Unlike the effective-slots endpoint, this list is not branch-resolved — it shows all slots across all branches plus tenant-wide defaults.

**Independent Test**: Create 3 tenant-wide slots and 2 branch-specific slots. Call `GET /v1/time-slots?tenantId=<id>` → expect all 5. Deactivate one, re-query with `includeInactive=true` → expect all 5. Re-query without `includeInactive` → expect 4.

**Acceptance Scenarios**:

1. **Given** an AM, OP, or CL_ADMIN actor (AM and OP both cross-tenant per CLAUDE.md §6 / `specs/DECISIONS.md` DEC-003; CL_ADMIN tenant-scoped), **When** they call `GET /v1/time-slots` with `tenantId` and optional `branchId`/`includeInactive`, **Then** matching slots are returned. Superseded phrasing: "OP (own tenant)".
2. **Given** a CL_USER or INSP, **When** they call the admin list, **Then** the request is rejected with `FORBIDDEN`.

---

### Edge Cases

- **Appointment immutability**: the `time_slot` column on `appointments` stores a string value (e.g., `"09:00-12:00"`) — a snapshot at creation time. Deleting or deactivating a slot does NOT retroactively affect existing appointments. Validation only runs at creation and reschedule time.
- **Branch-override semantics**: override is **all-or-nothing** — if a branch has even one active non-deleted slot, the entire tenant default set is hidden for that branch. There is no merge behavior. (`implementation decision` — dossiê does not define the override/fallback semantics.)
- **Slot uniqueness scope**: `UNIQUE (tenant_id, branch_id, start_time, end_time)` in the database. A tenant can have `09:00-12:00` as both a default (`branchId = null`) and a branch-specific slot — the unique constraint treats `null` branch as a distinct scope.
- **Default slot seeding coupling**: the seeding runs inside `CreateTenantUseCase` (feature 002). This feature provides the repository and entity consumed by feature 002 but does not own the creation trigger.
- **NOT inspector availability**: appointment time slots define WHEN inspections can be scheduled for an agency. Inspector availability slots (feature 008) define WHEN an inspector is personally free. The two are distinct domain concepts that may overlap in time but are completely separate entities.

## Requirements

### Functional Requirements

- **FR-001** (`implementation decision` — dossiê says time slots are "catálogos canônicos do sistema" per decisions.md:238, but does not define RBAC for management): System MUST allow AM, OP (own tenant), and CL_ADMIN (own tenant) to create, update, and soft-delete appointment time slots. CL_USER and INSP are forbidden from write operations.
- **FR-002**: System MUST enforce `UNIQUE (tenant_id, branch_id, start_time, end_time)` on time slots. Duplicate creation fails with `TIME_SLOT_CONFLICT`.
- **FR-003**: System MUST validate `startTime < endTime` on create and update.
- **FR-003b** (`APPROVED RULE NOT YET IMPLEMENTED` — decision 2026-04-06): System MUST reject overlapping time ranges within the same effective scope `(tenant_id, branch_id)`. Adjacent slots (end of one equals start of the next) are allowed; overlapping ranges are rejected with `TIME_SLOT_OVERLAP`. The code currently only enforces exact-match uniqueness (FR-002) — overlap detection must be added (see GAP-002).
- **FR-004**: System MUST validate that `branchId` (when provided) belongs to the resolved `tenantId`.
- **FR-005** (`implementation decision` — dossiê does not define the override/fallback semantics): System MUST resolve effective time slots for a branch using the **branch-override-or-tenant-default** pattern: if the branch has any active, non-deleted slots, return only those; otherwise return the tenant-wide defaults (`branchId = null`).
- **FR-006** (`Source: code — feature 006 CreateAppointmentUseCase`): System MUST reject appointment creation when the supplied `timeSlot` value is not in the effective catalog for the target branch.
- **FR-007**: System MUST soft-delete time slots (set `deleted_at`) rather than hard-delete. Soft-deleted slots are excluded from all reads and the effective catalog.
- **FR-008**: System MUST audit every create, update, and delete with `before`/`after` snapshots via the shared `AuditService`.
- **FR-009** (`implementation decision` — dossiê does not define default seeding values): System MUST seed 2 default time slots (`09:00-12:00` sortOrder 1, `14:00-17:00` sortOrder 2) with `branchId = null` when a new tenant is created.
- **FR-010**: System MUST expose effective time slots to any authenticated non-INSP actor for their own tenant via `GET /v1/time-slots/effective?branchId=<id>`.
- **FR-011**: System MUST expose the admin list endpoint `GET /v1/time-slots` with `tenantId`, optional `branchId`, and optional `includeInactive` filters. Accessible to AM, OP (cross-tenant per `specs/DECISIONS.md` DEC-003), and CL_ADMIN (own tenant) only. CL_USER and INSP are forbidden (also per `specs/DECISIONS.md` DEC-002). Superseded phrasing: "OP (own tenant), and CL_ADMIN (own tenant)".

### Key Entities

- **AppointmentTimeSlot** — represents a schedulable time window for an agency. Key attributes: `id`, `tenant_id` (mandatory), `branch_id` (nullable; null = tenant-wide default), `label`, `start_time` (HH:mm), `end_time` (HH:mm), `sort_order`, `is_active`, timestamps, `deleted_at`.
- **compositeValue** — the derived string `"<startTime>-<endTime>"` (e.g., `"09:00-12:00"`) stored as a snapshot on `appointments.time_slot` when an appointment is created. This is a value, not a foreign key — changing or deleting the slot does not cascade.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every appointment created with a time slot not in the effective catalog for its branch is rejected — verified by integration test.
- **SC-002**: Branch-specific slots fully hide tenant defaults when present — verified by integration test.
- **SC-003**: Default slots are seeded on tenant creation — verified by integration test: create tenant, list slots, confirm 2 rows.
- **SC-004**: Soft-deleted slots do not appear in effective or admin list queries (unless `includeInactive` is used for admin list).
- **SC-005**: Audit records are produced for every create, update, and delete operation.
- **SC-006**: Effective-slot resolution responds within 50 ms p95 — verified by load test.

## Assumptions

- Time slots use 24-hour `HH:mm` format. No timezone conversion is applied at the slot level — the slot times are implicitly in the tenant's configured timezone.
- The effective-slot resolution is a simple fallback: branch-specific OR tenant-default. There is no merge, no inheritance chain, and no global platform defaults.
- `CL_ADMIN` write access to time-slot management is an `implementation decision`. The dossiê says time slots are "catálogos canônicos do sistema" but does not explicitly define which roles may manage them. If this should be conditional on tenant settings (like other CL_ADMIN capabilities), the permission model from 001#GAP-003 would need to be extended.
- This feature is explicitly **NOT** inspector availability slots. Inspector availability (feature 008) defines when an inspector is free; appointment time slots define when an agency's scheduling windows are open.
- The `compositeValue` on appointments is a string snapshot. Changing or deleting a slot does not cascade to existing appointments.
- Default slot values (`09:00-12:00`, `14:00-17:00`) are an `implementation decision` — the dossiê does not specify these defaults.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Tenant portal reschedule slot validation | M | The tenant portal reschedule flow (feature 007) should present only effective slots for the appointment's branch. Verify the integration is wired; if not, the renter could propose an invalid time slot. |
| GAP-002 | Overlapping slot rejection | M | **Decision (2026-04-06): reject overlapping slots.** Within the same effective scope `(tenant_id, branch_id)`, time slots MUST NOT overlap. Adjacent slots are allowed (e.g., `09:00-12:00` + `12:00-15:00`) but overlapping ranges are rejected (e.g., `09:00-12:00` + `10:00-14:00` → error). The code currently only enforces exact-match uniqueness — overlap detection must be added. |
| GAP-003 | CL_ADMIN write access conditionality | L | CL_ADMIN can currently create/update/delete time slots unconditionally. Whether this should be gated by a tenant setting (like other CL_ADMIN capabilities per 001#GAP-003) is not defined. |

---

## Delivery Outcome (2026-04-13, editorial backfill)

This section is an editorial closure added after the fact. Feature 012 shipped code ahead of a formal delivery record; `tasks.md` still carries 38 unticked items but the code-level functionality is live. This section reconciles the paper trail with the actual state.

### Components delivered

| Capability | Status | Primary call sites |
|---|---|---|
| Tenant-wide + branch-specific time-slot catalog | ✅ delivered | `AppointmentTimeSlotEntity`, `PrismaAppointmentTimeSlotRepository` |
| `POST /v1/time-slots` (create) | ✅ delivered | `CreateAppointmentTimeSlotUseCase` |
| `PATCH /v1/time-slots/:id` (update) | ✅ delivered | `UpdateAppointmentTimeSlotUseCase` |
| `DELETE /v1/time-slots/:id` (soft-delete / deactivate) | ✅ delivered | `DeleteAppointmentTimeSlotUseCase` |
| `GET /v1/time-slots` (list with tenant scoping) | ✅ delivered | `ListAppointmentTimeSlotsUseCase` |
| `GET /v1/time-slots/effective` (branch-override fallback resolution) | ✅ delivered | `ListEffectiveTimeSlotsUseCase` |
| GAP-002 overlap detection (FR-003b) | ✅ delivered | commit `1c92edd` (2026-04-08) — enforces non-overlapping slots within the same `(tenant_id, branch_id)` scope |
| Appointment booking integration | ✅ delivered | `ListEffectiveTimeSlotsUseCase` consumed by the appointment creation UI; `AppointmentImportWorker` accepts `appointmentTimeSlotRepo` for bulk-import validation |
| Audit entries on write paths | ✅ delivered | Create / update / delete use cases all write audit records via the shared `AuditService` |
| Backend tests | ✅ delivered | `apps/backend/tests/integration/appointment-time-slot/appointment-time-slot.routes.test.ts` (integration) + unit coverage via the use cases' dependencies |

### Verification evidence

- The 012 routes are registered in `apps/backend/src/main/routes.ts` (`registerAppointmentTimeSlotRoutes`).
- The 012 module is a dependency of `appointment` and `tenant-portal` (appointment creation + reschedule flows).
- Typecheck clean as of 2026-04-13 (verified during 020 closure).
- Backend test suite passes with the time-slot integration test included (2789 tests green as of 2026-04-13).

### Residuals

All residuals are classified **non-blocking**.

| ID | Title | Classification | Note |
|---|---|---|---|
| GAP-001 | Tenant portal reschedule slot validation | **deferred non-blocking** | The tenant portal reschedule flow should present only effective slots for the appointment's branch. Integration is present end-to-end via `ListEffectiveTimeSlotsUseCase`; dedicated integration test covering the tenant-portal reschedule → time-slot validation path is not yet written. |
| GAP-003 | CL_ADMIN write access conditionality | **deferred non-blocking** | Same pattern as `allowClientUserManagement` in feature 015. A future tenant-setting gate (`allowClientTimeSlotManagement`) would subsume this. Today CL_ADMIN can manage time slots for their own tenant without a setting gate. |
| `tasks.md` unticked items | **editorial drift** | The 38 items in `tasks.md` were never ticked off in lockstep with the code. The task descriptions trace to real shipped behavior (the module exists as specified). This is editorial backlog, not a code gap. |

### Out of editorial scope

This closure is documentation-only. It does not reopen any FR, does not add new gaps, and does not change the code. It backfills a Delivery Outcome section so 012's paper trail matches the state of the repository.
