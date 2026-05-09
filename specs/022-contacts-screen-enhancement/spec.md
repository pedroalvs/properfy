# Feature Specification: Contacts Screen Enhancement

**Feature Branch**: `022-contacts-screen-enhancement`
**Created**: 2026-05-09
**Feature Status**: NEW — UX enhancement layered on top of the already-implemented `021-contacts` backend registry. Builds the missing frontend (web) for the contact registry plus small backend extensions to surface property aggregations and per-appointment primary flag.
**Sources**:
- User request (Pedro Alves, 2026-05-09): improve the Contacts screen of the Portal Imobiliaria
- Prior spec: `specs/021-contacts/spec.md` (registry domain, API contract, RBAC)
- Frontend conventions: `apps/web/src/features/properties/` (canonical list+drawer+page+form pattern)
- Audit timeline: `specs/020-audit-retention-pii-redaction/spec.md` + `apps/backend/src/modules/audit/interfaces/audit.routes.ts`

> **Domain context.** The contact registry (021) is implemented in the backend (`/v1/contacts` CRUD, search, detail with appointments) and exposed via the shared schemas, but **no UI exists** in the web app for the registry. The current `/tenant-contacts` route in the web app actually lists `appointment_contacts` (per-appointment tenant confirmation snapshots) — a legacy view labelled as "Contacts" in the sidebar. This feature delivers the missing registry UI and clarifies the IA: rename the legacy view to "Tenant Confirmations", and add a new "Contacts" item that lists the registry.

## User Scenarios & Testing

### User Story 1 — Operator browses the contact registry with property aggregation

- **Priority**: P1
- **Status**: NEW
- **Source**: user-request

An operator (AM, OP, CL_ADMIN, CL_USER) opens the new `/contacts` page. They see a paginated, sortable table of registry contacts with columns: display name, type, primary email, primary phone, **property count** (number of distinct properties this contact has appeared in across all appointments), active status. They can filter by type, active status and search by name/email/phone (Phase 1) and by linked property code/address (Phase 2 — see GAP-002).

**Independent Test**: Seed 5 contacts with varying property linkage (0, 1, 3 properties). `GET /v1/contacts` returns each contact with the correct `propertyCount` aggregation in a single query (no N+1).

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they open `/contacts`, **Then** the registry table renders with columns including a "Properties" count chip per row.
2. **Given** a CL_USER, **When** they open `/contacts`, **Then** they see the table read-only — no "New Contact" button, no row actions for edit/deactivate.
3. **Given** an AM or OP (cross-tenant operational team per Constitution v1.3.0), **When** they open `/contacts`, **Then** an Agency selector is shown and contacts only load after a tenant is selected. **Given** a CL_ADMIN or CL_USER (tenant-pinned), **When** they open `/contacts`, **Then** no Agency selector is shown and contacts for their JWT tenant load immediately.
4. **Given** the search input, **When** the operator types a partial name/email/phone, **Then** the list filters via the existing `?search=` parameter.

---

### User Story 2 — Operator opens a contact's detail and sees its property/appointment relationships

- **Priority**: P1
- **Status**: NEW
- **Source**: user-request

Clicking a row opens a quick-view drawer with: display name, type, company, primary email, primary phone, additional channels, notes, active status. A "Open full detail" button navigates to the full detail page. The full page has tabs:

1. **Overview** — same fields as the drawer plus created/updated timestamps
2. **Properties** — the distinct properties this contact has been linked to via appointments. For each property: property code/address, **whether this contact is "primary" in any active appointment for that property**, count of appointments at that property
3. **Appointments** — flat list of all appointments linking this contact (existing `?includeAppointments=true`); each row shows appointment number, status, scheduled date, role, **isPrimary**, property code/address
4. **Timeline** — audit history of contact-level changes (filtered by `entityType=contact&entityId=:id`); shown only to AM/OP/CL_ADMIN

**Acceptance Scenarios**:

