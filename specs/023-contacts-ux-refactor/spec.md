# Feature Specification: Contacts UX Refactor (023)

**Feature Branch**: `022-contacts-screen-enhancement` (stacked on 022 — same branch / same PR; do NOT open a new PR)
**Created**: 2026-05-09
**Feature Status**: NEW — UX refactor stacked on 022 after smoke testing surfaced structural issues
**Predecessor**: `specs/022-contacts-screen-enhancement/` (REV 4 — Constitution v1.3.0; AM/OP cross-tenant; BUG-001 regression guards)
**Source-of-truth design**: `docs/superpowers/specs/2026-05-09-023-contacts-ux-refactor-design.md` (commit `bf1f59e`)
**Constitution**: v1.3.0

> **Stacking note.** 022 is merged-ready (CRUD + Constitution v1.3.0 rollback + BUG-001 regression guards). The user wants 022 + 023 to ship together in a single PR. New commits are stacked on the existing branch; the PR body / reference label are updated when 023 lands. The 022 spec/plan/tasks dir stays untouched as the historical record of the cycle 1/2 → cycle 2/2 sequence.

## Problem (from user smoke of 022)

1. Two screens both named "Contact*" in the sidebar (`/contacts` registry vs `/tenant-contacts` confirmation board) confuse operators.
2. The `/contacts` listing lacks a branch filter — even though contacts operate across branches via property linkage.
3. The detail page hides the parent-child relationship between contact → property → appointment behind separate Properties + Appointments tabs.
4. Inline contact creation in `AppointmentFormDrawer` is not field-equivalent to dedicated creation in `ContactFormDrawer` — `type`, `company`, `additionalChannels`, `notes` missing; "Name" label diverges from "Display name".
5. Tenant portal/confirmation links are dispatched to all linked contacts; user requires dispatch to ONLY the primary contact.

## Goals

- Single contact registry surface (`/contacts`); branch as a filter, not a scope.
- Hierarchical detail view that surfaces property → appointment relationship directly.
- Inline contact creation field-equivalent to dedicated form (no data loss).
- Primary-only enforcement for portal/confirmation flows (backend + UI validation).
- Confirmation workflow migrated from the legacy page to `/appointments` (column + filter + bulk re-send).

## Non-Goals

- Schema migration. The Contact model remains tenant-scoped (no `branch_id` column added).
- Per-property primary entity. "Primary in N properties" is derived from `appointment_contacts.is_primary` aggregations.
- Search by property name (GAP-002 from 022 — still deferred).
- New audit event `contact.linked_to_appointment` (GAP-001 from 022 — still deferred).

## User Scenarios & Testing

### User Story 1 — Operator filters contacts by branch and sees primary metric

- **Priority**: P1
- **Status**: NEW
- **Source**: user-feedback-2026-05-09

An operator (AM/OP/CL_ADMIN/CL_USER) opens `/contacts`. The filter bar above the table includes search, branch multiselect, type multiselect, status (Active/Inactive), and primary (Y/N). The table shows columns: Name, Type, Email/Phone, Properties (count), Primary in N (count), Actions.

**Independent Test**: Seed a tenant with 5 contacts where 2 have appointments at branch A and 1 has appointments at branch B. Filtering by branch A returns the 2 contacts; filtering by branch A + branch B returns all 3. The "Primary in N" column shows the number of distinct properties where the contact is primary on at least one non-cancelled appointment.

**Acceptance Scenarios**:

1. **Given** an authorized actor on `/contacts`, **When** they apply a branch multiselect filter, **Then** only contacts who have at least one appointment at a property in any of the selected branches are returned (EXISTS-style derivation).
2. **Given** an authorized actor, **When** they apply the "Primary = Y" filter, **Then** only contacts with `primaryInPropertyCount > 0` appear.
3. **Given** an authorized actor, **When** they view the table, **Then** "Last activity" is NOT a column.
4. **Given** an authorized actor, **When** they click "Open detail" on a row, **Then** `/contacts/:id` opens **in a new tab** (per `feedback_new_tab_detail.md`).

### User Story 2 — Operator inspects contact relations hierarchically

- **Priority**: P1
- **Status**: NEW
- **Source**: user-feedback-2026-05-09

The detail page `/contacts/:id` has two tabs: **Relations** and **Timeline**. The Relations tab replaces the prior Properties + Appointments tabs.

**Relations tab** renders properties as expandable rows; each row expands to show the appointments at that property:

```
v 10 Pine St (Sydney) [PRIMARY]    3 appts | 1 PENDING confirm
    2026-05-15  Routine    SCHEDULED  CONFIRMED
    2026-05-22  Outgoing   SCHEDULED  PENDING
    2026-04-01  Routine    DONE       n/a
> 22 Oak Ave (Sydney)               2 appts
> 5 Maple Rd (Melbourne) [PRIMARY]  4 appts | 2 PENDING
```

- The `[PRIMARY]` badge on a property row means the contact is primary on at least one non-cancelled appointment of that property.
- Confirmation status uses the existing `<TenantConfirmationChip>` component.
- Lazy fetch is preserved (NFR-103/104 from 022): no API call until the tab is activated.

**Acceptance Scenarios**:

1. **Given** a contact with appointments at 3 distinct properties, **When** the operator opens the Relations tab, **Then** 3 expandable rows are rendered with summary counts and `[PRIMARY]` badges where applicable.
2. **Given** a property row, **When** the operator expands it, **Then** the appointments at that property are listed with date, type, status, and confirmation chip.
3. **Given** the operator did not click Relations, **When** the page loads, **Then** no `?includeProperties=true&includeAppointments=true` request is made.
4. **Given** the operator's expand/collapse state, **When** they re-render the page (tab switch / focus restore), **Then** the open/closed state per property persists via sessionStorage keyed by `contactId`.

### User Story 3 — Operator manages confirmations from `/appointments`

- **Priority**: P1
- **Status**: NEW
- **Source**: user-feedback-2026-05-09

The legacy `/tenant-contacts` page is deleted. The confirmation workflow lives on `/appointments`:
- A `Confirmation` column shows the **primary contact's** confirmation status (PENDING / CONFIRMED / RESCHEDULED / FAILED / N/A) using `<TenantConfirmationChip>`.
- The confirmation filter (currently in `AppointmentMapFilterPanel`) is promoted to the list filter panel.
- A row-selection checkbox column enables a bulk action "Re-send reminder" (top of table). Clicking it dispatches the portal-token job for each selected appointment, sending only to the primary contact, with idempotency per `(appointment_id, day)`.

**Acceptance Scenarios**:

1. **Given** the sidebar, **When** an operator views it, **Then** "Tenant Confirmations" is NOT present; only "Contacts" is shown.
2. **Given** `/appointments` listing, **When** the operator scrolls the columns, **Then** a `Confirmation` chip column is visible reflecting the primary contact's status.
3. **Given** the operator selects 3 appointments and clicks "Re-send reminder", **When** the bulk action is dispatched, **Then** each appointment's primary contact receives a portal link via email/SMS as configured; non-primary contacts do NOT receive the link.
4. **Given** the operator clicks "Re-send reminder" twice on the same appointment within the same day, **When** the second click is dispatched, **Then** idempotency guards return the previous result without sending again.

### User Story 4 — Operator creates a contact inline during appointment creation, with no field loss

- **Priority**: P1
- **Status**: NEW
- **Source**: user-feedback-2026-05-09

When an operator creates an appointment in `AppointmentFormDrawer` and chooses "Add new contact" (inline path), the form collects the same fields as the dedicated `ContactFormDrawer`: `type`, `displayName`, `company`, `primaryEmail`, `primaryPhone`, `additionalChannels`, `notes`. Both forms display the hint "Provide at least one of email or phone." Both labels read "Display name" (not "Name").

**Acceptance Scenarios**:

1. **Given** the inline contact section in `AppointmentFormDrawer`, **When** the operator opens it, **Then** the fields `type` (required SelectInput) and `Display name` (required) are visible; `company`, `additionalChannels`, `notes` are visible (additionalChannels and notes may be collapsed by default with an "Add channel" / "Add notes" affordance).
2. **Given** an operator submitting the inline form without `type`, **When** the form validates, **Then** an inline error is shown and submit is blocked.
3. **Given** an operator submitting the inline form with neither `primaryEmail` nor `primaryPhone`, **When** the form validates, **Then** the hint becomes the error and submit is blocked.
4. **Given** an operator who differs `type` (registry classification) from `role` (per-appointment role), **When** they submit, **Then** both fields are persisted independently — `type` lands on the new `contacts` row, `role` lands on the `appointment_contacts` junction.
5. **Given** the operator did not designate any contact as primary, **When** the form validates, **Then** an error is shown ("Exactly one contact must be primary") and submit is blocked.
6. **Given** the operator toggles primary on a contact, **When** the toggle fires, **Then** any other primary toggle is auto-untoggled (radio-style behaviour).

