# Design: Contacts UX Refactor (023)

**Date**: 2026-05-09
**Status**: Approved by user; pending Arquiteto plan
**Predecessor**: 022-contacts-screen-enhancement (already shipped backend + initial UI)
**Related Constitution**: v1.3.0 (AM/OP cross-tenant)

## Problem

User feedback after smoke of 022:
1. Two screens both named "Contact*" in sidebar (`/contacts` registry vs `/tenant-contacts` confirmation board) — confusing UX duplication.
2. Listing page lacks branch filter (contacts are tenant-scoped but operate across branches via property linkage).
3. Multi-property/multi-appointment per contact is not visualised — current Properties + Appointments tabs hide the parent-child relationship.
4. Inline contact creation in `AppointmentFormDrawer` is not field-equivalent to dedicated contact creation in `ContactFormDrawer` — fields missing, labels diverge.
5. Tenant portal/confirmation link is sent to all linked contacts; user requires it to go ONLY to the primary contact per appointment.

## Goals

- Single contact registry surface (`/contacts`), with branch as a filter (not a scope).
- Hierarchical detail view that surfaces property → appointment relationship directly.
- Inline contact creation field-equivalent to dedicated form (no data loss).
- Primary-only enforcement for portal/confirmation flows (backend + UI validation).
- Confirmation workflow migrated from dedicated legacy page to `/appointments` (column + bulk actions).

## Non-Goals

- Schema migration. The Contact model remains tenant-scoped (no `branch_id` column added).
- Per-property primary entity. "Primary in N properties" is derived from `appointment_contacts.is_primary` aggregations.
- Search by property name (GAP-002 deferred from 022 — still deferred).
- New audit event `contact.linked_to_appointment` (GAP-001 — still deferred).

## Design

### 1. List page `/contacts` (refactor)

**Layout**: Filters in horizontal bar above table, table full width.

**Search**: name, primary email, primary phone (trigram). Property name search remains GAP-002.

**Filters**:
- Branch (multiselect, derived via `appointment.property.branch_id`)
- Type (multiselect — `ContactType`)
- Status (Active / Inactive)
- Primary (Y / N — has at least one `is_primary=true` link)

**Columns**:
- Name (`displayName`)
- Type (`ContactType` chip)
- Email/Phone (`primaryEmail` || `primaryPhone`)
- Properties (count — derived `COUNT DISTINCT property_id`)
- Primary in N (count of properties where contact is_primary on at least one appointment)
- Actions (Edit, Deactivate, Open detail)

**Removed**: `last activity` column (per user direction).

**Interaction**: row click opens detail drawer; "Open detail" navigates to `/contacts/:id` (new tab — matches feedback memory `feedback_new_tab_detail.md`).

### 2. Detail page `/contacts/:id` (refactor — hierarchical)

**Header**: name, type, primary email/phone, tenant, [Edit] [Deactivate] actions.

**Tabs**: `Relations` + `Timeline` (Properties tab + Appointments tab merged into Relations).

**Relations tab** — properties as expandable rows; each shows linked appointments inline:

```
v 10 Pine St (Sydney) [PRIMARY]    3 appts | 1 PENDING confirm
    2026-05-15  Routine    SCHEDULED  CONFIRMED
    2026-05-22  Outgoing   SCHEDULED  PENDING
    2026-04-01  Routine    DONE       n/a
> 22 Oak Ave (Sydney)               2 appts
> 5 Maple Rd (Melbourne) [PRIMARY]  4 appts | 2 PENDING
```

- `[PRIMARY]` badge on a property means: contact is primary on at least one appointment of that property.
- Confirmation chips reuse existing `<TenantConfirmationChip>` component.
- Lazy fetch preserved (per NFR-103/104 from 022).

**Timeline tab** — audit log unchanged from 022 (role-based mask).

### 3. Delete legacy `/tenant-contacts`

Per user decision: delete entirely. Confirmation workflow migrates to:
- `/contacts/:id` Relations tab — confirmation chips inline per appointment.
- `/appointments` listing — new `Confirmation` column + filter + bulk re-send action.

**Files to remove**:
- Route: `apps/web/src/app/router.tsx` lines 284-289 (path `tenant-contacts`).
- Sidebar: `apps/web/src/components/shell/Sidebar.tsx` line 33.
- Folder: `apps/web/src/features/tenants/` (5 files: `TenantContactListPage.tsx`, `TenantTable.tsx`, `TenantFilters.tsx`, `TenantContactDetailDrawer.tsx`, `useTenantContactList.ts`, types).
- Tests for the above.

**Pre-delete check**: grep for cross-folder imports of `TenantContact*` or `useTenantContactList` to catch consumers outside the folder.

### 4. `/appointments` enhancements (same PR)

**Confirmation column** in `AppointmentTable`:
- Reuses `<TenantConfirmationChip>`.
- Shows status of the **primary contact's** confirmation (PENDING / CONFIRMED / RESCHEDULED / FAILED / N/A).

**Confirmation filter** in list filter panel:
- Promote `confirmationStatus` filter from `AppointmentMapFilterPanel` to the list filter panel.

