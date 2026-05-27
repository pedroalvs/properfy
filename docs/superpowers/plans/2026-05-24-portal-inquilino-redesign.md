# Implementation Plan: Portal Inquilino — Redesign Completo

**Branch**: `patch/portal-inquilino`
**Date**: 2026-05-24
**Spec**: `docs/superpowers/specs/2026-05-24-portal-inquilino-redesign.md` (v2 + v2.1 patch — APROVADA pelo humano)
**Constitution**: `.specify/memory/constitution.md` v1.x

> **Why this plan lives in `docs/superpowers/plans/` and not in `specs/NNN/plan.md`**: The redesign is incremental on top of feature 007 (already shipped), not a new feature with a numbered spec. It follows the existing convention used by `2026-03-18-remaining-features.md` and `2026-04-26-rbac-contract-reconciliation.md` for cross-cutting changes. The `/speckit.plan` script would fail because the branch name (`patch/portal-inquilino`) does not match the `NNN-name` convention; the plan workflow is executed manually following the speckit `plan-template.md` structure.

---

## 1. Summary

Replace the fragmented tenant portal frontend (Confirm/Reschedule/Unavailable sections) with a unified single-form UI that mirrors the Hauseful-inspired design adapted to Properfy brand. Add a new "Change time" backend flow (`join-group`) that lets tenants join an existing `ACCEPTED` service group near their property without invoking the full reschedule path. Preserve the existing reschedule capability as a secondary CTA ("Propose new date"). Persist weekly availability (`availableSlotsJson`) on the "No" path. Add an admin web component that shows the tenant portal activity history for any appointment.

**Primary requirement** (from spec §1, §10 SC-01..SC-16):
- Unified portal form, mobile-first, with primary "Change time" CTA + secondary "Propose new date" CTA.
- New backend: `GET /v1/tenant-portal/:token/available-groups` + `POST /v1/tenant-portal/:token/join-group`.
- New schema: `available_slots_json` column on `appointment_restrictions`; new `TenantPortalAction.GROUP_JOIN` enum value.
- Web admin: **extend the existing `AppointmentPortalActivityTab` component** (it already exists and is integrated via the `portal-activity` tab in `AppointmentDetailPage.tsx`) — add the `GROUP_JOIN` action type to the color/icon map and render `new_values_json` data summaries below each action label. No new component, no RBAC widening.
- New web admin: `tenantNote` surfaced in map bulk-actions panel.

**Technical approach**:
- Backend: new use-cases (`GetAvailableGroupsUseCase`, `JoinGroupUseCase`), new errors, new shared Zod schemas. The `JoinGroupUseCase` bypasses the canonical `AddAppointmentsToGroupUseCase` because the canonical validator (`canAddToGroup`) rejects `ACCEPTED` groups and mismatched dates — a portal-specific code path is cleaner than relaxing canonical invariants. The state transition `AWAITING_INSPECTOR → SCHEDULED` is routed through the sovereign state-machine 006 (`ExecuteStatusTransitionUseCase`) with `actorType = SYSTEM`.
- Frontend portal: rebuilt around `InspectionConfirmationForm` (the unified form), `WeeklyAvailabilityPicker`, `AvailableGroupsList`. `RescheduleForm.tsx` preserved.
- Frontend admin: two touches — **extend** existing `AppointmentPortalActivityTab` (already integrated via the `portal-activity` tab; gated by `isPrivileged`) and **extend** the bulk-actions panel with a `tenantNote` row.
- Schema migration is additive (no destructive changes).

---

## 2. Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 (backend); TypeScript 5.6 + React 18.3 + Vite 5.4 (web).
**Primary Dependencies**: Fastify 4, Prisma 5, Zod (backend); React Query 5, Tailwind 3, React Router 6 (web); `@properfy/shared` (Zod schemas + types).
**Storage**: PostgreSQL (Supabase). Additive Prisma migration: 1 new column on `appointment_restrictions`, 1 new value on `TenantPortalAction` enum.
**Testing**: Vitest (unit/integration), Supertest (API integration), Playwright (frontend E2E). TDD per PR (constitution §III, NON-NEGOTIABLE).
**Target Platform**: Linux server (backend), modern browsers + mobile webviews (portal).
**Project Type**: Monorepo (backend + 2 frontends + shared).
**Performance Goals**: Portal GET p95 < 200 ms (NFR-001 of 007); `GET /available-groups` reuses existing indexes (`tenant_id`, `status`, `scheduled_date`, `service_region_id`) plus PostGIS `geo_point::geography` for radius (if available).
**Constraints**: mobile-first viewport ≤ 480 px (M3); strict tenant scope; FR-072 amendment isolated to `JoinGroupUseCase` only; token single-shot semantics preserved.
**Scale/Scope**: ~11 new files (4 backend + 4 frontend + 1 shared + Prisma migration + 1 enum extension) + ~9 modified files (incl. GetPortalDataUseCase, AppointmentPortalActivityTab, shared schemas, frontend types). Estimated LOC delta: **+2.0k to +2.4k including tests** (revised after Planejador round 1/3 — earlier 1.5k–2k estimate was optimistic given the payload expansion in R5/R6 and the new responsive Playwright spec).