### Edge Cases

- **Contact with zero appointments**: `propertyCount = 0`, `primaryInPropertyCount = 0`; Relations tab shows an empty state.
- **Contact primary on a CANCELLED/REJECTED appointment only**: NOT counted in `primaryInPropertyCount`; the property row does NOT show the `[PRIMARY]` badge.
- **Bulk re-send with mixed-eligibility selection** (e.g. some appointments lack a primary contact): the dispatch loop returns per-appointment results — successes for those with a primary, an explicit `NO_PRIMARY_CONTACT` error for those without. The bulk endpoint never returns 500 for the whole batch.
- **Branch filter with multiple selected branches**: behaves as OR (the contact appears if at least one of their appointments touches any selected branch).
- **CL_USER**: same read access as 022; no bulk re-send button visible (gated to AM/OP per FR-303a).

## Requirements

### Functional Requirements

#### `/contacts` listing refactor

- **FR-201**: System MUST render filters in a horizontal bar above the table: `search`, `branchIds` (multiselect), `type` (multiselect), `isActive`, `primary` (Y/N).
- **FR-202**: System MUST add a "Primary in N" column showing `primaryInPropertyCount`.
- **FR-203**: System MUST remove any "last activity" column.
- **FR-204**: Row click MUST open the detail drawer; "Open detail" affordance MUST navigate to `/contacts/:id` in a new tab (`target=_blank`).

#### `/contacts/:id` detail refactor

- **FR-210**: The detail page MUST present two tabs: `Relations` and `Timeline`. The prior `Properties` and `Appointments` tabs are merged into `Relations`.
- **FR-211**: The Relations tab MUST render properties as expandable rows; each row shows property code/address, total appointments at that property for this contact, a count of pending confirmations, and a `[PRIMARY]` badge if the contact is primary on at least one non-cancelled appointment.
- **FR-212**: Expanding a property row MUST list its appointments inline with date, type, status, confirmation chip.
- **FR-213**: Lazy fetch MUST be preserved — no API call until the Relations tab is activated.
- **FR-214**: Expand/collapse state MUST persist across re-renders via sessionStorage keyed by `contactId`.

#### Backend list aggregation

- **FR-220**: System MUST extend `GET /v1/contacts` `listQuerySchema` with `branchIds: string[]` and `primary: boolean`.
- **FR-221**: System MUST extend the contact list aggregation to compute `primaryInPropertyCount` per contact: `COUNT(DISTINCT a.property_id) FILTER (WHERE ac.is_primary = true AND a.status NOT IN ('CANCELLED','REJECTED'))`.
- **FR-222**: System MUST apply `branchIds` as an EXISTS subquery: `EXISTS (SELECT 1 FROM appointment_contacts ac JOIN appointments a ON a.id = ac.appointment_id JOIN properties p ON p.id = a.property_id WHERE ac.contact_id = c.id AND p.branch_id = ANY($branchIds::text[]))`. All casts use `::text` per BUG-001 regression guards.
- **FR-223**: System MUST extend `contactListItemSchema` in `packages/shared/src/schemas/contact.ts` with `primaryInPropertyCount: z.number().int().nonnegative()`. Regenerate `api-types.ts` via `pnpm generate:api`.

#### Legacy `/tenant-contacts` removal

- **FR-230**: System MUST remove the route `/tenant-contacts` from `apps/web/src/app/router.tsx`.
- **FR-231**: System MUST remove the sidebar item "Tenant Confirmations" from `apps/web/src/components/shell/Sidebar.tsx`.
- **FR-232**: System MUST delete the legacy folder `apps/web/src/features/tenants/` (all components, hooks, pages, types, tests). Pre-delete grep MUST confirm no cross-folder imports reference the deleted symbols. (Verified during planning: only `apps/web/src/app/router.tsx` references `TenantContactList*` outside the folder.)

#### `/appointments` enhancements