**Bulk action — Re-send reminder**:
- Row selection (checkbox column).
- "Re-send reminder" button (top of table) dispatches portal-token job for all selected appointments.
- Job sends only to the primary contact of each appointment (enforced backend).
- Idempotency-Key per (appointment_id, day) to avoid double-send.

### 5. Primary-only enforcement (business rule)

**Backend**:
- `SendPortalLinkUseCase` (or equivalent) MUST filter `appointment_contacts.is_primary = true` before dispatch.
- Add unit test: linking N contacts where N=3, only is_primary=true receives the dispatch.
- Audit event `notification.dispatched` records `recipient.contact_id` and `recipient.is_primary`.

**Frontend (AppointmentFormDrawer)**:
- Validation: at least one contact in array has `isPrimary === true`. Backend already enforces (`appointmentContactsArraySchema` line 100-106). Frontend `validate()` MUST mirror this — block submit and show inline error.
- Default behaviour preserved: first contact added is auto-marked primary (line 146).
- UI: when user toggles primary on a contact, auto-untoggle the others (radio-style behaviour).

### 6. Inline contact form alignment (cross-form consistency)

**Add to `AppointmentFormDrawer` inline contact section**:
- `type` (ContactType) — Required SelectInput, options: `CONTACT_TYPE_OPTIONS` (TENANT, OWNER, PROPERTY_MANAGER, AGENT, OTHER). Label: "Contact type".
- `company` — Optional TextInput. Label: "Company".
- `additionalChannels` — Optional repeater (collapsed by default; "Add channel" button reveals). Same UX as `ContactFormDrawer`.
- `notes` — Optional Textarea (collapsed).

**Rename in `AppointmentFormDrawer`**:
- "Name" → "Display name" (match `ContactFormDrawer`).

**Add hint in BOTH forms**:
- Below the primary channels section: "Provide at least one of email or phone."

**Differentiate `type` vs `role`**:
- "Contact type" (registry classification: TENANT, OWNER, PROPERTY_MANAGER, AGENT, OTHER)
- "Role in this appointment" (function in this specific appointment: TENANT, OWNER, PROPERTY_MANAGER, AGENT, etc — `AppointmentContactRole`)
- Both required when creating an inline contact.

**Backend validation**:
- Confirm `inlineLink.inline.type` is properly validated (already required by Zod). Add unit test if not present.

### 7. Aggregations (backend extensions, additive)

For column "Primary in N":
- New aggregation: `COUNT(DISTINCT a.property_id) FILTER (WHERE ac.is_primary = true)` per contact.
- Add to `findContactList` repository method (extend existing `propertyCount` aggregation).
- Update `ContactListItem` schema with `primaryInPropertyCount: number`.
- All `::text` casts (BUG-001 from 022 cycle 1/2) carried over — regression guards from 022 (`prisma-contact.repository.bug-001.test.ts`) cover the new aggregation too.

For Relations tab:
- Reuse `findPropertiesByContactId` (returns properties + per-property aggregates).
- Extend with appointments per property: new method `findAppointmentsByContactGroupedByProperty(contactId, options)` OR fetch flat appointments and group client-side. **Decision**: client-side grouping in initial impl (simpler; backend already paginates appointments). Revisit if N+1 becomes an issue.

### 8. Branch filter implementation

Branch is NOT on the Contact model. Filter is **derived** via JOIN:

```sql
SELECT c.* FROM contacts c
WHERE c.tenant_id = $1
  AND (
    $2::uuid[] IS NULL  -- no branch filter
    OR EXISTS (
      SELECT 1 FROM appointment_contacts ac
      JOIN appointments a ON a.id = ac.appointment_id
      JOIN properties p ON p.id = a.property_id
      WHERE ac.contact_id = c.id
        AND p.branch_id = ANY($2::uuid[])
    )
  )
```

Performance: index on `appointment_contacts.contact_id` (already exists) + `properties(branch_id)` (verify).

## Architecture

### Backend changes

- `apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts`:
  - Extend `findContactList` aggregation with `primaryInPropertyCount`.
  - Extend list query with optional `branchIds: string[]` filter (EXISTS subquery).
- `apps/backend/src/modules/contact/interfaces/http/contact.routes.ts`:
  - Extend `listQuerySchema` with `branchIds` and `primary` (boolean) filters.
  - Update `formatListItem` to include `primaryInPropertyCount`.
- `apps/backend/src/modules/notification/` (or wherever portal-token dispatch lives):
  - Filter `is_primary = true` before send. Add unit test.
- `apps/backend/src/modules/appointment/`:
  - Confirm `appointmentContactsArraySchema` "exactly one primary" validation is wired (it is — `packages/shared/src/schemas/contact.ts:100`).
  - Add bulk re-send endpoint: `POST /v1/appointments/bulk-resend-reminder` with body `{ appointmentIds: string[] }`. Auth: AM/OP. Per appointment: dispatch portal-token to primary contact only.

### Shared changes

- `packages/shared/src/schemas/contact.ts`:
  - `contactListItemSchema`: add `primaryInPropertyCount: z.number().int().nonnegative()`.