**NEEDS CLARIFICATION (resolved in Phase 0)**:
- PostGIS availability for the 2 km radius (covered in Phase 0 R1).
- Inspector linkage mechanism for `JoinGroupUseCase` (covered in Phase 0 R2 — corrected after Planejador round 1/3: direct FK `appointment.assigned_inspector_id`, no junction table).
- Inspector notification mechanism — sync vs pg-boss (covered in Phase 0 R3).
- Admin history surface — extend existing tab vs new component (covered in Phase 0 R4 — corrected after Planejador round 1/3: extend existing `AppointmentPortalActivityTab`).
- Portal-data payload expansion: tenant.name, tenant.timezone (covered in Phase 0 R5).
- "Property manager" row source — no schema field exists (covered in Phase 0 R6).

---

## 3. Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
|---|---|---|
| **I. Clean Architecture** | ✅ Pass | New backend code respects layer boundaries: domain (errors), application (use-cases), infrastructure (repo queries), interfaces (routes). No cross-layer imports introduced. |
| **II. Multi-Tenant Safety** | ✅ Pass | Token middleware already injects appointment + tenant context. Both new endpoints scope by the token's appointment tenant. `GetAvailableGroupsUseCase` filters groups by the same tenant + same service type as the token's appointment. Audit records use `actorType = ANONYMOUS` (matching 007 portal pattern). |
| **III. TDD** | ✅ Pass | Tests precede implementation for every new use-case and component. Integration tests hit a real DB via Testcontainers (existing infra). Coverage gate: 80%+ for portal critical path. |
| **IV. Contract-First APIs** | ✅ Pass | Two new endpoints get Zod request/response schemas in `packages/shared/src/schemas/tenant-portal.ts` before backend wiring. OpenAPI auto-generated from Fastify routes. Error envelope `{ error: { code, message, details? } }` reused. |
| **V. Simplicity** | ⚠ Justified | Adds a portal-specific `JoinGroupUseCase` rather than reusing/extending `AddAppointmentsToGroupUseCase`. Justification logged in `#9 Complexity Tracking` below — the canonical validator's invariants conflict with the portal flow, and relaxing them would compromise the admin add-to-group flow. Isolation is safer than parametrisation. |
| **State Machine Sovereignty** | ✅ Pass | Status transition uses `ExecuteStatusTransitionUseCase`. FR-072 of feature 007 is explicitly amended in spec §5.3 for this single new code path; no other portal action touches `appointment.status`. |
| **Notification Discipline** | ✅ Pass | All notifications are fire-and-forget; failure does not roll back the transaction. Pattern reused from `report-unavailability.use-case.ts`. |
| **Audit Discipline** | ✅ Pass | Three audit events written: `tenant_portal.group_joined` (success), `appointment.detached_from_group` (previous group, when applicable), `appointment.status_transition` (via state-machine 006). |
| **Privacy/PII** | ✅ Pass | Raw tokens never logged. IP + UA recorded in activity rows (existing convention). No new PII categories. |

**Outcome**: Constitution Check passes. One justified deviation (V — Simplicity) tracked in §9.

---

## 4. Project Structure

### 4.1 Documentation (this feature)

```text
docs/superpowers/specs/2026-05-24-portal-inquilino-redesign.md   # Spec v2.1 (input)
docs/superpowers/plans/2026-05-24-portal-inquilino-redesign.md   # This plan
docs/superpowers/plans/2026-05-24-portal-inquilino-redesign-tasks.md  # Tasks breakdown
```

### 4.2 Source Code (touched paths)