1. **Given** a contact with appointments at 3 distinct properties, **When** the operator opens the Properties tab, **Then** 3 rows are shown, each with the count of appointments and the primary flag aggregated correctly.
2. **Given** a CL_USER, **When** they open the detail page, **Then** the Timeline tab is hidden (no audit access for CL_USER).
3. **Given** any actor, **When** they click a property row in the Properties tab, **Then** the app navigates to `/properties/:id`.
4. **Given** any actor, **When** they click an appointment in the Appointments tab, **Then** the app navigates to `/appointments/:id`.

---

### User Story 3 — Operator creates, edits and deactivates a contact via drawer

- **Priority**: P1
- **Status**: NEW
- **Source**: user-request

AM/OP/CL_ADMIN can:
- **Create**: click "New Contact" → ContactFormDrawer opens with empty fields → fills type, name, optional company, primaryEmail, primaryPhone, additionalChannels, notes → save → POST `/v1/contacts`
- **Edit**: row action "Edit" or drawer-action "Edit" → ContactFormDrawer opens prefilled → save → PATCH `/v1/contacts/:id`
- **Deactivate**: row action "Deactivate" or drawer-action "Deactivate" → ConfirmDialog → POST `/v1/contacts/:id/deactivate`
- **Reactivate**: when viewing an inactive contact → "Reactivate" action → PATCH `/v1/contacts/:id` with `{isActive: true}`

The form drawer surfaces a non-blocking note before save: "Editing this contact updates the registry only. Existing appointments keep the snapshot taken at link time." (FR-034 of 021.)

**Acceptance Scenarios**:

1. **Given** AM/OP/CL_ADMIN, **When** they submit a valid create payload, **Then** the contact is created and appears in the list (refetched).
2. **Given** AM/OP/CL_ADMIN, **When** they submit an update with an email already used by another active contact in the tenant, **Then** the API returns `CONTACT_EMAIL_ALREADY_EXISTS` and the form shows the error.
3. **Given** AM/OP/CL_ADMIN, **When** they confirm deactivation, **Then** the contact is updated to `isActive=false` and the list refetches.
4. **Given** CL_USER, **When** they view the page, **Then** create/edit/deactivate actions are not visible (UI-side enforcement; backend already returns 403).

---

### User Story 4 — Operator inspects audit timeline of a contact

- **Priority**: P2
- **Status**: NEW
- **Source**: user-request

AM/OP/CL_ADMIN open the Timeline tab on a contact's detail page. They see a vertical, time-ordered list of audit events sourced from `/v1/audit-logs?entityType=contact&entityId=:id`. Each entry shows timestamp, actor name, action label (Created / Updated / Deactivated / Reactivated), and a diff-friendly before/after snapshot. PII fields in the snapshot follow the role-based masking already implemented by feature 020.

**Acceptance Scenarios**:

1. **Given** a contact with 3 lifecycle events, **When** an AM opens the Timeline tab, **Then** the 3 entries are listed newest-first with raw snapshots.
2. **Given** the same contact, **When** an OP opens the Timeline tab, **Then** the 3 entries are listed with masked email/phone (per 020 FR-025).
3. **Given** a CL_USER, **When** they navigate to the detail page URL, **Then** the Timeline tab is not rendered.

---

### Edge Cases

- **Contact with zero appointments**: `propertyCount = 0`. Properties tab shows an empty state ("This contact has no linked properties yet."). Appointments tab shows empty state.
- **Pagination on Properties tab**: cap at 20 per page initially. If a contact aggregates >20 distinct properties, paginate via the same `?page&pageSize` pattern.
- **Inactive contact in detail**: shows an "Inactive" badge prominently. Edit is allowed (registry edit, including reactivation). Deactivate action is replaced by Reactivate.
- **AM or OP without tenant selection on `/contacts`**: page shows a `FilterRequiredState` matching Properties' pattern. CL_ADMIN and CL_USER never see this state — their tenant is always resolved from the JWT.
- **Snapshot-vs-registry caveat surface**: the form drawer renders a small inline note explaining that registry edits do NOT update existing appointment snapshots. This avoids the "I edited the email but the inspector still got the old one" support ticket.
- **Reactivation and uniqueness**: reactivating a contact whose primary_email or primary_phone is now in use by another active contact returns `CONTACT_EMAIL_ALREADY_EXISTS` / `CONTACT_PHONE_ALREADY_EXISTS`. The UI surfaces the error and offers to clear the conflicting field before retrying.
- **Sidebar IA change**: the legacy `/tenant-contacts` route is renamed in the sidebar to "Tenant Confirmations" (label only — URL kept for backwards compat). The new `/contacts` registry sits above it. Old bookmarks still work.

