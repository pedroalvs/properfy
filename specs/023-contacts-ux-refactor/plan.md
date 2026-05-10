# Implementation Plan: Contacts UX Refactor (023)

**Feature**: `023-contacts-ux-refactor`
**Status**: NEW
**Predecessor**: 022-contacts-screen-enhancement REV 4
**Owner**: Arquiteto → Executor
**Branch**: `022-contacts-screen-enhancement` (stacked; do NOT branch off)
**Source-of-truth design**: `docs/superpowers/specs/2026-05-09-023-contacts-ux-refactor-design.md`

## High-level architecture

Pure layered refactor + small backend extensions. **No migration**. **No new entity**. The branch filter is derived via EXISTS subquery; "Primary in N" is a new aggregation in the existing list query. All `::uuid` casts continue using the BUG-001-safe `::text` form (regression guards from 022 already cover this).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ DELETE — apps/web/src/features/tenants/                                   │
│   pages/TenantContactListPage.tsx          (legacy /tenant-contacts)      │
│   pages/TenantContactListPage.test.tsx                                    │
│   components/TenantContactDetailDrawer.{tsx,test.tsx}                     │
│   components/TenantContactDetailSections.{tsx,test.tsx}                   │
│   components/TenantConfirmationStatusChip.{tsx,test.tsx}                  │
│   components/TenantTable.{tsx,test.tsx}                                   │
│   components/TenantFilters.{tsx,test.tsx}                                 │
│   hooks/useTenantContactList.{ts,test.ts}                                 │
│   hooks/useTenantContactDetail.{ts,test.ts}                               │
│   types/index.ts                                                          │
│   index.ts                                                                │
│ (Pre-delete grep verified: only apps/web/src/app/router.tsx imports.)     │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ MODIFY — apps/web/src/app/router.tsx                                      │
│   Remove `/tenant-contacts` route + lazy import.                          │
│ MODIFY — apps/web/src/components/shell/Sidebar.tsx                        │
│   Remove "Tenant Confirmations" entry (line 33).                          │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend extensions (additive — same modules from 022)                     │
│                                                                            │
│  apps/backend/src/modules/contact/                                         │
│   infrastructure/prisma-contact.repository.ts                              │
│     + extend findContactList aggregation: + primaryInPropertyCount         │
│       FILTER (WHERE ac.is_primary = true AND a.status NOT IN              │
│       ('CANCELLED','REJECTED'))                                            │
│     + extend list query buildWhere with optional branchIds EXISTS clause  │
│     (all casts ::text — BUG-001 regression guards cover the new query)    │
│   application/use-cases/list-contacts.use-case.ts                         │
│     + thread branchIds + primary into filters                              │
│     + map repo result with new primaryInPropertyCount field                │
│   interfaces/http/contact.routes.ts                                        │
│     + listQuerySchema: branchIds (z.array(z.string().uuid())), primary    │
│       (z.coerce.boolean())                                                 │
│     + formatListItem includes primaryInPropertyCount                       │
│                                                                            │
│  apps/backend/src/modules/tenant-portal/                                   │
│   application/use-cases/generate-portal-token.use-case.ts                 │
│     + assert result.contact?.isPrimary === true before dispatch            │
│       (today line 140-143 sorts but does not enforce)                      │
│     + return { ..., dispatchSkipped: 'NO_PRIMARY_CONTACT' } when absent   │
│   (no schema/route changes — single-dispatch endpoint behaviour preserved) │
│                                                                            │
│  apps/backend/src/modules/appointment/                                     │
│   application/use-cases/bulk-resend-reminder.use-case.ts (NEW)            │
│     For-of over appointmentIds:                                            │
│       1. tenant scope check (AM cross / OP cross)                          │
│       2. idempotency.getWithHash(`bulk_resend:${apptId}:${day}`, scope)   │
│       3. delegate to GeneratePortalTokenUseCase.execute                    │
│       4. capture status SENT | NO_PRIMARY_CONTACT | IDEMPOTENT_REPLAY |   │
│          ERROR                                                             │
│   interfaces/http/appointment.routes.ts                                    │
│     + POST /v1/appointments/bulk-resend-reminder                          │
│       schema: { body: bulkResendReminderSchema, response: { 200: ... } } │
│       auth: AM/OP                                                          │
│                                                                            │
│  apps/backend/src/modules/notification/                                    │
│   (no changes — audit recipient.is_primary already feasible via existing  │
│    audit emit; verify and add if missing)                                  │
│                                                                            │
│  packages/shared/src/schemas/contact.ts                                    │
│   + contactListItemSchema.extend({ primaryInPropertyCount: number })      │
│  packages/shared/src/schemas/appointment.ts (or /bulk.ts)                  │
│   + bulkResendReminderRequestSchema, bulkResendReminderResponseSchema     │
│  pnpm generate:api → packages/shared/src/api-types.ts regenerated         │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend changes                                                          │
│                                                                            │
│  apps/web/src/features/contacts/                                           │
│   pages/ContactListPage.tsx          (modify — branch+primary filters)    │
│   pages/ContactDetailPage.tsx        (modify — Relations tab replaces 2)  │
│   components/ContactFilters.tsx      (modify — branch multiselect, etc.)  │
│   components/ContactTable.tsx        (modify — Primary in N column)       │
│   components/RelationsTab.tsx        (NEW — expandable property tree)     │
│   components/ContactPropertiesTab.tsx, ContactAppointmentsTab.tsx         │
│     (DELETE — merged into RelationsTab)                                   │
│   components/ContactFormDrawer.tsx   (modify — hint copy)                 │
│   hooks/useContactList.ts            (modify — pass branchIds + primary)  │
│   hooks/useContactRelations.ts       (NEW — single fetch combining        │
│     ?includeProperties=true&includeAppointments=true; lazy via enabled)   │
│   types/index.ts                     (extend ContactListItem,             │
│     ContactFiltersState)                                                   │
│                                                                            │
│  apps/web/src/features/appointments/                                       │
│   pages/AppointmentListPage.tsx      (modify — bulk action UI;            │
│     promote confirmationStatus filter)                                    │
│   components/AppointmentTable.tsx    (modify — Confirmation column +      │
│     selection checkboxes)                                                  │
│   components/AppointmentFormDrawer.tsx                                     │
│     (modify — inline contact section: type/company/additional/notes;     │
│      rename Name → Display name; add hint; primary-required validation;  │
│      radio-style primary toggle)                                          │
│   components/AppointmentMapFilterPanel.tsx                                 │
│     (modify — share confirmationStatus subcomponent with list panel OR    │
│      keep duplicated; decision below)                                     │
│   hooks/useBulkResendReminder.ts     (NEW — useMutation against           │
│     /v1/appointments/bulk-resend-reminder)                                │
│                                                                            │
│  apps/web/src/components/shell/Sidebar.tsx (modify — remove entry)        │
│  apps/web/src/app/router.tsx                (modify — remove route)       │
│  apps/web/src/features/tenants/             (DELETE — entire folder)      │
└──────────────────────────────────────────────────────────────────────────┘
```

## Backend changes (detailed)

### 1. `prisma-contact.repository.ts` — extend `findContactList`

Single SQL aggregation in `findContactList`. Add to the SELECT list (and to GROUP BY where appropriate):

```sql
COUNT(DISTINCT a.property_id) FILTER (
  WHERE ac.is_primary = true AND a.status NOT IN ('CANCELLED','REJECTED')
)::int AS primary_in_property_count
```

Branch filter — append to the WHERE clause when `branchIds.length > 0`:

```sql
AND EXISTS (
  SELECT 1 FROM appointment_contacts ac2
  JOIN appointments a2 ON a2.id = ac2.appointment_id
  JOIN properties p2 ON p2.id = a2.property_id
  WHERE ac2.contact_id = c.id
    AND p2.branch_id = ANY(${branchIds}::text[])
)
```

`primary` filter — append:

```sql
AND (CASE WHEN ${primary}::boolean THEN <primary_in_property_count_subquery> > 0
          ELSE TRUE END)