```text
packages/shared/
└── src/
    ├── schemas/
    │   └── tenant-portal.ts            # extend: availableSlotsJson, joinGroupRequest, availableGroupsResponse
    └── enums/
        ├── misc.ts                      # extend: TenantPortalAction.GROUP_JOIN
        └── misc.test.ts                 # update length assertion 5 → 6

apps/backend/
├── prisma/
│   ├── schema.prisma                    # extend: available_slots_json + GROUP_JOIN enum value
│   └── migrations/
│       └── <timestamp>_portal_join_group/
│           └── migration.sql            # additive
└── src/modules/
    ├── tenant-portal/
    │   ├── domain/
    │   │   └── tenant-portal.errors.ts  # add 3 errors
    │   ├── application/
    │   │   └── use-cases/
    │   │       ├── get-available-groups.use-case.ts        # new
    │   │       ├── get-available-groups.use-case.test.ts   # new
    │   │       ├── join-group.use-case.ts                  # new
    │   │       ├── join-group.use-case.test.ts             # new
    │   │       ├── get-portal-data.use-case.ts             # EXTEND — add `tenant: { name, timezone }` block (R5)
    │   │       └── report-unavailability.use-case.ts       # extend (M6)
    │   └── interfaces/
    │       └── tenant-portal.routes.ts  # add 2 routes
    └── service-group/
        └── infrastructure/
            └── prisma-service-group.repository.ts  # add findPortalEligibleGroups query

apps/web/
└── src/features/
    ├── tenant-portal/
    │   ├── pages/
    │   │   └── PortalPage.tsx                          # replace
    │   ├── components/
    │   │   ├── ConfirmSection.tsx                      # remove
    │   │   ├── UnavailableSection.tsx                  # remove
    │   │   ├── RescheduleForm.tsx                      # keep (minor restyle)
    │   │   ├── InspectionConfirmationForm.tsx          # new (the unified form)
    │   │   ├── WeeklyAvailabilityPicker.tsx            # new
    │   │   ├── WeeklyAvailabilityPicker.test.tsx       # new
    │   │   ├── AvailableGroupsList.tsx                 # new
    │   │   └── AvailableGroupsList.test.tsx            # new
    │   ├── hooks/
    │   │   └── usePortalData.ts                        # extend: useAvailableGroups, useJoinGroup
    │   └── types/
    │       └── index.ts                                # extend: AvailableSlot, AvailableGroup
    └── appointments/
        ├── components/
        │   ├── AppointmentPortalActivityTab.tsx        # EXTEND (already exists) — add GROUP_JOIN icon/color + new_values_json data summaries
        │   ├── AppointmentPortalActivityTab.test.tsx   # EXTEND (already exists) — add cases for GROUP_JOIN, availableSlotsJson summary, tenantNote summary
        │   └── <BulkActionsPanel>.tsx                  # extend: tenantNote row
        └── (no AppointmentDetailPage change — tab already integrated via PORTAL_ACTIVITY_TAB)
```

**Structure decision**: Monorepo split as documented above. Backend changes are isolated to `tenant-portal` and a one-line repository addition on `service-group`. Frontend changes are split between `tenant-portal` (portal redesign) and `appointments` (admin history + tenantNote surfacing). Shared schemas/enums are added without breaking existing imports.

---

## 5. Phase 0: Outline & Research

All NEEDS CLARIFICATION items from §2 are resolved here. Each entry follows the Decision / Rationale / Alternatives format.

### R1 — 2 km radius implementation

- **Decision**: Use **PostGIS `ST_DWithin`** against `properties.geo_point::geography` with a 2000 m radius.
- **Rationale**: Feature 003 (Properties) already stores latitude/longitude; feature 016 (Geospatial) adopted PostGIS for map experiences. The query is one JOIN deeper but uses an existing `gist` index. P95 latency budget (200 ms) is comfortable for ≤ 30-row result sets.
- **Alternatives considered**:
  - Haversine SQL fallback: ~20% slower and harder to maintain — used only if PostGIS extension is missing in a target environment. Architect to confirm during T0-002 (see tasks).
  - In-memory filter after a broad fetch: O(N²) — rejected outright.

### R2 — Inspector-appointment linkage mechanism (revised after Planejador round 1/3)

- **Correction (2026-05-25)**: There is **no `inspector_assignments` table** in the schema (grep confirmed). Inspector↔appointment linkage is via the **direct FK `appointment.assigned_inspector_id`** on the appointments table.
- **Decision**: `JoinGroupUseCase` updates `appointment.assigned_inspector_id = group.assigned_inspector_id` directly via `IAppointmentRepository.update(...)`. This matches the pattern used by `accept-offer.use-case.ts` (feature 005 US5) and `bulk-assign-inspector.use-case.ts`.
- **Rationale**: Inspector visibility downstream (PWA marketplace, jobs view) reads from `appointment.assigned_inspector_id` directly. A single column update is sufficient — no junction table writes required.
- **Alternatives considered**: Writing a row to a hypothetical `inspector_assignments` table — REJECTED because the table does not exist. Inferring inspector from `service_group.assigned_inspector_id` at query time — REJECTED because existing read paths assume the column is denormalised onto the appointment.