- **FR-240**: `AppointmentTable` MUST add a `Confirmation` column rendering the primary contact's confirmation status via `<TenantConfirmationChip>`.
- **FR-241**: The `confirmationStatus` filter MUST be promoted from `AppointmentMapFilterPanel` into the `AppointmentListPage` filter panel. The map page may keep its own copy referencing the same shared filter component.
- **FR-242**: `AppointmentTable` MUST add a row-selection checkbox column; a "Re-send reminder" button at the top of the table dispatches the bulk action when ≥1 row is selected.
- **FR-243**: System MUST expose `POST /v1/appointments/bulk-resend-reminder` accepting `{ appointmentIds: string[] }`. Response: `{ results: Array<{ appointmentId, status: 'SENT' | 'NO_PRIMARY_CONTACT' | 'IDEMPOTENT_REPLAY' | 'ERROR', error?: { code, message } }> }`. Auth: AM/OP only.
- **FR-244**: For each appointment in the bulk request, the dispatch MUST send the portal link only to the primary contact (`appointment_contacts.is_primary = true`). Idempotency-Key is auto-derived per `(appointment_id, scheduled_date_in_actor_timezone)` using the existing `IIdempotencyService` interface.

> **OBS-023-001 (cycle 1 QA observation, 2026-05-09)** — idempotency-day replays return `IDEMPOTENT_REPLAY` regardless of the original outcome (`SENT`, `NO_PRIMARY_CONTACT`, or `ERROR`). Operators see the original status only on the first attempt of each day; subsequent same-day calls for the same appointment surface the cached `IDEMPOTENT_REPLAY` marker even when the original call skipped because of a missing primary contact. This is intentional for cycle 1 (cheaper than mutating the cache shape) and should be revisited only if operators report it as confusing in the field. A future enhancement could store and replay the original status alongside the replay marker.

#### Primary-only enforcement

- **FR-250**: `GeneratePortalTokenUseCase` (`apps/backend/src/modules/tenant-portal/application/use-cases/generate-portal-token.use-case.ts`) MUST verify that the contact selected for dispatch (`result.contact`) carries `isPrimary === true`. If the appointment has zero primary contacts, the dispatch is skipped and the result records `NO_PRIMARY_CONTACT`. (Today the picker sorts primary first but does not assert primary-existence — see `prisma-appointment.repository.ts:140-143`.)
- **FR-251**: `AppointmentFormDrawer` MUST validate `contacts` array per `appointmentContactsArraySchema` (already in `packages/shared/src/schemas/contact.ts:97-106`): exactly one contact has `isPrimary === true`. Frontend MUST mirror this and block submit with an inline error before calling the API.
- **FR-252**: The default behaviour preserved: first contact added is auto-marked primary. Toggling primary on another contact MUST untoggle the others (radio-style).
- **FR-253**: All dispatches (single via `POST /v1/appointments/:appointmentId/portal-token` AND bulk via `POST /v1/appointments/bulk-resend-reminder`) MUST emit an audit event `notification.dispatched` (or extend the existing one) with metadata `recipient.contact_id` and `recipient.is_primary`.

#### Inline contact form alignment

- **FR-260**: `AppointmentFormDrawer`'s inline contact section MUST add fields: `type` (required SelectInput, options from existing `CONTACT_TYPE_OPTIONS`), `company` (optional TextInput), `additionalChannels` (optional repeater, collapsed by default), `notes` (optional Textarea, collapsed by default).
- **FR-261**: Both `AppointmentFormDrawer` and `ContactFormDrawer` MUST rename "Name" → "Display name".
- **FR-262**: Both forms MUST display "Provide at least one of email or phone." below the primary channels section.
- **FR-263**: When inline create is submitted, the resulting payload MUST be field-equivalent to `contactRegistrySchema` (`packages/shared/src/schemas/contact.ts:17-52`). Backend already validates via `inlineLink` in `appointmentContactLinkSchema`.
- **FR-264**: The two enums `ContactType` ("Contact type" — registry classification) and `AppointmentContactRole` ("Role in this appointment") MUST both be visible in the inline form with distinct labels; both MUST be required when creating an inline contact.

### Non-Functional Requirements

- **NFR-201**: Contact list with `primaryInPropertyCount` aggregation + `branchIds` EXISTS filter p95 < 350 ms for tenants with up to 500 contacts × 5,000 appointments. Verification gate: EXPLAIN ANALYZE pinned to PR description (continues 022 NFR-101 practice).
- **NFR-202**: Relations tab data load (`?includeProperties=true&includeAppointments=true`) p95 < 500 ms for contacts with up to 200 appointments and 50 distinct properties.
- **NFR-203**: Bulk re-send endpoint MUST return within 5 s for batches up to 50 appointments. The dispatch is fire-and-forget per appointment; the response only blocks on idempotency lookups + primary picks.
- **NFR-204**: Lazy-fetch contract carried over from 022: Relations tab (and Timeline tab) issue no API call until activated. New component test asserts this.

