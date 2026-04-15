# Tasks: 021-contacts

**Input**: Design documents from `specs/021-contacts/`
**Prerequisites**: plan.md (complete), spec.md (complete), data-model.md (complete), research.md (complete), contracts/contact-endpoints.md (complete)

**Tests**: Included — TDD is mandatory per constitution (Principle III).

**Organization**: Tasks are grouped by execution phase following the plan's 4-phase strategy. User stories (US1–US6 from the spec) are mapped to Phase 2 (contact CRUD/search) and Phase 3 (consumer integration). Phase 1 is foundational infrastructure that blocks all stories.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story (e.g., US1, US4) — applied on user story phases only
- Exact file paths included on every task

---

## Phase 1: Schema & Shared Foundation

**Purpose**: Prisma migration, shared enums/schemas, domain layer. MUST complete before any module code.

**Critical path**: every subsequent phase depends on Phase 1 completion.

- [x] T001 [P] Create `ContactType` enum in `packages/shared/src/enums/contact-type.ts` — values: `TENANT | PROPERTY_MANAGER | HOUSEKEEPER | BROKER | OTHER`. Export from `packages/shared/src/enums/index.ts`
- [x] T002 [P] Create `ContactChannelType` enum in `packages/shared/src/enums/contact-channel-type.ts` — values: `EMAIL | PHONE`. Export from `packages/shared/src/enums/index.ts`
- [x] T003 [P] Create `AppointmentContactRole` enum in `packages/shared/src/enums/appointment-contact-role.ts` — values: `TENANT | TENANT_REPRESENTATIVE | HOUSEKEEPER | PROPERTY_MANAGER | BROKER | OTHER`. Export from `packages/shared/src/enums/index.ts`
- [x] T004 Rewrite `packages/shared/src/schemas/contact.ts` — replace flat `contactSchema` with: `contactRegistrySchema` (create), `contactRegistryUpdateSchema` (patch), `additionalChannelSchema` (channel entry), `appointmentContactLinkSchema` (junction linkage — `contactId` XOR `inline`, `role`, `isPrimary`). Add `.refine()` for at-least-one-channel, no-duplicate-channels, and no-intra-array-duplicates. Add `.max(10)` on the `additionalChannels` array to enforce bounded cardinality (data-model says "max ~5", use 10 as a generous ceiling). Export all from `packages/shared/src/schemas/index.ts`
- [x] T005 Rewrite `packages/shared/src/schemas/contact.test.ts` — test cases: valid registry create, missing all channels → error, duplicate email in additionalChannels → error, valid link with contactId, valid link with inline, both contactId and inline → error, zero primary in array → error, two primaries → error
- [x] T006 Add `Contact` interface and revised `AppointmentContact` interface to `packages/shared/src/types/entities.ts` — Contact with all data-model fields; AppointmentContact with `contactId`, `role`, `isPrimary`, `snapshotName`, `snapshotEmail`, `snapshotPhone`. Export from `packages/shared/src/types/index.ts`
- [x] T007 Add `ContactType`, `ContactChannelType`, `AppointmentContactRole` enums and `Contact` model to `apps/backend/prisma/schema.prisma` — model with all columns from `specs/021-contacts/data-model.md`, FK to `tenants`, partial unique indexes on `(tenant_id, primary_email)` and `(tenant_id, primary_phone)` where active, CHECK constraint `contacts_at_least_one_channel`. Add `contact_id` (nullable FK), `snapshot_name`, `snapshot_email`, `snapshot_phone`, `role` (AppointmentContactRole), `is_primary` columns to `AppointmentContact` model (additive — do NOT drop legacy columns)
- [x] T008 Generate Prisma migration via `npx prisma migrate dev --name add_contacts_registry` in `apps/backend/`. Verify migration SQL includes: `CREATE EXTENSION IF NOT EXISTS pg_trgm`, `CREATE TYPE "ContactType"`, `CREATE TYPE "ContactChannelType"`, `CREATE TYPE "AppointmentContactRole"`, `CREATE TABLE "contacts"`, `ALTER TABLE "appointment_contacts" ADD COLUMN ...` for all new columns. Verify `npx prisma validate` passes
- [x] T009 Write backfill SQL inside the same migration (or a second migration if Prisma requires): for all existing `appointment_contacts` rows, `UPDATE SET snapshot_name = tenant_name, snapshot_email = primary_email, snapshot_phone = primary_phone, is_primary = true, role = 'TENANT' WHERE snapshot_name IS NULL`. Verify idempotency (re-running doesn't change rows). Add partial unique indexes: `UNIQUE (appointment_id) WHERE is_primary = TRUE`, `UNIQUE (appointment_id, contact_id) WHERE contact_id IS NOT NULL`. Add `(contact_id)` index
- [x] T010 Create `apps/backend/src/modules/contact/domain/contact.entity.ts` — read-only value object: `id`, `tenantId`, `type`, `displayName`, `company`, `primaryEmail`, `primaryPhone`, `additionalChannels`, `notes`, `isActive`, `createdAt`, `updatedAt`
- [x] T011 Create `apps/backend/src/modules/contact/domain/contact.repository.ts` — `IContactRepository` port interface with methods: `findById`, `findAll`, `search`, `save`, `update`, `existsByEmail`, `existsByPhone`, `findAppointmentsByContactId`
- [x] T012 Create `apps/backend/src/modules/contact/domain/contact.errors.ts` — domain errors: `ContactNotFoundError`, `ContactEmailAlreadyExistsError`, `ContactPhoneAlreadyExistsError`, `ContactChannelDuplicatedError`, `ContactNoChannelError`
- [x] T013 Create `apps/backend/src/modules/contact/domain/contact-validation.service.ts` — pure functions (no I/O): `validateNoDuplicateChannels(primaryEmail, primaryPhone, additionalChannels)`, `validateAtLeastOneChannel(primaryEmail, primaryPhone)`, `validateNoIntraArrayDuplicates(additionalChannels)`. Each throws the matching domain error
- [x] T014 Write unit tests for contact-validation.service in `apps/backend/tests/unit/contact/contact-validation.service.test.ts` — at-least-one-channel pass/fail, duplicate-channel detection with email in additional, phone in additional, intra-array duplicate. Minimum 8 test cases

**Checkpoint**: `pnpm typecheck && pnpm test` all green. Migration applies cleanly on testcontainers. All `appointment_contacts` rows have non-null `snapshot_name`. No breaking changes to existing code.

---

## Phase 2: Contact Module — CRUD & Search (US1, US2, US3, US4, US5, US6)

**Purpose**: The standalone contact registry — create, update, deactivate, list, detail, search. All 6 user stories from the spec are covered here.

**Independent test**: Seed contacts in a tenant. Exercise all CRUD endpoints. Verify tenant scoping, email uniqueness, search results.

### US1 — Create contact + US2 — Update contact

- [x] T015 [US1] Create `apps/backend/src/modules/contact/application/use-cases/create-contact.use-case.ts` — resolve tenant (AM from payload, OP/CL_ADMIN from JWT), validate via `contact-validation.service`, check `existsByEmail` and `existsByPhone`, call `IContactRepository.save()`, emit `contact.created` audit via `AuditService`
- [x] T016 [US2] Create `apps/backend/src/modules/contact/application/use-cases/update-contact.use-case.ts` — find by id + tenant, validate merged result (apply patch then validate channels), check uniqueness on changed email/phone (excluding self), call `IContactRepository.update()`, emit `contact.updated` audit. When `isActive` changes, emit `contact.deactivated` or `contact.reactivated` instead
- [x] T017 [P] [US1] Write unit test for `CreateContactUseCase` in `apps/backend/tests/unit/contact/create-contact.use-case.test.ts` — happy path, missing all channels, duplicate email, AM tenant resolution, OP tenant resolution, forbidden for CL_USER. Minimum 6 cases
- [x] T018 [P] [US2] Write unit test for `UpdateContactUseCase` in `apps/backend/tests/unit/contact/update-contact.use-case.test.ts` — happy path, not found, email conflict on change, deactivation audit, reactivation audit. Minimum 5 cases

### US3 — Deactivate contact

- [x] T019 [US3] Create `apps/backend/src/modules/contact/application/use-cases/deactivate-contact.use-case.ts` — thin wrapper over update with `isActive = false`. Verifies contact exists and is currently active. Emits `contact.deactivated` audit. (Reactivation uses `UpdateContactUseCase` with `isActive = true`)

### US4 — Search/autocomplete + US6 — List contacts

- [x] T020 [US4] Create `apps/backend/src/modules/contact/application/use-cases/search-contacts.use-case.ts` — accepts `tenantId`, `query` string, optional `type` filter, optional `isActive` filter (default true). Delegates to `IContactRepository.search()` which uses `pg_trgm` similarity on `display_name`, `primary_email`, `primary_phone`. Returns paginated results
- [x] T021 [US6] Create `apps/backend/src/modules/contact/application/use-cases/list-contacts.use-case.ts` — standard paginated listing with filters (`type`, `isActive`, `tenantId` for AM, `search`). Delegates to `IContactRepository.findAll()`

### US5 — Contact detail + appointment history

- [x] T022 [US5] Create `apps/backend/src/modules/contact/application/use-cases/get-contact.use-case.ts` — find by id + tenant scope, optional `includeAppointments` flag that calls `IContactRepository.findAppointmentsByContactId()` for reverse-lookup. Returns 404 (not 403) on cross-tenant access for non-AM

### Repository

- [x] T023 Create `apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts` implementing `IContactRepository` — all methods: `findById` (with tenant scope), `findAll` (paginated, filtered, sorted), `search` (see pg_trgm strategy below), `save` (insert), `update` (partial), `existsByEmail` (partial unique check scoped to active + tenant, excluding self), `existsByPhone` (same), `findAppointmentsByContactId` (join `appointment_contacts` on `contact_id`, return appointment summaries). **pg_trgm detection strategy**: on repository initialization (constructor or lazy-init), run `SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'` once and store the result as a private `hasTrgm: boolean` flag. In `search()`, if `hasTrgm` is true, use `WHERE display_name % $1 OR primary_email % $1 OR primary_phone % $1` with `similarity()` ordering. If false, fall back to `WHERE lower(display_name) LIKE lower($1) || '%' OR lower(primary_email) LIKE lower($1) || '%' OR primary_phone LIKE $1 || '%'` (prefix match via B-tree). This is decided once at startup, not per query
- [x] T024 Register `IContactRepository` → `PrismaContactRepository` in the DI container at `apps/backend/src/modules/contact/infrastructure/` (or wherever the project's DI wiring lives — match existing pattern from `appointment/` module)

### HTTP Routes

- [x] T025 Create `apps/backend/src/modules/contact/interfaces/http/contact.routes.ts` — register 4 Fastify routes: `POST /v1/contacts` (create), `PATCH /v1/contacts/:contactId` (update/deactivate/reactivate), `GET /v1/contacts` (list + search), `GET /v1/contacts/:contactId` (detail). Each route: extract auth context, resolve tenant, validate payload via shared Zod schema, call use case, return shaped response. RBAC: POST/PATCH restricted to AM, OP, CL_ADMIN. GET allowed for CL_USER too (read-only)
- [x] T026 Register contact routes in the Fastify application entry point (match existing module registration pattern)

### Integration Tests

- [x] T027 [US1] Write integration test for contact creation in `apps/backend/tests/integration/contact/create-contact.test.ts` — happy path (AM, OP, CL_ADMIN), forbidden (CL_USER, INSP), tenant scoping (OP creates in own tenant), duplicate email in same tenant → 409, duplicate email in different tenant → OK, missing all channels → 400, additionalChannels duplicating primary → 400, audit record written. Minimum 8 cases
- [x] T028 [US2] Write integration test for contact update in `apps/backend/tests/integration/contact/update-contact.test.ts` — happy path, not found (wrong tenant → 404), email change to conflicting value → 409, deactivation via `isActive: false`, reactivation via `isActive: true`, audit records. Minimum 6 cases
- [x] T029 [US3] Write integration test for deactivation behavior in `apps/backend/tests/integration/contact/deactivate-contact.test.ts` — deactivated contact excluded from search, deactivated contact excluded from list (default), deactivated contact visible with `isActive=false` filter, deactivated email allows new contact with same email. Minimum 4 cases
- [x] T030 [US4] Write integration test for search/autocomplete in `apps/backend/tests/integration/contact/search-contacts.test.ts` — search by partial name, search by email, search by phone, type filter, tenant scoping (CL_ADMIN sees only own), AM cross-tenant. **Performance case for SC-005 / NFR-001**: seed 500 contacts in a single tenant, run a search query, assert response completes within 500 ms wall-clock (generous margin for CI; the spec target is 200 ms p95 which is a production measurement). Minimum 7 cases (6 functional + 1 perf)
- [x] T031 [US6] Write integration test for contact list in `apps/backend/tests/integration/contact/list-contacts.test.ts` — pagination, sorting, type filter, isActive filter, tenant scoping. Minimum 5 cases
- [x] T032 [US5] Write integration test for contact detail + appointment history in `apps/backend/tests/integration/contact/get-contact.test.ts` — happy path, not found cross-tenant, `includeAppointments=true` returns linked appointments. Minimum 3 cases

**Checkpoint**: All contact CRUD + search endpoints functional. `pnpm test` green. Contact module is self-contained — no appointment/portal/notification changes yet.

---

## Phase 3: Consumer Integration Hooks

**Purpose**: Revise `appointment_contacts` entity and repository to the junction + snapshot shape. Prepare the integration points that features 006, 007, and 009 depend on. This phase makes the new contact registry usable by appointment creation and related flows.

**Critical path**: 3.1 → 3.2 → 3.3 are serial (appointment junction foundation). 3.4–3.7 can partially parallel after 3.2.

### Appointment junction foundation (serial)

- [x] T033 Revise `apps/backend/src/modules/appointment/domain/appointment-contact.entity.ts` — replace inline fields (`tenantName`, `primaryEmail`, `secondaryEmail`, `primaryPhone`, `secondaryPhone`) with junction shape: `contactId` (nullable), `role` (AppointmentContactRole), `isPrimary` (boolean), `snapshotName`, `snapshotEmail`, `snapshotPhone`. Keep old fields accessible during expand phase (read from legacy columns when snapshot is null, for backward compat)
- [x] T034 Revise `apps/backend/src/modules/appointment/domain/appointment.repository.ts` — update `IAppointmentRepository` port: (a) `saveContact(contact)` accepts junction shape (contactId, role, isPrimary, snapshotName, snapshotEmail, snapshotPhone). (b) Replace `updateContact(appointmentId, data: { tenantName, primaryEmail, ... })` with `updateContactSnapshot(appointmentId, contactJunctionId, data: { snapshotName?, snapshotEmail?, snapshotPhone? })` — the portal dual-write (T039) depends on this new method to update snapshot fields on a specific junction row. The old `updateContact()` signature is removed. (c) `findById` enrichment returns junction-shaped contacts (primary first, then insertion order). (d) Add `findContactsByAppointmentId(appointmentId)` returning junction rows with optional `contacts` JOIN when `contact_id IS NOT NULL`. (e) Add `deleteContactsByAppointmentId(appointmentId)` for the replacement flow in T037. (f) Verify `AppointmentListItem.tenantName` (used in list serialization) now reads from `snapshot_name` — rename field to `contactName` or keep as `tenantName` mapped from `snapshot_name`, whichever is less disruptive to existing frontend consumers. (g) Verify `findScheduledOnDate()` returns junction-shaped contacts (consumed by dispatch-reminders and dispatch-escalations)
- [x] T035 Revise `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts` — rewrite contact-related queries: `saveContact` inserts junction row (snapshot fields + optional contact_id). `findById` reads from new columns (with fallback to legacy columns during expand phase). All existing appointment queries that include contacts now read snapshot fields

### Appointment use case revisions (partially parallel after T035)

- [x] T036 Revise `apps/backend/src/modules/appointment/application/use-cases/create-appointment.use-case.ts` — accept `contacts` array in payload (via `appointmentContactLinkSchema`). For each entry: if `contactId` provided → verify contact exists, is active, same tenant, then snapshot its `displayName`/`primaryEmail`/`primaryPhone` into junction. If `inline` provided → call `IContactRepository.save()` first (create registry contact), then link. Enforce exactly-one-primary invariant. Import `IContactRepository` via DI port (not direct Prisma)
- [x] T037 [P] Revise `apps/backend/src/modules/appointment/application/use-cases/update-appointment.use-case.ts` — when `contacts` array is provided in the patch payload, replace existing junction rows (delete old + insert new, within transaction). **Replacement semantics** (critical for implementer clarity): (a) `contacts: []` (empty array) is invalid — reject with `APPOINTMENT_CONTACTS_REQUIRED` (min 1, exactly-one-primary rule). (b) Snapshot fields are re-captured from the registry contact at replacement time — this is intentional because a replacement is a **new linkage**, not a registry-update propagation. It does NOT contradict FR-034 (snapshot frozen at link time); FR-034 means registry edits don't back-propagate to existing snapshots, but re-linking explicitly creates a fresh snapshot. (c) Portal tokens (feature 007) remain valid because they are bound to `appointment_id`, not to a specific `appointment_contacts` row ID — deleting and re-creating junction rows does not invalidate the token. (d) Preserve backward compat: if no `contacts` key in patch, don't touch existing junction rows
- [x] T038 [P] Revise `apps/backend/src/modules/appointment/application/use-cases/list-appointment-contacts.use-case.ts` — read from junction snapshot fields instead of legacy inline fields. Optional JOIN to `contacts` table when `contact_id IS NOT NULL` for enriching with live registry data

### Portal dual-write

- [x] T039 Revise `apps/backend/src/modules/tenant-portal/application/use-cases/update-contact.use-case.ts` — implement dual-write (feature 007 FR-053). **Depends on T034** (the new `updateContactSnapshot()` method on `IAppointmentRepository`). Steps: (a) Find the primary junction row for this appointment. (b) Update the snapshot via `updateContactSnapshot(appointmentId, junctionRowId, { snapshotName?, snapshotEmail?, snapshotPhone? })`. (c) If `contact_id IS NOT NULL` on the junction row, also update the registry contact via `IContactRepository.update(contactId, tenantId, { displayName?, primaryEmail?, primaryPhone? })` — import `IContactRepository` via DI port (add as new constructor dependency). (d) On registry email uniqueness conflict (`ContactEmailAlreadyExistsError`): catch the error, skip registry update silently, write `contact.portal_update_skipped_conflict` audit record. The snapshot still updates. (e) If `contact_id IS NULL` (legacy row): only the snapshot updates, no registry write attempted

### Notification snapshot field rename

- [x] T040 [P] Revise `apps/backend/src/modules/notification/application/handlers/notify-on-status-transition.handler.ts` — change contact email resolution from `contact.primaryEmail` to `contact.snapshotEmail` (the appointment enrichment from `findById` now returns junction-shaped contacts)
- [x] T041 [P] Revise `apps/backend/src/modules/notification/application/handlers/notify-on-tenant-portal-action.handler.ts` — same field rename as T040
- [x] T042 [P] Revise `apps/backend/src/modules/notification/application/use-cases/dispatch-reminders.use-case.ts` — same field rename: resolve reminder recipient from primary contact's `snapshotEmail`
- [x] T042a [P] Revise `apps/backend/src/modules/notification/application/use-cases/dispatch-escalations.use-case.ts` — change `contact.primaryPhone` → `contact.snapshotPhone`, `contact.tenantName` → `contact.snapshotName` in both the PM escalation email payload and the tenant SMS alert block. This use case reads from `findScheduledOnDate()` which returns `AppointmentWithRelations` — the contact inside that result is now junction-shaped after T035

### Integration tests for consumer revisions

- [x] T043 Write integration test for appointment creation with `contactId` reference in `apps/backend/tests/integration/appointment/create-appointment-with-contact.test.ts` — link existing registry contact → junction created with correct snapshot values. Contact in different tenant → error. Inactive contact → error. Missing primary → error. Two primaries → error. Minimum 5 cases
- [x] T044 Write integration test for appointment creation with `inline` contact in `apps/backend/tests/integration/appointment/create-appointment-inline-contact.test.ts` — inline creates registry contact + junction atomically. Snapshot matches registry at creation time. Minimum 3 cases
- [x] T045 Write integration test for snapshot immutability in `apps/backend/tests/integration/contact/snapshot-immutability.test.ts` — create contact, link to appointment (snapshot captured), update contact email in registry, read appointment → snapshot still has OLD email. Minimum 2 cases
- [x] T046 Write integration test for portal dual-write in `apps/backend/tests/integration/tenant-portal/portal-contact-dual-write.test.ts` — portal update updates snapshot + registry. Email conflict on registry → snapshot updates, registry skipped, audit `contact.portal_update_skipped_conflict` written. Legacy junction row (contact_id = NULL) → only snapshot updates. Minimum 4 cases
- [x] T047 Write integration test for notification recipient resolution in `apps/backend/tests/integration/notification/notification-snapshot-recipient.test.ts` — trigger a status transition notification, verify recipient resolved from `snapshotEmail` of primary junction contact. Also verify the escalation dispatcher reads `snapshotPhone` for SMS alerts and `snapshotName` for template payloads (covers T042a). Minimum 4 cases (2 for status-transition handler, 2 for escalation dispatcher)

**Checkpoint**: Appointment creation works with both `contactId` and `inline` patterns. Portal dual-write works with conflict handling. Notifications use snapshot. All existing tests pass (with fixture updates). `pnpm test` green across all workspaces.

---

## Phase 4: Verification & Polish

**Purpose**: Full suite verification, lint, typecheck, migration safety, legacy reference cleanup.

- [x] T048 Run `pnpm typecheck` across all workspaces — must pass with zero errors
- [x] T049 Run `pnpm lint` across all workspaces — must pass
- [x] T050 Run `pnpm test` across all workspaces — all green
- [x] T051 Verify Prisma migration status: `npx prisma migrate status` returns clean. Run `npx prisma migrate deploy` against a fresh testcontainers DB to verify the full migration chain applies from scratch
- [x] T052 Grep for legacy field references in non-migration new code: `grep -rn 'tenantName\|primaryEmail\|secondaryEmail\|secondaryPhone' apps/backend/src/modules/contact/ apps/backend/src/modules/appointment/domain/appointment-contact.entity.ts` — must return zero hits in new/revised files (legacy fields are still read in the expand-phase backward-compat layer, but new code paths must use snapshot fields)
- [x] T053 Verify `pg_trgm` GIN index exists on `contacts.display_name` by inspecting the generated migration SQL. If `pg_trgm` is unavailable in the test environment, verify the fallback B-tree index on `lower(display_name)` is created instead

**Checkpoint**: Feature 021 is complete. All verification gates pass. Ready for `/speckit.analyze`.

---

## Residual Notes

### Column drop is NOT in this task list

The legacy `appointment_contacts` columns (`tenant_name`, `primary_email`, `secondary_email`, `primary_phone`, `secondary_phone`) are **not dropped** in this round. They remain in the schema during the expand phase. Dropping them is a separate task after all consumers (006, 007, 008, 009) confirm they work exclusively on junction/snapshot fields. This follows the expand/contract migration pattern per `CLAUDE.md` CI/CD rules.

### `contact_id = NULL` is acceptable for legacy data

Existing `appointment_contacts` rows (pre-021) have `contact_id = NULL` with snapshot fields populated from the backfill. This is by design:
- Legacy appointments are typically in terminal states (DONE, CANCELLED, REJECTED).
- The snapshot fields are the source of truth for these rows.
- Operators can optionally re-link legacy contacts to registry entries through the UI in a future round.
- No forced backfill of `contact_id` is planned or needed.

### Consumer features (006, 007, 008, 009) — scope boundary

Phase 3 implements the **integration hooks** these features depend on:
- Appointment creation/update with `contactId` / `inline` (for 006)
- Portal dual-write (for 007)
- Notification snapshot field rename (for 009)

Phase 3 does **NOT** implement:
- Bulk-edit `propertyManagerContactId` endpoint (006-appointments scope)
- Job Details PM live registry resolution in PWA endpoint (008-inspectors-execution scope)
- Frontend changes for contact selection/autocomplete UI (006/008/014 scope)
- Contact import via CSV/XLSX (021#GAP-001, future round)

These are tasks for the respective feature plans, not for 021.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Schema & Shared)**: No dependencies — start immediately. **BLOCKS all other phases.**
- **Phase 2 (Contact Module)**: Depends on Phase 1 completion. Independent of Phase 3.
- **Phase 3 (Consumer Integration)**: Depends on Phase 1 AND Phase 2 (uses `IContactRepository` from Phase 2).
- **Phase 4 (Verification)**: Depends on all previous phases.

### Critical Path

```
T001–T003 (enums, parallel) → T004–T006 (schemas/types) → T007–T009 (Prisma migration + backfill)
→ T010–T014 (domain layer + unit tests)
→ T015–T026 (contact module CRUD + search + routes)
→ T027–T032 (integration tests)
→ T033–T035 (appointment junction foundation, serial)
→ T036 (appointment creation revision)
→ T043–T047 (consumer integration tests)
→ T048–T053 (verification)
```

### Parallel Opportunities

**Within Phase 1**: T001, T002, T003 (enums) run in parallel.

**Within Phase 2**: T017, T018 (unit tests) run in parallel. T020, T021 (search + list use cases) run in parallel. T027–T032 (integration tests) run in parallel with each other after routes are wired.

**Within Phase 3**: After T035 (repo revision), T037 (update use case), T038 (list-contacts), T039 (portal dual-write — depends on T034's `updateContactSnapshot`), T040–T042a (notification handlers incl. escalations) can all run in parallel.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 (schema + shared) → foundation ready
2. Complete Phase 2 (contact CRUD) → **contacts registry is independently usable**
3. **STOP and VALIDATE**: all contact endpoints work, search returns results, tenant scoping correct
4. Complete Phase 3 (consumer hooks) → appointments can link to registry contacts
5. Complete Phase 4 (verification) → ready for `/speckit.analyze`

### What "done" looks like

- `POST /v1/contacts` creates a contact in the tenant registry
- `GET /v1/contacts?search=smith` returns matching contacts with < 200 ms p95
- `POST /v1/appointments` with `contacts: [{ contactId: "...", role: "TENANT", isPrimary: true }]` creates junction + snapshot
- `PATCH /v1/tenant-portal/:token/contact` updates both snapshot and registry
- Notification handlers resolve recipients from `snapshotEmail`
- Legacy data is untouched and backward-compatible
- Column drop is deferred