### R3 — Inspector notification mechanism

- **Decision**: Use the existing **synchronous notification handler** pattern (`onNotificationHandler.execute(...)` in `report-unavailability.use-case.ts`). Wrap in try/catch; fire-and-forget.
- **Rationale**: Matches existing portal use-cases; no need to introduce a pg-boss job for what is a single email/SMS dispatch. The handler internally enqueues via the notification module if delivery is async.
- **Alternatives considered**: pg-boss job — rejected as over-engineering for a single notification; the existing handler already proxies to pg-boss internally where needed.

### R4 — Admin history surface (revised after Planejador round 1/3)

- **Correction (2026-05-25)**: The admin already has `AppointmentPortalActivityTab.tsx` integrated into `AppointmentDetailPage.tsx` via the `portal-activity` tab id. The tab is gated to privileged users (AM/OP). It already consumes `usePortalActivities(appointmentId)`.
- **Decision**: **Extend the existing tab** (do not create a parallel component). Two changes:
  1. Add `GROUP_JOIN` to the `ACTION_COLORS` map so it renders with an appropriate icon/color (proposed: `mdi-calendar-arrow-right`, light teal background).
  2. Render `new_values_json` summaries under the action label: for `GROUP_JOIN` (new date/window + inspector name), for `UNAVAILABLE_REPORTED` (availableSlotsJson summary `"Available: Mon 09–12, Wed 14–17"` + tenantNote), for `RESCHEDULED` (new date/window + tenantNote), for `CONFIRMED` (tenantNote).
- **Rationale**: Reuses existing UI + hook + tests. No risk of duplicated surface. Tab structure was created for exactly this purpose. **DO NOT** widen RBAC — keep `isPrivileged` gate intact.
- **Alternatives considered**: Building a new component inside the overview tab — REJECTED because it duplicates the existing `AppointmentPortalActivityTab` tab and would require deprecating one path.

### R5 — Portal-data payload expansion (revised after Planejador round 1/3)

- **Correction (2026-05-25)**: Read `GetPortalDataUseCase` source confirmed three gaps for the new layout (spec §3.1 details grid):
  - `tenant.name` (the agency name) — NOT in current payload (only `appointment.tenantId` is exposed; no nested tenant block).
  - `tenant.timezone` — NOT in current payload, but EXISTS in `tenants.timezone` column (default `Australia/Sydney`).
  - "Property manager" (spec mockup `agency.contactName or agency.name`) — **no source in schema**. `Tenant` has no `contactName` field. See R6 below.
- **Decision**: Extend `GetPortalDataUseCase` response with a new `tenant` block: `{ name: string, timezone: string }`. Wire the change end-to-end (use-case, shared Zod schema, frontend type). This is an additive payload change — backward compatible.
- **Rationale**: Single source of truth; no client-side guesswork. `Intl.DateTimeFormat` accepts IANA timezone names from the `timezone` field. The agency name renders in the details grid.
- **Alternatives considered**: User-agent timezone — REJECTED because tenants may be in different timezones than the property (e.g. expat tenants). Reading tenant data via a separate endpoint — REJECTED because every portal page would need two requests.

### R6 — "Property manager" row source (NEW after Planejador round 1/3)

- **Problem**: Spec mockup §3.1 shows a "PROPERTY MANAGER" row with value `{agency.contactName or agency.name}`. The `Tenant` model has no `contactName` field. The fallback (`agency.name`) would render the same value as the "AGENCY" row — visually duplicated.
- **Decision**: For this iteration, **render only the AGENCY row** in the details grid. The "PROPERTY MANAGER" row is dropped unless/until a source field is added. Document this in the plan and flag to the human via spec acknowledgement (open architect decision).
- **Rationale**: Avoid showing duplicate values; avoid inventing a data source. The mockup was rendered on assumed but absent fields.
- **Alternatives considered**:
  - Use the appointment's creator `User.name` — REJECTED because that user is the operator, not the property manager from the tenant's perspective.
  - Use `Branch.contact_email` if the appointment is associated with a branch — DEFERRED because the link `Appointment → Branch` is not currently exposed in the portal payload; would expand scope further.
  - Add `Tenant.contactName` field via migration — DEFERRED to a follow-up because it's a tenant data model change requiring product/data confirmation.