```

Or simpler: compute `primary_in_property_count` first via window/CTE, then `HAVING` / outer filter. Implementer chooses the simpler form that survives EXPLAIN ANALYZE under NFR-201.

**All casts use `::text`** per BUG-001 regression guards (`tests/unit/contact/prisma-contact.repository.bug-001.test.ts` already source-scans for `::uuid` and fails the build if it resurfaces).

### 2. `list-contacts.use-case.ts` — thread filters

```ts
export interface ListContactsFilters {
  search?: string;
  type?: ContactType[];
  branchIds?: string[];
  primary?: boolean;
  isActive?: boolean;
  // ...existing
}

execute(filters, pagination, scope) → ListContactsResult
// each item now carries primaryInPropertyCount: number (alongside existing propertyCount)
```

### 3. `contact.routes.ts` — extend `listQuerySchema`

```ts
const listQuerySchema = z.object({
  // existing: search, type (single), isActive, page, pageSize, sortBy, sortOrder
  branchIds: z.array(z.string().uuid()).optional(),
  primary: z.coerce.boolean().optional(),
  type: z.array(z.nativeEnum(ContactType)).optional(),  // promote to multi if currently single
});
```

`formatListItem` adds `primaryInPropertyCount`.

### 4. `generate-portal-token.use-case.ts` — primary-only enforcement

In the dispatch block (around line 67–115 of the use case), before calling `createNotificationUseCase`, add:

```ts
if (!result.contact || result.contact.isPrimary !== true) {
  this.auditService.log({
    action: 'tenant_portal.dispatch_skipped',
    actorType: 'USER',
    actorId: input.actor.userId,
    entityType: 'appointment',
    entityId: appointment.id,
    tenantId: appointment.tenantId,
    metadata: { reason: 'NO_PRIMARY_CONTACT' },
  });
  return { token: rawToken, expiresAt, dispatched: false, reason: 'NO_PRIMARY_CONTACT' };
}
```

Today the picker sorts primary first (`prisma-appointment.repository.ts:140-143`) but does not assert primary-existence. Adding the explicit check closes the gap.

### 5. `bulk-resend-reminder.use-case.ts` — new use case

Located at `apps/backend/src/modules/appointment/application/use-cases/bulk-resend-reminder.use-case.ts`.

```ts
export class BulkResendReminderUseCase {
  constructor(
    private readonly generatePortalToken: GeneratePortalTokenUseCase,
    private readonly idempotency: IIdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { appointmentIds: string[]; actor: AuthContext; actorTimezone?: string }) {
    const dayKey = formatDateInTz(this.clock(), input.actorTimezone ?? 'UTC');
    const results: BulkResendResult[] = [];
    for (const apptId of input.appointmentIds) {
      const idemKey = `bulk_resend:${apptId}:${dayKey}`;
      const cached = await this.idempotency.getWithHash<BulkResendResult>(idemKey, 'bulk_resend_reminder');
      if (cached) {
        results.push({ appointmentId: apptId, status: 'IDEMPOTENT_REPLAY' });
        continue;
      }
      try {
        const dispatch = await this.generatePortalToken.execute({ appointmentId: apptId, actor: input.actor });
        const status = (dispatch as any).reason === 'NO_PRIMARY_CONTACT' ? 'NO_PRIMARY_CONTACT' : 'SENT';
        const result: BulkResendResult = { appointmentId: apptId, status };
        await this.idempotency.save?.(idemKey, 'bulk_resend_reminder', result); // method name verified by Executor
        results.push(result);
      } catch (e) {
        results.push({ appointmentId: apptId, status: 'ERROR', error: { code: 'DISPATCH_FAILED', message: (e as Error).message } });
      }
    }
    return { results };
  }
}
```

`AuthContext` and tenant-scope rules for AM/OP per Constitution v1.3.0. Per-appointment errors do NOT abort the loop — the response surfaces them per item.

### 6. `appointment.routes.ts` — bulk-resend route

```ts
app.post(
  '/v1/appointments/bulk-resend-reminder',
  {
    preHandler: authenticate,
    schema: {
      body: bulkResendReminderRequestSchema,
      response: { 200: bulkResendReminderResponseSchema },
    },
  },
  async (request, reply) => {
    const auth = (request as any).authContext;
    if (!['AM', 'OP'].includes(auth.role)) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'AM/OP only' } });
    const body = bulkResendReminderRequestSchema.parse(request.body);
    const result = await container.bulkResendReminderUseCase.execute({ appointmentIds: body.appointmentIds, actor: auth });
    return reply.status(200).send(result);
  }
);
```

### 7. Shared schemas

`packages/shared/src/schemas/contact.ts`:

```ts
export const contactListItemSchema = z.object({
  // existing fields (id, displayName, type, primaryEmail, primaryPhone, isActive, propertyCount, createdAt, updatedAt)
  primaryInPropertyCount: z.number().int().nonnegative(),
});
```

`packages/shared/src/schemas/appointment.ts` (or new `bulk.ts`):

```ts
export const bulkResendReminderRequestSchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(100),
});

