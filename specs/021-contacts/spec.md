# Feature Specification: Contacts

**Feature Branch**: `021-contacts`
**Created**: 2026-04-12
**Feature Status**: NEW — introduced as a cross-cutting capability during the Feedback Round 2026-04-13 architectural review. No code yet.
**Sources**:
- Architectural decision: conversation-level review of feedback-round items 3 (PM contact in Job Details), 4 (multiple contacts per appointment), and 7 (bulk-edit `propertyManagerContactId`)
- Downstream consumers: `006-appointments`, `007-tenant-portal`, `008-inspectors-execution`, `009-notifications`, `017-invoice-payment-reconciliation`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`

> **Domain context.** A Contact is a person the agency (tenant) interacts with during the property inspection lifecycle — tenants (renters), property managers, brokers, housekeepers, or other parties. Before this feature, contact data was embedded directly in the `appointment_contacts` table as denormalized fields, duplicated across every appointment that involved the same person, with no identity, no reuse, and no way for operators to select a known contact when creating an appointment.
>
> This feature promotes contacts to a **per-tenant registry** — a lightweight contact book scoped to each agency. It does NOT attempt to be a CRM, a merge/dedup engine, or a cross-tenant identity graph. It provides:
>
> 1. **Identity**: each contact has a stable UUID that other entities can reference.
> 2. **Reuse**: operators can select from existing contacts (autocomplete) instead of retyping.
> 3. **Single source of truth**: a contact's current email/phone lives in one place. Updates propagate to future usages but NOT to historical snapshots.
> 4. **Snapshot pattern**: when a contact is linked to an appointment, the name/email/phone are frozen into a snapshot on the junction row. This preserves audit integrity — what mattered is who was contacted *at that time*, not who the contact is *now*.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `NEW` | `APPROVED` | `GAP`. Source: `architectural-review` | `feedback-round`.

## User Scenarios & Testing

### User Story 1 — Operator creates a contact in the tenant registry

- **Priority**: P1
- **Status**: NEW
- **Source**: architectural-review

An AM, OP, or CL_ADMIN creates a contact under their tenant. The contact has a type (e.g., TENANT, PROPERTY_MANAGER), a display name, optional company, primary email, primary phone, and optional additional channels. The contact is created in `ACTIVE` state.

**Independent Test**: As CL_ADMIN, `POST /v1/contacts` with a full payload. Confirm (a) the contact is created with `is_active = true`, (b) the contact is scoped to the actor's tenant, (c) an audit record `contact.created` is written.

**Acceptance Scenarios**:

1. **Given** an authorized actor (AM, OP, CL_ADMIN), **When** they `POST /v1/contacts` with valid payload, **Then** a contact is created scoped to the resolved tenant.
2. **Given** an AM actor with a `tenantId` in the payload, **When** they create a contact, **Then** the contact is scoped to the specified tenant (AM can create cross-tenant).
3. **Given** an OP or CL_ADMIN actor, **When** they attempt to specify a different `tenantId`, **Then** the system ignores it and uses the JWT-resolved tenant.
4. **Given** a CL_USER, INSP, or TNT actor, **When** they call create, **Then** the request is rejected with `FORBIDDEN`.
5. **Given** a payload where `primary_email` matches an existing active contact in the same tenant, **When** create is attempted, **Then** the request fails with `CONTACT_EMAIL_ALREADY_EXISTS`. The operator should link the existing contact instead.
6. **Given** a payload with an `additional_channels` entry that duplicates `primary_email` or `primary_phone`, **When** submitted, **Then** the request fails with `CONTACT_CHANNEL_DUPLICATED`.

---

### User Story 2 — Operator updates a contact

- **Priority**: P1
- **Status**: NEW
- **Source**: architectural-review

An authorized actor updates a contact's fields (name, email, phone, company, type, additional channels). The update does NOT retroactively change snapshots on existing appointments — those remain frozen at link time. The update only affects the registry record and future linkages.

**Independent Test**: Update a contact's `primary_email`. Confirm (a) the registry row reflects the change, (b) existing `appointment_contacts` rows referencing this contact still have the old `snapshot_email`.

**Acceptance Scenarios**:

1. **Given** an authorized actor and a valid contact id in their tenant, **When** they `PATCH /v1/contacts/:contactId`, **Then** the contact is updated and an audit record `contact.updated` is written.
2. **Given** a new `primary_email` that conflicts with another active contact in the same tenant, **When** submitted, **Then** the request fails with `CONTACT_EMAIL_ALREADY_EXISTS`.
3. **Given** a contact linked to 50 appointments, **When** updated, **Then** all 50 appointment snapshot rows retain their original snapshot values. Only future linkages use the updated data.

---

### User Story 3 — Operator deactivates a contact

- **Priority**: P2
- **Status**: NEW
- **Source**: architectural-review

An authorized actor soft-deactivates a contact (`is_active = false`). Deactivated contacts no longer appear in search/autocomplete results but remain linked to existing appointments (the junction rows and their snapshots are untouched). Reactivation is supported.

**Acceptance Scenarios**:

1. **Given** an authorized actor and an active contact, **When** they `PATCH /v1/contacts/:contactId` with `{ isActive: false }`, **Then** the contact is deactivated and an audit record `contact.deactivated` is written.
2. **Given** a deactivated contact, **When** operators search for contacts, **Then** it does not appear in search results (unless a `includeInactive=true` filter is explicitly passed).
3. **Given** a deactivated contact linked to appointments, **When** those appointments are viewed, **Then** the snapshot data is still visible. The junction rows are unaffected.
4. **Given** a deactivated contact, **When** an operator reactivates it (`isActive: true`), **Then** it reappears in search results and an audit record `contact.reactivated` is written.

---

### User Story 4 — Operator searches and selects a contact (autocomplete)

- **Priority**: P1
- **Status**: NEW
- **Source**: architectural-review

When creating or editing an appointment, the operator searches for an existing contact by name, email, or phone. The search returns active contacts in the operator's tenant, ranked by relevance. The operator can select an existing contact (to link to the appointment) or create a new one inline.

**Independent Test**: Seed 20 contacts in a tenant. Search by partial name. Confirm results are scoped to the tenant, ranked by match quality, and limited to `ACTIVE` contacts.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they `GET /v1/contacts?search=smith`, **Then** active contacts in their tenant matching "smith" in `display_name`, `primary_email`, or `primary_phone` are returned, paginated, sorted by relevance.
2. **Given** an optional `type` filter (e.g., `type=PROPERTY_MANAGER`), **When** applied, **Then** only contacts of that type are returned.
3. **Given** no matches, **When** the search returns empty, **Then** the UI offers "Create new contact" as the primary affordance.

---

### User Story 5 — Operator reads a contact and sees its appointment history

- **Priority**: P2
- **Status**: NEW
- **Source**: architectural-review

An operator views a contact's detail page showing the canonical data (name, email, phone, type, company, active status) plus a reverse-lookup of all appointments this contact has been linked to.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they `GET /v1/contacts/:contactId`, **Then** the full contact record is returned including `additional_channels`, `type`, `company`, and `is_active`.
2. **Given** a contact linked to appointments, **When** the detail includes `?includeAppointments=true`, **Then** a paginated list of linked appointment summaries (appointment number, status, scheduled date, role in appointment) is returned.
3. **Given** a contact in a different tenant, **When** a non-AM actor requests it, **Then** the request fails with `CONTACT_NOT_FOUND` (not FORBIDDEN, to prevent existence leakage).

---

### User Story 6 — Operator lists contacts for their tenant

- **Priority**: P1
- **Status**: NEW
- **Source**: architectural-review

Operators browse the contact registry with filters: `type`, `isActive`, `search` (name/email/phone), and pagination. AM can cross-tenant.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they `GET /v1/contacts` with pagination, **Then** contacts scoped to their tenant are returned.
2. **Given** filters `type=PROPERTY_MANAGER&isActive=true`, **When** applied, **Then** only active PMs are returned.
3. **Given** an AM actor with a `tenantId` filter, **When** applied, **Then** contacts for that tenant are returned.
4. **Given** a CL_ADMIN actor, **When** they attempt to pass a different `tenantId`, **Then** it is ignored; only their own tenant's contacts are returned.

---

### Edge Cases

- **Email uniqueness is per-tenant, not global**: the same email can exist in two different tenants' registries. This is correct for multi-tenant isolation — the same property manager might service two agencies and be registered independently in each.
- **Uniqueness is on active contacts only**: the partial unique index `WHERE is_active = true` allows deactivating a contact and creating a new one with the same email. This covers the "wrong contact created by mistake" scenario.
- **No merge/dedup engine**: if operators create two contacts for the same person, the system does not auto-detect or merge them. This is intentional — a dedup engine is CRM scope, not inspection platform scope. Operators can deactivate one and re-link appointments to the other manually.
- **No cross-tenant contact sharing**: even if the same PM works with multiple agencies, their contact is a separate row per tenant. This preserves tenant isolation and avoids LGPD complications.
- **Snapshot immutability vs re-linkage**: the snapshot fields on `appointment_contacts` are frozen at link time and are NOT updated by registry edits (FR-034). However, when an operator **replaces** the contact list on an appointment (via PATCH with a new `contacts` array), the old junction rows are deleted and new ones created — the new rows capture a **fresh snapshot** from the registry. This is intentional: a replacement is a new linkage, not a propagation. The distinction is: registry edit → snapshot untouched; explicit re-link → new snapshot. Snapshot immutability is enforced at the application layer — no DB-level trigger. The `CreateAppointmentUseCase` and `UpdateAppointmentUseCase` write the snapshot on linkage; no other code path writes to snapshot fields except the portal dual-write (feature 007).
- **Contact replacement does not invalidate portal tokens**: portal tokens (feature 007) are bound to `appointment_id`, not to a specific `appointment_contacts` row ID. Deleting and re-creating junction rows during a contact list replacement does not invalidate existing tokens.
- **Empty contact list is invalid**: an appointment PATCH with `contacts: []` (empty array) is rejected. At least one contact with `isPrimary: true` is always required.
- **Inline contact creation during appointment creation**: when an operator creates an appointment and types a new contact (not selecting from autocomplete), `CreateAppointmentUseCase` creates the `contacts` row AND the `appointment_contacts` junction atomically. This is the "create or select" pattern — operators are never forced to pre-create contacts in a separate screen. There is no standalone `LinkContactToAppointmentUseCase` — linking is always done inside the appointment creation/update use cases.
- **Portal contact update semantics**: when a renter updates their email/phone via the tenant portal (feature 007), both the appointment snapshot AND the registry contact are updated. Rationale: the renter is correcting their own data — the correction should propagate. See feature 007 spec for details.

## Requirements

### Functional Requirements

All FRs below are `Status: NEW, Source: architectural-review` unless otherwise noted.

#### Contact CRUD

- **FR-001**: System MUST expose `POST /v1/contacts` restricted to AM, OP, CL_ADMIN. AM resolves tenant from payload; OP and CL_ADMIN from JWT.
- **FR-002**: System MUST expose `PATCH /v1/contacts/:contactId` for updates. Same actor restrictions. Updates do NOT propagate to existing appointment snapshots.
- **FR-003**: System MUST enforce a partial unique index `UNIQUE (tenant_id, primary_email) WHERE is_active = true AND primary_email IS NOT NULL` to prevent duplicate active contacts with the same email in the same tenant.
- **FR-004**: System MUST enforce `UNIQUE (tenant_id, primary_phone) WHERE is_active = true AND primary_phone IS NOT NULL` to prevent duplicate active contacts with the same phone in the same tenant.
- **FR-005**: System MUST support soft-deactivation via `is_active = false`. Deactivated contacts are excluded from search/autocomplete by default but remain linked to existing appointments.
- **FR-006**: System MUST validate `additional_channels_json` entries do not duplicate `primary_email` or `primary_phone`. Error code: `CONTACT_CHANNEL_DUPLICATED`.
- **FR-007**: System MUST validate no duplicate values within `additional_channels_json` itself. Error code: `CONTACT_CHANNEL_DUPLICATED`.

#### Search & Autocomplete

- **FR-010**: System MUST expose `GET /v1/contacts` with filters: `search` (trigram or ILIKE on `display_name`, `primary_email`, `primary_phone`), `type`, `isActive` (default `true`), `tenantId` (AM only), and standard pagination (`page`, `pageSize`, `sortBy`, `sortOrder`).
- **FR-011**: System MUST scope results by the actor's tenant (OP, CL roles) or the specified `tenantId` (AM).

#### Read & Detail

- **FR-020**: System MUST expose `GET /v1/contacts/:contactId` returning the full contact record.
- **FR-021**: System MUST support `?includeAppointments=true` to include a paginated reverse-lookup of linked appointments.
- **FR-022**: Cross-tenant reads by non-AM actors MUST return `CONTACT_NOT_FOUND` (not FORBIDDEN).

#### Linking contacts to appointments

- **FR-030**: When an appointment is created or edited, the caller provides a `contacts` array where each entry is either `{ contactId: uuid, role, isPrimary }` (link an existing registry contact) or `{ inline: { displayName, type, primaryEmail, ... }, role, isPrimary }` (create a new contact and link it).
- **FR-031**: For `contactId`-based linkage, the system MUST: (a) verify the contact exists and belongs to the same tenant, (b) verify the contact is active, (c) snapshot `display_name`, `primary_email`, `primary_phone` from the contact into the junction row at link time.
- **FR-032**: For `inline`-based linkage, the system MUST: (a) create a new `contacts` row, (b) link it via the junction, (c) snapshot as in FR-031. The inline path is sugar for "create + link" in a single request.
- **FR-033**: Exactly one contact in the array MUST have `isPrimary = true`. The system MUST reject payloads with zero or more than one primary.
- **FR-034**: The `appointment_contacts` snapshot fields (`snapshot_name`, `snapshot_email`, `snapshot_phone`) are frozen at link time and MUST NOT be updated by contact registry updates. Only the portal contact update path (feature 007) and explicit operator re-link actions can change them.

#### Audit

- **FR-040**: System MUST audit `contact.created`, `contact.updated`, `contact.deactivated`, `contact.reactivated` via the shared `AuditService`.
- **FR-041**: System MUST validate all payloads against Zod schemas in `packages/shared/src/schemas/contact.ts`.

### Non-Functional Requirements

- **NFR-001**: Contact search (autocomplete) p95 < 200 ms — operators expect instant results while typing in the appointment creation form.
- **NFR-002**: Contact list p95 < 300 ms with standard pagination.
- **NFR-003**: The `contacts` table MUST have a trigram index on `display_name` to support fast prefix/substring search. If Postgres `pg_trgm` is not available in the Supabase plan, fall back to ILIKE with a B-tree index on `lower(display_name)`.

### Key Entities

- **Contact** — `id`, `tenant_id`, `type` (`ContactType` enum), `display_name`, `company`, `primary_email`, `primary_phone`, `additional_channels_json`, `notes`, `is_active`, timestamps. Per-tenant registry of people the agency works with.
- **AppointmentContact** (revised, owned by feature 006) — junction table linking a `contact_id` to an `appointment_id` with frozen `snapshot_name`, `snapshot_email`, `snapshot_phone`, a contextual `role` (`AppointmentContactRole` enum), and `is_primary` flag. See `specs/006-appointments/data-model.md` for the full revised schema.

Full schema in [`data-model.md`](./data-model.md).

## Success Criteria

- **SC-001**: Two contacts with the same `primary_email` in the same tenant cannot both be `is_active = true`. Verified by integration test.
- **SC-002**: Updating a contact's email does not change any existing appointment snapshot. Verified by integration test that checks snapshot before and after update.
- **SC-003**: Deactivated contacts do not appear in search results (without `includeInactive=true`). Verified by integration test.
- **SC-004**: Inline contact creation during appointment creation produces both a `contacts` row and an `appointment_contacts` junction row atomically. Verified by integration test.
- **SC-005**: Autocomplete returns results in under 200 ms for a tenant with 500 contacts. Verified by performance test.

## Assumptions

- **No CRM ambitions**: this is a contact book, not a customer relationship management system. No activity tracking, no pipeline, no scoring, no contact merge/dedup automation.
- **Per-tenant isolation**: contacts are strictly tenant-scoped. No cross-tenant sharing, no global contact directory.
- **JSON for additional channels**: `additional_channels_json` uses a JSON array (not a separate table) because the cardinality is bounded (1-5 per contact) and no cross-contact queries on individual channels are needed.
- **Snapshot is the audit record**: for appointments, the source of truth at notification time and for historical audit is the snapshot on `appointment_contacts`, not the live contact in the registry. The registry is the source of truth for "what is this person's current contact info."
- **CL_USER cannot create contacts directly**: CL_USER creates contacts implicitly through the inline appointment creation path. Direct `/v1/contacts` CRUD is restricted to CL_ADMIN and above. This prevents unauthorized contact book management.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Contact import (bulk) | M | Agencies with large contact books may need a CSV/XLSX import path. Not in scope for this round. Follow the same pattern as 003 and 006 import. |
| GAP-002 | Contact merge/dedup | L | Operators may accidentally create duplicate contacts. A future "merge" feature can consolidate two contacts and re-link their appointment junctions. Not in scope. |
| GAP-003 | Notification preferences on contact | M | Feature 018 (consent/notification prefs) could benefit from per-contact opt-in/opt-out flags. Currently, preferences are appointment-scoped via the portal. Moving them to the contact entity is a natural evolution tracked here. |
| GAP-004 | Contact activity log | L | Viewing all interactions (notifications sent, portal visits, appointment linkages) for a single contact. Currently requires joining multiple tables. A denormalized activity view is a future enhancement. |

## Cross-References

- **006-appointments**: `appointment_contacts` junction table is the primary consumer of the contact registry. See `specs/006-appointments/data-model.md`.
- **007-tenant-portal**: portal contact updates write to both the appointment snapshot and the contact registry. See `specs/007-tenant-portal/spec.md` FR-050..FR-052.
- **008-inspectors-execution**: PWA Job Details resolves tenant contacts and PM contacts from the junction + registry. See `specs/008-inspectors-execution/spec.md` US6a.
- **009-notifications**: recipient resolution uses the appointment snapshot (`snapshot_email`), not the live registry. See `specs/009-notifications/spec.md` FR-040/FR-041.
- **Feedback Round 2026-04-13**: items 3, 4, 7 are the direct drivers. See `specs/feedback-rounds/2026-04-13-customer-feedback-round-1.md`.