- **Action**: Plan §6.3 frontend contract is updated; the details grid renders as 2 columns × 2 rows = `Agency / Code` on row 1, `Code / Name` on row 2 (effectively dropping "Property Manager" until source is defined).

**Output**: This Phase 0 section serves as the `research.md` for this feature.

---

## 6. Phase 1: Design & Contracts

### 6.1 Data model (`data-model.md` equivalent)

**Entity: `AppointmentRestriction`** (extended)

| Field | Type | Notes |
|---|---|---|
| `id` (existing) | uuid PK | — |
| `appointment_id` (existing) | uuid FK | — |
| `is_home` (existing) | bool | — |
| `unavailable_days_json` (existing) | json? | — |
| `unavailable_hours_json` (existing) | json? | — |
| `notes` (existing) | text? | — |
| **`available_slots_json` (new)** | json? | `Array<{dayOfWeek: 'MON'..'SUN', start: 'HH:mm', end: 'HH:mm'}>` |
| `source` (existing) | enum RestrictionSource | — |
| `created_at` / `updated_at` (existing) | timestamps | — |

**Validation rules**:
- `availableSlotsJson` is optional; when present, each slot must have valid `dayOfWeek`, `start < end`, format `HH:mm` (Zod regex).
- Frontend `WeeklyAvailabilityPicker` enforces these client-side; backend re-validates via Zod.

**Entity: `TenantPortalAction` enum** (extended)

Add `GROUP_JOIN` (new) — alongside existing `VIEW`, `CONFIRM`, `RESCHEDULE`, `CONTACT_UPDATED`, `UNAVAILABLE_REPORTED`.

**No other schema changes.** `service_groups.confirmed_count` and `assigned_inspector_id` are already used by feature 005; the new code paths read/write existing columns.

**Payload expansion (NEW after Planejador round 1/3)**: `GetPortalDataUseCase` response gets a new `tenant` block: `{ name: string, timezone: string }`. Backend reads from `tenants.name` + `tenants.timezone` (existing columns). Additive; backward compatible. Shared Zod schema (`packages/shared/src/schemas/tenant-portal.ts`) extended with the `tenant` block. Frontend type extended.

**State transitions invoked**:
- `appointments`: `AWAITING_INSPECTOR → SCHEDULED` via state-machine 006 with `actorType = SYSTEM`, `reason = "Tenant joined service group ${groupId} via portal"`. Idempotent: if already `SCHEDULED`, no-op.

### 6.2 API Contracts (`contracts/` equivalent)

**Two new endpoints under `/v1/tenant-portal/:token/`.**

#### 6.2.1 `GET /v1/tenant-portal/:token/available-groups`

- **Auth**: portal token middleware (no JWT). If token expired or revoked → `403 PORTAL_ACTION_BLOCKED`. If token is read-only (post 7 PM cutoff) → returns `{ "groups": [] }`.
- **Response 200** (Zod-validated):
  ```typescript
  {
    groups: Array<{
      id: string;                  // uuid
      scheduledDate: string;       // ISO date YYYY-MM-DD
      timeWindow: string;          // e.g. "09:00-12:00"
      suburb: string;              // primary suburb in the group
      inspectorName: string;       // assigned inspector display name
      confirmedCount: number;      // current confirmed count (0..9)
      capacityMax: number;         // always 10 (portal UX cap)
    }>
  }
  ```
- **Errors**: `PORTAL_TOKEN_INVALID`, `PORTAL_ACTION_BLOCKED` (when token expired AND no fallback empty list — spec §5.1 says return empty list when read-only; expired vs read-only is the distinction).

#### 6.2.2 `POST /v1/tenant-portal/:token/join-group`

- **Auth**: portal token middleware. If read-only or expired → `PORTAL_ACTION_BLOCKED`. If `used_at IS NOT NULL` → `PORTAL_TOKEN_ALREADY_USED`.
- **Request** (Zod-validated):
  ```typescript
  {
    groupId: string;           // uuid, required
    tenantNote?: string;       // optional, ≤ 2000 chars
  }
  ```
- **Response 200**:
  ```typescript
  {
    scheduledDate: string;     // ISO date
    timeWindow: string;
    tenantConfirmationStatus: 'CONFIRMED';
    appointmentStatus: 'SCHEDULED';
    inspector: { id: string; name: string };
  }
  ```