### Key Entities

No new database entities. New aggregation `primaryInPropertyCount` is derived from `appointment_contacts` + `appointments`. Branch filter is derived via `properties.branch_id`.

## Success Criteria

- **SC-201**: Sidebar shows only `Contacts` (no `Tenant Confirmations`); `/tenant-contacts` route returns 404; legacy folder absent from disk.
- **SC-202**: `/contacts` listing renders the new filter bar (branch multiselect + primary Y/N); a CL_ADMIN can filter contacts by branch and see counts update.
- **SC-203**: `/contacts/:id` Relations tab renders expandable property rows with `[PRIMARY]` badges; expanding a row shows appointments inline. Tab activation triggers a single combined fetch with both `?includeProperties=true&includeAppointments=true`.
- **SC-204**: Inline contact creation in `AppointmentFormDrawer` lands a `contacts` row with all dedicated-form fields populated.
- **SC-205**: An OP user clicks "Re-send reminder" on 3 selected appointments; only the primary contact of each receives the portal link via email/SMS; clicking twice within the day returns the cached idempotent replay.
- **SC-206**: 022 scenarios still PASS in QA (regression). 022 BUG-001 source-scan + Testcontainers `pg_typeof` guards still green.
- **SC-207**: PR reference label updated to `refactor.contacts_ux.unify_and_align`. PR description includes the EXPLAIN ANALYZE artifact for `branchIds` and `primaryInPropertyCount` aggregations.

## Assumptions

- Inline form expansion accepts the UX cost of a longer drawer; mitigated by collapsing `additionalChannels` and `notes` by default.
- Branch filter performance assumption: index `appointment_contacts(contact_id)` (existing) + `properties(branch_id)` (verified — schema has `@@index([branch_id])` at line 261/346/390) cover the EXISTS subquery without further indexing.
- The bulk re-send endpoint reuses `GeneratePortalTokenUseCase` per appointment in a `for-of` loop. Concurrency is bounded server-side; rate limiting at the notification module catches downstream issues.
- "Sessionstorage-keyed expand state" (FR-214) uses `sessionStorage` (per-tab persistence; clears on tab close) — not `localStorage`.
- Idempotency window for bulk re-send: 1 calendar day in the actor's timezone (not 24 hours rolling). Aligns with the user-facing "send the reminder again today" mental model.

## Known Gaps (carried from 022)

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Audit log for contact↔appointment link/unlink | M | Still deferred. Relations tab Timeline will not surface link events; documented in 022 spec. |
| GAP-002 | Search by linked property name/code | L | Still deferred. The 023 search continues to cover name/email/phone only. |
| GAP-003 | Bulk contact actions beyond re-send | L | Bulk deactivate/export not in scope. |

## New Gaps introduced by 023 (acknowledged, deferred)

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-201 | Per-property primary entity | L | "Primary in N" is derived; if business needs a stable primary per property unrelated to appointments, this needs a new model. Not in scope. |
| GAP-202 | Contact role filter on bulk re-send | L | The user opted to send to primary regardless of role. A future affordance could let operators filter "TENANT-role primaries only". |
| GAP-203 | Cross-branch confirmation analytics dashboard | L | The user removed the dedicated `/tenant-contacts` board; if a metrics view is later needed, it goes to a new analytics page, not back to a board. |

## Cross-References

- **022-contacts-screen-enhancement** REV 4: predecessor — Constitution v1.3.0, AM/OP cross-tenant, BUG-001 regression guards (`prisma-contact.repository.bug-001.test.ts` covers the new aggregations too).
- **006-appointments**: `appointment_contacts.is_primary`, `appointmentContactsArraySchema` (exactly-one-primary refine — line 97-106 of `packages/shared/src/schemas/contact.ts`).
- **020-audit-retention-pii-redaction**: Timeline tab inherits role-based PII masking unchanged.
- **Constitution v1.3.0**: AM/OP both cross-tenant; bulk re-send authorized to AM/OP only.
- **Memory `feedback_new_tab_detail.md`**: `/contacts/:id` detail opens in a new tab.

## Reference label for PR

`refactor.contacts_ux.unify_and_align`

(Stacked on the 022 PR. Replaces the 022 second-pass label `constitution.v1_3.op_role_rollback` in the PR title prefix when 023 lands; both labels remain in the commit history.)