## Requirements

### Functional Requirements

#### Frontend — Listing & Search

- **FR-101**: System MUST expose a new web route `/contacts` rendering a registry list page available to AM/OP/CL_ADMIN/CL_USER.
- **FR-102**: List MUST display columns: name, type chip, primary email, primary phone, property count chip, active badge, row actions.
- **FR-103**: List MUST integrate `?search=` (name/email/phone), `?type=` and `?isActive=` filters from the existing `GET /v1/contacts` contract.
- **FR-104**: List MUST sort and paginate via the existing API contract (`page`, `pageSize`, `sortBy`, `sortOrder`).
- **FR-105**: For **AM and OP (the cross-tenant operational team per Constitution v1.3.0)**, the page MUST render an Agency selector and load contacts only after a tenant is selected — same affordance for both roles, mirroring `PropertyListPage`. CL_ADMIN/CL_USER are pinned to the JWT tenant and load immediately without a selector. The previously planned FR-105a (OP tenant-scope hardening on `/v1/contacts*` routes) has been **REMOVED** — see Constitution v1.3.0 amendment log; the correction track at `.specify/memory/correction-op-tenant-scope.md` is CLOSED-REJECTED.

#### Frontend — Detail (Drawer + Page)

- **FR-110**: A `ContactDetailDrawer` MUST open from row click in the list with key fields and an "Open full detail" button navigating to `/contacts/:id`.
- **FR-111**: A new full detail page route `/contacts/:id` MUST render tabs: Overview, Properties, Appointments, Timeline.
- **FR-112**: Properties tab MUST aggregate distinct properties (derived from appointments) and surface (a) property code/address, (b) total appointments at that property for this contact, (c) `isPrimaryInActiveAppointment` flag (true if the contact has `is_primary=true` in at least one appointment with status NOT IN `CANCELLED|REJECTED` at that property).
- **FR-113**: Appointments tab MUST list all appointments linking this contact, with appointment number, status chip, date, role, isPrimary, property code/address — links to `/appointments/:id`.
- **FR-114**: Timeline tab MUST query `GET /v1/audit-logs?entityType=contact&entityId=:id` and render a chronological list with actor, action, timestamp, before/after diff.
- **FR-115**: Timeline tab MUST be hidden for CL_USER and INSP. Visibility is gated by the `audit.view` permission key from the role matrix.
- **FR-115a**: The role matrix entry `audit.view` MUST be widened to `['AM', 'OP', 'CL_ADMIN']` to match the actual backend behavior in `ListAuditLogsUseCase` (which already permits CL_ADMIN). This corrects an existing FE/BE drift. No new permission key (`contact.read_audit`) is introduced — Timeline visibility reuses `audit.view`.

#### Frontend — Create / Edit / Deactivate

- **FR-120**: A `ContactFormDrawer` MUST support both create (empty) and edit (prefilled) modes for AM/OP/CL_ADMIN.
- **FR-121**: Form fields: `type` (select), `displayName`, `company`, `primaryEmail`, `primaryPhone`, `additionalChannels` (dynamic list with channel/value/label), `notes`.
- **FR-122**: Form MUST validate against `contactRegistrySchema` from `@properfy/shared` and surface API errors `CONTACT_EMAIL_ALREADY_EXISTS`, `CONTACT_PHONE_ALREADY_EXISTS`, `CONTACT_CHANNEL_DUPLICATED`, `CONTACT_NO_CHANNEL` with field-targeted messages.
- **FR-123**: Form MUST display an inline note in edit mode: "Editing this contact updates the registry only. Existing appointments keep the snapshot taken at link time."
- **FR-124**: Deactivate action MUST call `POST /v1/contacts/:id/deactivate` after a `ConfirmDialog`.
- **FR-125**: Reactivate (only when viewing an inactive contact) MUST call `PATCH /v1/contacts/:id` with `{ isActive: true }`.
- **FR-126**: All mutating actions MUST be hidden in the UI for CL_USER and INSP/TNT.