- **Errors** (mapped via `tenant-portal.errors.ts`):
  - `PORTAL_ACTION_BLOCKED` 403 — token expired/revoked or post-cutoff
  - `PORTAL_TOKEN_ALREADY_USED` 409 — token's `used_at` is not NULL
  - `PORTAL_APPOINTMENT_INACTIVE` 409 — appointment in CANCELLED/DONE/REJECTED
  - `PORTAL_GROUP_NOT_FOUND` 404 — group missing or fails filter criteria
  - `PORTAL_GROUP_FULL` 409 — group reached 10 confirmed during request
  - `PORTAL_GROUP_UNAVAILABLE` 409 — group transitioned to CANCELLED/REJECTED mid-request

**Idempotency**: NOT required (single-shot token already enforces at-most-once execution).

#### 6.2.3 No changes to existing endpoint contracts

`GET /portal-data`, `GET /portal-activities`, `POST /confirm`, `POST /reschedule`, `POST /unavailable`, `PATCH /contact` retain their current contracts. The only change in behaviour is that `POST /unavailable` records `availableSlotsJson` in the activity `new_values_json` (§3.4 of spec).

### 6.3 Frontend contracts (`quickstart.md` equivalent)

**Portal**:
1. `PortalPage` calls `usePortalData(token)` — existing.
2. When tenant clicks "Change time": call `useAvailableGroups(token)` (new hook); render `AvailableGroupsList` with skeleton/empty/error states.
3. When tenant selects a group + clicks "Confirm time change": call `useJoinGroup(token).mutateAsync({ groupId, tenantNote })` (new hook).
4. When tenant clicks "Propose new date": expand existing `RescheduleForm.tsx`.
5. "Yes" submit → existing `useConfirm(token).mutateAsync({ tenantNote })`.
6. "No" submit → existing `useReportUnavailability(token).mutateAsync({ tenantNote, restrictions: { availableSlotsJson, ... } })`.

**Web admin**:
1. `AppointmentPortalActivityTab` (existing) consumes `usePortalActivities(appointmentId)` (existing hook) — we extend the tab to render `new_values_json` data summaries below each action label and add `GROUP_JOIN` to the `ACTION_COLORS` map. No new hook required, but verify the hook surfaces `newValuesJson` to the component (extend if needed).
2. `<BulkActionsPanel>` reads `appointment.tenantNote` from the existing selection state and renders a read-only row when non-empty.

### 6.4 Agent context update

Skipped — `update-agent-context.sh` belongs to the speckit script flow which we are not running. The relevant agent-level context (CLAUDE.md backend/web) already covers the new patterns.

---

## 7. Implementation Order