- Regenerate `api-types.ts` via `pnpm generate:api`.

### Frontend changes

- `apps/web/src/features/contacts/`:
  - `pages/ContactListPage.tsx`: add branch multiselect + primary y/n filter; add Primary column.
  - `pages/ContactDetailPage.tsx`: replace Properties + Appointments tabs with single Relations tab containing expandable property rows.
  - `components/RelationsTab.tsx` (new): expandable property tree with appointments.
  - `components/ContactFormDrawer.tsx`: add "Provide at least email or phone" hint.
  - Tests for new behaviours.
- `apps/web/src/features/appointments/`:
  - `components/AppointmentFormDrawer.tsx`: add `type`, `company`, `additionalChannels`, `notes` to inline section; rename Name → Display name; add hint; enforce primary-required.
  - `components/AppointmentTable.tsx`: add Confirmation column + selection checkboxes.
  - `pages/AppointmentListPage.tsx`: add bulk re-send action; promote `confirmationStatus` filter.
  - `hooks/useBulkResendReminder.ts` (new): mutation calling `POST /v1/appointments/bulk-resend-reminder`.
  - Tests for new behaviours.
- `apps/web/src/components/shell/Sidebar.tsx`: remove `Tenant Confirmations` entry.
- `apps/web/src/app/router.tsx`: remove `tenant-contacts` route.
- `apps/web/src/features/tenants/`: delete entire folder + tests.

### Data flow (Relations tab)

```
Mount /contacts/:id
   → fetch GET /v1/contacts/:id (no includes — header data only)
   → user clicks Relations tab
       → fetch GET /v1/contacts/:id?includeProperties=true&includeAppointments=true
       → group appointments by property client-side
       → render expandable rows
   → user clicks Timeline tab
       → fetch GET /v1/audit-logs?entityType=contact&entityId=:id
```

Lazy fetch preserved per NFR-103/104.

## Testing

- **Backend integration** (Testcontainers): `branchIds` filter, `primaryInPropertyCount` aggregation, bulk re-send endpoint, primary-only filter on portal dispatch.
- **Backend unit**: `appointmentContactsArraySchema` exactly-one-primary, inline contact `type` required, portal dispatch ignores non-primary.
- **Frontend unit (Vitest+RTL)**: `ContactListPage` branch filter behaviour; `RelationsTab` expand/collapse; `AppointmentFormDrawer` inline type/company/notes inputs; bulk re-send selection state.
- **Frontend integration**: ContactListPage → drawer → Open detail → /contacts/:id with Relations tab visible.
- **Cross-form consistency test**: `AppointmentFormDrawer` inline create produces identical contact shape to `ContactFormDrawer`.
- **Regression**: 022 scenarios re-validated; `prisma-contact.repository.bug-001.test.ts` still passes (covers new aggregations too).
- **Playwright happy path** (CL_ADMIN): create contact via /contacts → create appointment with that contact → see confirmation status update → bulk re-send → see audit log update.

## Risks

- **Scope size**: 022 was a focused PR; 023 is broader (delete legacy + appointments enhancements + form alignment). Mitigation: still one PR for atomicity, but staged commits.
- **Inline form expansion**: AppointmentFormDrawer is already complex. Adding fields risks UX bloat. Mitigation: collapse `additionalChannels` and `notes` by default.
- **Branch filter performance**: EXISTS subquery on aggregations could be slow. Mitigation: validate via EXPLAIN ANALYZE; add index on `properties(branch_id)` if missing.
- **Bulk re-send rate limit**: AM/OP could trigger N portal-token jobs at once. Mitigation: backend Idempotency-Key per (appointment_id, day) prevents duplicate sends within the same day; rate limit at notification module if needed.
- **Migration of confirmation board**: users accustomed to `/tenant-contacts` need to know the workflow moved. Mitigation: brief release note + tooltip on `/appointments` Confirmation column header for first weeks.

## Open Questions (non-blocking — defer to Arquiteto if needed)

- Should `bulk-resend-reminder` accept a `contactRoleFilter` (only resend to TENANT-role primaries, skip OWNER primaries)? **Default**: no — primary regardless of role gets the link.
- Should the Relations tab's expandable rows persist their open state across re-renders? **Default**: yes (sessionStorage keyed by contactId).

## Acceptance Criteria

- Sidebar shows only `Contacts` (no `Tenant Confirmations`).
- `/contacts` listing has branch multiselect + primary filter + Primary column.
- `/contacts/:id` shows Relations tab with expandable property rows.
- AppointmentFormDrawer inline form has type, company, additionalChannels, notes fields.
- Both forms show "Provide at least email or phone" hint.
- Both forms enforce: appointment with at least one isPrimary contact, exactly one primary per appointment.
- Portal-token dispatch (single + bulk) sends only to is_primary contacts.
- `/appointments` listing has Confirmation column + filter + bulk re-send action.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.
- Regression guards from 022 still pass.
- 022 scenarios still PASS in QA.

## Reference label for PR

`refactor.contacts_ux.unify_and_align` (replaces `constitution.v1_3.op_role_rollback` from 022 second pass; this is a follow-up).