#### Backend extensions

- **FR-130**: System MUST extend `GET /v1/contacts` to include `propertyCount: number` per item in the response, computed as `count(DISTINCT a.property_id)` joined via `appointment_contacts ac → appointments a` for the contact, using a single batch aggregation query (no N+1). p95 < 300 ms with 500 contacts per tenant.
- **FR-131**: System MUST extend `GET /v1/contacts/:id?includeAppointments=true` to: (a) include `isPrimary: boolean`, `propertyId: string`, and `propertyCode: string` in each item; (b) accept full pagination (`appointmentsPage`, `appointmentsPageSize`, `appointmentsSortOrder`, default `appointmentsPage=1`, `appointmentsPageSize=20`, max 100); (c) return `appointments` as `{ data: [...], pagination: { page, pageSize, total } }`. The current hardcoded `page=1, pageSize=20` in `GetContactUseCase` MUST be replaced with parameter-driven pagination.
- **FR-132**: System MUST extend `GET /v1/contacts/:id?includeProperties=true` (new optional parameter) to return a paginated, distinct-by-property aggregation: `{ data: ContactPropertyAggregate[], pagination: { page, pageSize, total } }`. Pagination params: `propertiesPage`, `propertiesPageSize` (default `propertiesPage=1`, `propertiesPageSize=20`, max 100). No separate route — kept on the same endpoint to mirror `?includeAppointments=true`.
- **FR-133**: All extensions MUST preserve current authorization rules and tenant scoping. AM and OP both pass `tenantId` in body/query (cross-tenant); CL_ADMIN/CL_USER use JWT `tenantId` (pinned). No new endpoints introduced.
- **FR-134**: All `/v1/contacts*` routes MUST register Fastify `schema: { querystring, body, params, response }` using shared Zod schemas. After implementation, the OpenAPI doc MUST be regenerated via `pnpm generate:api` so `packages/shared/src/api-types.ts` reflects the new types — currently `/v1/contacts` shows empty parameter and response definitions, breaking the contract-first principle (Constitution IV).

#### Sidebar / IA

- **FR-140**: The current "Contacts" sidebar item (pointing to `/tenant-contacts`) MUST be renamed to "Tenant Confirmations" (label only). The route URL stays `/tenant-contacts` for backwards compatibility.
- **FR-141**: A new "Contacts" sidebar item MUST be added above (or near) "Properties", pointing to `/contacts`, visible to AM/OP/CL_ADMIN/CL_USER.

### Non-Functional Requirements

- **NFR-101**: Contact list with `propertyCount` aggregation p95 < 300 ms for tenants with up to 500 contacts and 5,000 appointments. **Verification gate**: query plan review (EXPLAIN ANALYZE) committed in the PR description AND a synthetic load test against the integration container with the seed (500 contacts × 10 appointments avg). Without both, NFR-101 is not signed off.
- **NFR-102**: Contact detail with `?includeAppointments=true&includeProperties=true` (page 1, pageSize 20 each) p95 < 400 ms for contacts with up to 200 appointments and 50 distinct properties. Same verification gate as NFR-101 (EXPLAIN ANALYZE on the two aggregations + integration test timing).
- **NFR-103**: Timeline tab MUST not fetch on detail-page load. The query is fired only when the tab is **activated** by the user (lazy fetch via `enabled` flag on the `useQuery`). Once fetched, results are kept fresh per the standard React Query stale time. Verified by component test asserting that `/v1/audit-logs` is not requested until the Timeline tab `<Tab>` becomes active.
- **NFR-104**: Properties and Appointments tabs in the detail page also use lazy fetch — no requests until the tab is activated. Same component-test gate.
- **NFR-105**: All new web pages MUST mirror the visual/UX pattern of `apps/web/src/features/properties/` for consistency, with the explicit divergence noted in FR-105 regarding OP scope.

### Key Entities

No new database entities. Reuses:

- **`contacts`** (021): the registry — see `specs/021-contacts/data-model.md`.
- **`appointment_contacts`** (006/021 revised): junction with `is_primary`, `contact_id`, snapshot fields.
- **`appointments`** (006): for `property_id` and `status`.
- **`audit_logs`** (011/020): for the timeline.

## Success Criteria

- **SC-101**: A logged-in CL_ADMIN can browse `/contacts`, search by partial name, open a contact, see its properties tab with the primary flag rendered correctly, and see the Timeline.
- **SC-102**: A logged-in CL_USER can browse `/contacts` read-only, open a detail, but does NOT see Edit/Deactivate/Timeline.
- **SC-103**: An AM can switch between two tenants in the Agency selector and see different contact lists without page refresh, mirroring `PropertyListPage`.
- **SC-104**: Creating a contact and immediately re-using it inline in an appointment (existing flow `ContactAutocomplete`) returns the same `id` — registry consistency end-to-end.
- **SC-105**: Editing a contact's email does NOT change `snapshot_email` for any existing appointment (verified in tests; UI shows the note).
- **SC-106**: Deactivating a contact removes it from the default `/contacts` list and from all autocompletes.

## Assumptions

- **Drawer + page pattern**: mirroring `Properties` is the right pattern. Operators expect quick view in drawer, deep view in page. Confirmed by user note ("drawer ou página de detalhe").
- **Sidebar IA change is acceptable**: renaming the legacy entry from "Contacts" to "Tenant Confirmations" is an intentional UX clarification, not a breaking change. The URL stays the same.
- **Property aggregation is single-query**: a single SQL aggregation joining `contacts → appointment_contacts → appointments` with `count(DISTINCT property_id)` over windowed contact ids is feasible and acceptable from a perf standpoint.
- **Timeline reuses `/v1/audit-logs`**: no new endpoint needed. The existing endpoint already accepts `entityType` and `entityId` filters and applies role-based masking (FR-025 of 020).
- **No standalone `LinkContactToAppointment` endpoint exists**: linking is always done via appointment create/update use cases. The Properties/Appointments tabs are read-only in this feature; relinking is out of scope.
- **No bulk actions in this round**: bulk deactivate, bulk merge, bulk import are all explicit GAPs of 021. Out of scope.

## Known Gaps

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Audit log for contact↔appointment link/unlink | M | Currently the contact's Timeline only shows registry-level changes. Linking a contact to a new appointment is captured by `appointment.created/updated` audit, not by a contact-level event. Adding a denormalized `contact.linked_to_appointment` event would let the Timeline tell the full story. Out of scope for this round. |
| GAP-002 | Search by linked property | L | Backend trigram search currently covers name/email/phone. Searching by property code/address requires a JOIN. Phase 2 — open a follow-up if operators ask for it. |
| GAP-003 | Bulk contact actions (deactivate, export) | L | 021 already flags GAP-001. Out of scope. |
| GAP-004 | Contact merge | L | 021 GAP-002. Out of scope. |
| GAP-005 | AM/OP cross-tenant search UX | M | AM and OP must pick a tenant before listing per FR-105 (Constitution v1.3.0). CL_ADMIN/CL_USER are tenant-pinned and never need a selector. A future "global search across all tenants" affordance for AM/OP is out of scope here. |

## Cross-References

- **021-contacts**: backend domain, schemas, audit. This spec depends on 021 being already merged.
- **020-audit-retention-pii-redaction**: timeline rendering inherits the role-based masking (CL_ADMIN sees `[MASKED]`, OP sees partial mask, AM sees raw).
- **006-appointments**: Properties tab derives data from `appointment_contacts.is_primary` + `appointments.property_id` + `appointments.status`.
- **Constitution v1.3.0 (2026-05-09)**: AM and OP are the cross-tenant operational team; both can pass `tenantId` in `/v1/contacts*` requests. The differentiation between AM and OP is **catalog management capability** (AM-only — out of scope for 022). The prior v1.2.0 OP tenant-scope correction is CLOSED-REJECTED; specs/code that previously cited DEC-003 or `correction-op-tenant-scope.md` should drop the reference.