```
T0 — Spike & decisions (Phase 0 finalisation)
  ├─ T0-001: Verify PostGIS availability (R1)
  └─ T0-002: Verify the GetPortalDataUseCase extension path (R5) — confirm `tenants.name` and `tenants.timezone` columns are present and reachable from the use-case
  (T0 for inspector_assignments REMOVED after Planejador round 1/3 — premise invalidated; direct `appointment.assigned_inspector_id` update is used)

T1 — Shared schemas + enums (no backend or frontend deps)
  ├─ T1-001: Extend portalRestrictionsSchema with availableSlotsJson
  ├─ T1-002: Add joinGroupRequestSchema, availableGroupsResponseSchema
  ├─ T1-003: Add TenantPortalAction.GROUP_JOIN enum + test update
  └─ T1-004: Add AvailableSlot, AvailableGroup TS types (web consumes these from shared)

T2 — Prisma migration (DB-level additions, must be deployed to staging before backend lands)
  ├─ T2-001: Add available_slots_json column to AppointmentRestriction
  ├─ T2-002: Add GROUP_JOIN to TenantPortalAction enum
  └─ T2-003: Generate Prisma client + verify shape

T3 — Backend domain layer (no dependencies on application yet)
  └─ T3-001: Add PortalGroupNotFoundError, PortalGroupFullError, PortalGroupUnavailableError

T4 — Backend application layer (depends on T1, T2, T3)
  ├─ T4-001: GetAvailableGroupsUseCase (test-first)
  ├─ T4-002: JoinGroupUseCase (test-first) — orchestrates token, group, state-machine 006, audit
  └─ T4-003: Extend ReportUnavailabilityUseCase to include availableSlotsJson in activity new_values_json

T5 — Backend infrastructure (repository query for portal-eligible groups)
  └─ T5-001: Add findPortalEligibleGroups to PrismaServiceGroupRepository (ACCEPTED, confirmedCount<10, same tenant+serviceType, 2km radius, scheduledDate ≥ today+1)

T6 — Backend interfaces (depends on T4, T5)
  ├─ T6-001: Add GET /available-groups route + Zod request/response wiring
  └─ T6-002: Add POST /join-group route + Zod request/response wiring + error mapping

T7 — Backend integration tests (depends on T6)
  ├─ T7-001: GET /available-groups happy path + cutoff + empty + radius edge
  ├─ T7-002: POST /join-group success path with state-machine 006 transition + audit + activity + token used
  ├─ T7-003: POST /join-group race conditions (GROUP_FULL, GROUP_UNAVAILABLE, TOKEN_ALREADY_USED)
  └─ T7-004: Extend existing report-unavailability test to assert availableSlotsJson in activity

T8 — Frontend portal (depends on T1, T6)
  ├─ T8-001: Add types AvailableSlot, AvailableGroup; extend types/index.ts
  ├─ T8-002: Add useAvailableGroups + useJoinGroup hooks (TanStack Query)
  ├─ T8-003: Build WeeklyAvailabilityPicker (test-first)
  ├─ T8-004: Build AvailableGroupsList (test-first) with skeleton, empty, error states
  ├─ T8-005: Build InspectionConfirmationForm (test-first) — Yes/No toggle, observation, conditional picker, submit gating
  ├─ T8-006: Rewrite PortalPage.tsx — wire date pill, primary/secondary CTAs, change-time flow, cancel/back, error states
  ├─ T8-007: Remove ConfirmSection.tsx, UnavailableSection.tsx (and their tests) — content collapsed
  └─ T8-008: Minor restyle of RescheduleForm.tsx to fit new design tokens

T9 — Frontend admin (depends on T1)
  ├─ T9-001: EXTEND AppointmentPortalActivityTab — add GROUP_JOIN to ACTION_COLORS map (icon: mdi-calendar-arrow-right or similar); render new_values_json summaries below the action label (tenantNote, availableSlotsJson summary, group date/window for GROUP_JOIN, new date for RESCHEDULED)
  ├─ T9-002: EXTEND AppointmentPortalActivityTab.test.tsx — assert GROUP_JOIN row renders with group summary; assert UNAVAILABLE row renders availableSlotsJson summary
  └─ T9-003: Extend bulk-actions panel — surface tenantNote row when non-empty

T10 — E2E (Playwright)
  ├─ T10-001: Yes-flow happy path
  ├─ T10-002: No-flow with WeeklyAvailabilityPicker
  ├─ T10-003: Change-time happy path → join-group succeeds → success card
  ├─ T10-004: Change-time cancel/back → token preserved → tenant retries with Yes
  ├─ T10-005: Mobile viewport ≤ 480 px regressions (responsive layout)
  └─ T10-006: Mobile viewport 320 px Playwright assertion — Submit button reachable + day chips wrap + observation textarea visible (added after Planejador round 1/3 — "smoke manual sozinho é fraco")

T11 — Verification & docs
  ├─ T11-001: Run pnpm typecheck + lint + test across all workspaces
  ├─ T11-002: Run Prisma migration dry-run + Prisma format
  ├─ T11-003: Update apps/web/CLAUDE.md and apps/backend/CLAUDE.md if conventions changed
  └─ T11-004: Manual smoke test on staging (after merge)
```

---

## 8. Required Tests (high-level)