export const bulkResendReminderResultSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(['SENT', 'NO_PRIMARY_CONTACT', 'IDEMPOTENT_REPLAY', 'ERROR']),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const bulkResendReminderResponseSchema = z.object({
  results: z.array(bulkResendReminderResultSchema),
});
```

After the route lands, run `pnpm generate:api`.

## Frontend changes (detailed)

### 1. `/contacts` listing — `ContactListPage.tsx` + `ContactFilters.tsx` + `ContactTable.tsx` + `useContactList.ts` + `types/index.ts`

- `ContactFiltersState` adds `branchIds: string[]`, `primary: '' | 'YES' | 'NO'`.
- `ContactFilters` renders: search input, branch multiselect (sourced from `useBranchList(tenantId)` — add the hook if missing or verify it exists in tenants feature pre-deletion; if it lives there, lift to a shared hook before deleting), type multiselect, status select, primary select.
- `ContactTable` adds the "Primary in N" column rendering `primaryInPropertyCount` as a count chip; row "Open detail" affordance navigates with `target=_blank`.
- `useContactList` passes `branchIds` (joined comma if API expects scalars) and `primary` to the API. Verify openapi-fetch handles array params; if not, serialize manually.
- "Last activity" column removed if present.

### 2. `/contacts/:id` detail — `ContactDetailPage.tsx` + new `RelationsTab.tsx` + delete `ContactPropertiesTab.tsx` + delete `ContactAppointmentsTab.tsx`

- `ContactDetailPage`: 2 tabs only — Relations + Timeline.
- `RelationsTab.tsx` (new):
  - Calls `useContactRelations(contactId, { enabled: tab === 'relations' })`.
  - Groups appointments by `propertyId` client-side (the spec confirms this is the initial impl).
  - Renders an array of `<PropertyRow>` components, each with: property code/address, summary chip ("3 appts | 1 PENDING"), `[PRIMARY]` badge if any of the property's appointments has `isPrimary === true && status NOT IN ('CANCELLED','REJECTED')`.
  - Expand/collapse state: `useSessionStorage<{ [propertyId: string]: boolean }>(`contact-relations:${contactId}`, {})`.
  - Each expanded property renders its appointments inline using existing `<TenantConfirmationChip>`.
- `useContactRelations.ts` (new): single fetch `GET /v1/contacts/:id?includeProperties=true&includeAppointments=true` (existing endpoint shape). Lazy via `enabled` flag.

### 3. `AppointmentFormDrawer.tsx` — inline contact alignment

- Inline contact section adds:
  - `type` — required `<SelectInput>` with `CONTACT_TYPE_OPTIONS`. Label: "Contact type".
  - `company` — optional `<TextInput>`. Label: "Company".
  - `additionalChannels` — optional repeater (collapsed by default; "Add channel" button reveals; uses the same component used in `ContactFormDrawer`).
  - `notes` — optional `<Textarea>`, collapsed.
- Rename "Name" → "Display name" (existing label at the inline section).
- Add hint text below primary channels: "Provide at least one of email or phone."
- Validation:
  - Inline form: if `inline` mode is selected, `type` and `displayName` required; `primaryEmail || primaryPhone` required; show inline errors before submit.
  - Outer contacts array: exactly one `isPrimary === true` (mirrors `appointmentContactsArraySchema:97-106`); show error if violated.
  - Primary toggle: clicking primary on a contact untoggles other primaries (radio-style). Mutate the array in `setPrimaryContact(key)` (already exists at line 327-334 — review and confirm semantics).

### 4. `AppointmentTable.tsx` + `AppointmentListPage.tsx` — confirmation column + bulk action

- `AppointmentTable`: add row-selection checkboxes (column 0). Selection state lifted to `AppointmentListPage`. Add "Confirmation" column rendering `<TenantConfirmationChip status={row.primaryConfirmationStatus} />` — backend either already returns this on the appointment row or needs a small addition. Verify via the existing `/v1/appointments` list response shape; if absent, add `primaryConfirmationStatus` to the listing response without schema migration (it's derived from the primary contact's `confirmation_status`).
- `AppointmentListPage`: render the bulk action button "Re-send reminder" above the table when ≥1 row is selected. Gated by `canPerform('appointment.bulk_resend_reminder')` (add this key to `role-matrix.ts`: AM/OP only). On click, call `useBulkResendReminder().mutate({ appointmentIds })`. Show a per-result summary toast: "3 sent, 1 no primary, 0 errors".
- Promote `confirmationStatus` filter from `AppointmentMapFilterPanel` into the list filter panel. Approach: extract `<ConfirmationStatusSelect>` into a shared component under `apps/web/src/features/appointments/components/`; both panels import it.

### 5. `useBulkResendReminder.ts` — new hook

```ts
export function useBulkResendReminder() {
  return useCreateMutation<{ appointmentIds: string[] }, BulkResendReminderResponse>(
    '/v1/appointments/bulk-resend-reminder',
  );
}
```

Plus a tiny test asserting it calls the endpoint.

### 6. Sidebar + router cleanup

- `Sidebar.tsx`: remove the line for "Tenant Confirmations" (currently line 33; the comment block above it explaining the legacy can also be cleaned).
- `router.tsx`: remove the `tenant-contacts` route (lines 284-289 per the design doc) and the lazy import for `TenantContactListPage`.
- After removal, run `pnpm typecheck` to catch any dangling references.

### 7. Delete `apps/web/src/features/tenants/`

- Pre-delete grep (already done at planning time): only `apps/web/src/app/router.tsx` references `TenantContactList*` outside the folder. After router cleanup the folder is unreachable.
- The `tenants` folder also contains `BranchSection.tsx`, `BranchFormDrawer.tsx`, `TenantAdminTable.tsx`, `TenantAdminFilters.tsx`, `TenantFormDrawer.tsx`, `TenantListPage.tsx`, `TenantDetailPage.tsx`, etc. **DO NOT DELETE THE WHOLE FOLDER.** Only the legacy `Tenant Contact*` files (the confirmation-board family). Keep the agency/branch admin UI intact.
- Files to delete (precise list — verify before rm):
  - `pages/TenantContactListPage.tsx`, `.test.tsx`
  - `components/TenantContactDetailDrawer.tsx`, `.test.tsx`
  - `components/TenantContactDetailSections.tsx`, `.test.tsx`
  - `components/TenantConfirmationStatusChip.tsx`, `.test.tsx` (if it's only used by the legacy page; if used elsewhere, keep — quick grep verifies)
  - `components/TenantTable.tsx`, `.test.tsx` — if the legacy page is its only consumer; verify (the name overlaps with the agency table; double-check)
  - `components/TenantFilters.tsx`, `.test.tsx` — same caveat; verify
  - `hooks/useTenantContactList.ts`, `.test.ts`
  - `hooks/useTenantContactDetail.ts`, `.test.ts`
- Update `apps/web/src/features/tenants/index.ts` to drop the deleted re-exports.

### 8. Permission key for bulk action

`packages/shared/src/permissions/role-matrix.ts`:

```ts
'appointment.bulk_resend_reminder': { roles: ['AM', 'OP'] },
```

Update `role-matrix.test.ts`.

## Build sequence (implementation order)

1. **shared/** — add `primaryInPropertyCount` to `contactListItemSchema`; new `bulkResendReminder*` schemas; new permission key `appointment.bulk_resend_reminder`. Update `role-matrix.test.ts`.
2. **backend repo & infra** — extend `findContactList` aggregation (`primaryInPropertyCount`) and where-clause (`branchIds`, `primary`). Run BUG-001 source-scan locally to confirm `::text` casts.
3. **backend application** — thread filters through `list-contacts.use-case.ts`. Implement `BulkResendReminderUseCase`. Add primary-only assertion to `GeneratePortalTokenUseCase`.
4. **backend routes** — extend `contact.routes.ts` `listQuerySchema`; add `POST /v1/appointments/bulk-resend-reminder` route. Both with full Fastify schemas (continues 022 contract-first practice).
5. **OpenAPI regen** — `pnpm generate:api` and commit `api-types.ts`.
6. **backend tests** — repository integration (Testcontainers, EXPLAIN ANALYZE for branch filter + new aggregation), use-case unit (primary-only enforcement, bulk idempotency), route integration (Supertest — bulk endpoint, AM/OP gating, per-item statuses).
7. **frontend types & hooks** — extend `ContactListItem`, `ContactFiltersState`; new `useContactRelations`, `useBulkResendReminder`.
8. **frontend deletion** — delete legacy `tenant-contacts` route + sidebar entry + the precise files in `apps/web/src/features/tenants/`. Run `pnpm typecheck` to confirm clean.
9. **frontend `/contacts`** — refactor list page filters + table; refactor detail page to Relations tab + delete `ContactPropertiesTab` and `ContactAppointmentsTab`.
10. **frontend `/appointments`** — confirmation column + selection + bulk action UI; promote confirmationStatus filter; expand inline contact form fields + rename + hint + radio-primary.
11. **frontend tests** — new component tests for RelationsTab, ContactFilters branch+primary, AppointmentTable confirmation column + selection, AppointmentFormDrawer inline expansion, lazy-fetch assertions for Relations tab.
12. **NFR verification** — EXPLAIN ANALYZE for new aggregations + branch filter pinned to PR description.
13. **Playwright happy path** — CL_ADMIN: create contact via `/contacts` → create appointment with that contact → see confirmation status → bulk re-send → see audit update.
14. **regression** — re-run 022 scenarios; confirm BUG-001 source-scan still green.
15. **lint, typecheck, build, test** all green.
16. **Stack on existing PR** — push commits to `022-contacts-screen-enhancement`. Update PR title/body with the 023 reference label `refactor.contacts_ux.unify_and_align`.

## Test strategy

### Backend

- **Unit (use-case)**:
  - `GeneratePortalTokenUseCase`: with appointment having `is_primary=true` contact → dispatches; with no primary → skips and returns `dispatched: false, reason: 'NO_PRIMARY_CONTACT'`.
  - `BulkResendReminderUseCase`: 3 appointments, 1 IDEMPOTENT_REPLAY (cached), 1 SENT, 1 NO_PRIMARY_CONTACT — single response with three results.
  - `ListContactsUseCase`: `branchIds`, `primary` filters threaded; result items carry `primaryInPropertyCount`.
- **Repo integration (Testcontainers)**:
  - `findContactList` with `branchIds` filter returns only contacts with appointments touching those branches.
  - `findContactList` with `primary=true` returns only contacts with `primaryInPropertyCount > 0`.
  - EXPLAIN ANALYZE on the new aggregation + branch filter ≤ NFR-201 budget.
- **Routes (Supertest)**:
  - `POST /v1/appointments/bulk-resend-reminder` AM/OP allowed; CL_* / INSP forbidden.
  - Bulk endpoint returns 200 with mixed-result body for partial failures (no 500 on per-item error).
  - List endpoint accepts `branchIds[]=X&branchIds[]=Y&primary=true` and returns the new field.

### Frontend

- **Component**:
  - `ContactFilters`: branch multiselect populated from branches API; primary select changes the API params.
  - `ContactTable`: "Primary in N" column rendered; row "Open detail" navigates with `target=_blank`.
  - `RelationsTab`: empty state for zero properties; expand/collapse persists across remounts via sessionStorage; lazy-fetch assertion (no API call until tab activated).
  - `AppointmentTable`: selection checkboxes update parent state; Confirmation column renders chip.
  - `AppointmentListPage`: bulk action button enabled only when ≥1 row selected and actor is AM/OP.
  - `AppointmentFormDrawer`: inline section shows `type` (required), `company`, `additionalChannels`, `notes`; "Display name" label; hint visible; primary radio-style behaviour.
- **Hook**:
  - `useBulkResendReminder` posts to the endpoint and returns the result array.
  - `useContactRelations` issues a single combined fetch, lazy via `enabled`.
- **Page integration**:
  - `ContactListPage` → click "Open detail" → assert `target=_blank` (mock window.open or assert anchor target).
  - `ContactDetailPage` → click Relations tab → expand a property → see appointments inline.
  - `AppointmentListPage` → select rows → click "Re-send reminder" → toast shows mixed result counts.

### Manual QA matrix

| Role | Browse `/contacts` | Branch filter | Primary in N column | Relations tab | Inline contact form | `/appointments` confirmation column | Bulk re-send |
|------|--------------------|---------------|---------------------|---------------|--------------------|--------------------------------------|--------------|
| AM | ✓ Agency selector | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| OP | ✓ Agency selector | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CL_ADMIN | ✓ JWT-pinned | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ hidden |
| CL_USER | ✓ JWT-pinned | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ hidden |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Branch filter EXISTS subquery underperforms with large appointment volumes. | Index on `properties(branch_id)` already present (verified at schema lines 261/346/390); EXPLAIN ANALYZE pinned to PR. If degraded, fallback to materializing `contact_branch_membership` on demand — but only if NFR-201 fails. |
| Inline form expansion bloats `AppointmentFormDrawer`. | Collapse `additionalChannels` and `notes` by default; add affordances ("Add channel", "Add notes") to keep the visible surface small. |
| Bulk re-send concurrency triggers downstream rate limits. | For-of loop is sequential server-side; batch capped at 100 per request (Zod `max(100)`); per-(appt, day) idempotency dedupes. If rate limit is hit, the per-item ERROR surfaces in the response without aborting the batch. |
| Deleting `apps/web/src/features/tenants/` could remove agency/branch admin UI. | The folder mixes `TenantContact*` (legacy confirmation board — DELETE) with agency/branch admin UI (KEEP). Plan §7 specifies the precise file list; pre-delete grep confirms no consumers outside the listed files. |
| `prisma-contact.repository.bug-001.test.ts` (source-scan) might trip on the new branch filter SQL. | The guard rejects `::uuid` in the three named methods; we only add `::text` casts. Run the guard locally before pushing. |
| Cross-form consistency drifts again over time. | Add a snapshot/contract test that asserts inline-create payload equals dedicated-create payload modulo `role` (which is appointment-only). |
| `/appointments` listing now needs `primaryConfirmationStatus` on each row. | If the field is not already in the response, extend the appointment list use case to project it (small additive change; no migration). Verify before implementing the column. |

## Out of scope (explicit)

- Schema migration, new entities, new audit events for link/unlink.
- Search by property code/address (GAP-002 from 022 — still deferred).
- Bulk deactivate / merge / export of contacts.
- Renaming the branch from `022-contacts-screen-enhancement` (cosmetic; git log preserves the lineage).

## Definition of Done

- All FRs (201-264) satisfied; manual QA matrix green for all roles.
- Backend tests green (unit + repo integration + routes); 022 BUG-001 regression guards still green.
- Frontend tests green (component + page integration); explicit lazy-fetch tests passing.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.
- `pnpm generate:api` rerun; `api-types.ts` reflects new fields/endpoints.
- EXPLAIN ANALYZE artifacts pinned to PR (NFR-201/202 verification gate).
- PR (existing — same branch) updated with 023 reference label `refactor.contacts_ux.unify_and_align` and a short note explaining the stacking + 023 acceptance criteria.