| Layer | Scenario | File(s) |
|---|---|---|
| Backend unit | `JoinGroupUseCase` success — appointment transitions, group linked, audit + activity + token used | `join-group.use-case.test.ts` |
| Backend unit | `JoinGroupUseCase` cutoff blocks (PORTAL_ACTION_BLOCKED) | same |
| Backend unit | `JoinGroupUseCase` token already used (PORTAL_TOKEN_ALREADY_USED) | same |
| Backend unit | `JoinGroupUseCase` race: group full at validation time (PORTAL_GROUP_FULL) | same |
| Backend unit | `JoinGroupUseCase` race: group cancelled mid-flight (PORTAL_GROUP_UNAVAILABLE) | same |
| Backend unit | `JoinGroupUseCase` previous-group detach: confirmed_count decremented + notification fire | same |
| Backend unit | `GetAvailableGroupsUseCase` happy path | `get-available-groups.use-case.test.ts` |
| Backend unit | `GetAvailableGroupsUseCase` empty when no eligible groups | same |
| Backend unit | `GetAvailableGroupsUseCase` returns empty when token is read-only (cutoff) | same |
| Backend unit | `GetAvailableGroupsUseCase` filters: status=ACCEPTED, count<10, same tenant+serviceType, 2km radius, date ≥ today+1 | same |
| Backend integration | `POST /unavailable` records availableSlotsJson in activity new_values_json | extend `tenant-portal.routes.test.ts` |
| Frontend unit | WeeklyAvailabilityPicker — chip toggle, time range default, validation | `WeeklyAvailabilityPicker.test.tsx` |
| Frontend unit | AvailableGroupsList — skeleton, empty, error, list render | `AvailableGroupsList.test.tsx` |
| Frontend unit | InspectionConfirmationForm — submit enable rules table from spec §3.2 | new test |
| Frontend unit | `AppointmentPortalActivityTab` (extended) — GROUP_JOIN row renders with group summary; UNAVAILABLE_REPORTED renders availableSlotsJson summary; tenantNote rendered on CONFIRM/RESCHEDULE | `AppointmentPortalActivityTab.test.tsx` |
| Frontend E2E | Yes/No/Change time/Propose new date flows + cancel/back | new Playwright spec |

**Coverage target**: 80%+ on `tenant-portal` module (critical-path module per constitution §III).

---

## 9. Complexity Tracking (justified deviations)

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New portal-specific `JoinGroupUseCase` instead of reusing `AddAppointmentsToGroupUseCase` | The canonical validator `ServiceGroupValidator.canAddToGroup` rejects ACCEPTED groups and mismatched dates/timeSlots. Reusing it would require relaxing those invariants — risking the admin add-to-group flow that depends on them for correctness. | Parameterising the validator with a `mode: 'portal-join'` flag was considered. Rejected because it adds branching paths to a critical domain validator and increases coupling between portal and service-group modules. Two isolated use-cases are easier to reason about, easier to test, and easier to deprecate independently. |
| Portal-specific cap of 10 confirmed (UX), distinct from the domain cap of 30 | The product decision (`historico-5`) explicitly separates the portal UX limit (10) from the domain invariant (30). The portal cap is a presentation layer concern. | Treating 10 as the domain cap was rejected because the admin/marketplace must keep adding to 30 (decision 2026-05-06 item 5). |

---

## 10. Acceptance Criteria

Mapped 1:1 from spec §12 success criteria (SC-01..SC-16). Plus:

- Lint clean (`pnpm lint`).
- Typecheck clean (`pnpm typecheck`).
- All tests pass (`pnpm test`), including the existing 175 unit + 8 integration portal tests.
- Prisma migration dry-run succeeds.
- Build succeeds in CI for backend + web + pwa + shared.

---

## 11. Risk Register & Attention Points

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PostGIS not available in target environment | Low | Medium | Phase 0 R1 verifies; Haversine fallback documented |
| `confirmed_count` drift after detach | Medium | Medium | Atomic SQL update with row-level lock; verification test in T7-002 |
| Inspector notification spam if tenants join/leave many groups | Low | Low | Fire-and-forget; existing notification module dedupes |
| Token race when tenant clicks Submit twice | Medium | Low | Single-shot semantics + `PORTAL_TOKEN_ALREADY_USED` on second call; UI disables button during request |
| Old portal tokens served from cached browser tab after deploy | Low | Low | Token middleware already handles unknown enum values gracefully; activity write tolerant |
| Mobile responsiveness regression in `WeeklyAvailabilityPicker` | Medium | Low | Test cases T10-005; manual smoke at viewport 320/480/768 |

---

## 12. Confidence

**HIGH** — entire plan anchored in:
- The approved spec v2.1 (every decision is documented).
- Read code: `ServiceGroupValidator` (capacity, status), `accept-offer.use-case.ts` (state-machine 006 invocation pattern), `report-unavailability.use-case.ts` (notification + activity recording pattern), `tenant-portal.errors.ts` (error class shape), `prisma-service-group.repository.ts` (capacity = 30 enforcement and existing indexes), spec 007 (FR-072, FR-045 reschedule semantics).
- Properfy constitution v1.x (all gates pass; one justified deviation tracked).
- Human's explicit decisions in `historico-5` for every BLOCKER and MAJOR.

**Open architect decisions (deferred to T0)**: PostGIS availability (R1) and tenant.timezone field surfaced in portal-data (R5) — both verifiable in 1-2 commands during T0; will not change the plan if either is missing (fallbacks documented).
