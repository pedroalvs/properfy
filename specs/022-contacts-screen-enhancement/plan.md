# Implementation Plan: Contacts Screen Enhancement

**Feature**: `022-contacts-screen-enhancement`
**Status**: NEW
**Owner**: Arquiteto → Executor

## High-level architecture

This is primarily a frontend feature with three small, additive backend extensions. No new domain entities. No migrations. No state-machine changes.

```
┌──────────────────────────────────────────────────────────────┐
│ Web (apps/web/src/features/contacts/)  ← NEW FOLDER          │
│                                                                │
│   pages/                                                       │
│     ContactListPage.tsx           (route /contacts)            │
│     ContactDetailPage.tsx         (route /contacts/:id)        │
│   components/                                                  │
│     ContactFilters.tsx                                         │
│     ContactTable.tsx                                           │
│     ContactDetailDrawer.tsx                                    │
│     ContactDetailSections.tsx                                  │
│     ContactFormDrawer.tsx                                      │
│     ContactPropertiesTab.tsx                                   │
│     ContactAppointmentsTab.tsx                                 │
│     ContactTimelineTab.tsx                                     │
│     ContactTypeChip.tsx                                        │
│     ContactStatusBadge.tsx                                     │
│     DeactivateContactModal.tsx                                 │
│   hooks/                                                       │
│     useContactList.ts            (uses /v1/contacts list)      │
│     useContactDetail.ts          (uses /v1/contacts/:id …)     │
│     useContactSave.ts            (POST + PATCH)                │
│     useContactDeactivate.ts      (POST :id/deactivate)         │
│     useContactReactivate.ts      (PATCH {isActive:true})       │
│     useContactProperties.ts      (uses includeProperties)      │
│     useContactAppointments.ts    (uses includeAppointments)    │
│     useContactTimeline.ts        (uses /v1/audit-logs)         │
│   types/index.ts                  (Contact, ContactDetail, …)  │
│   constants/form-options.ts                                    │
└──────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend extensions (additive, no breaking changes)            │
│                                                                │
│  apps/backend/src/modules/contact/                             │
│   domain/contact.repository.ts                                 │
│     + countDistinctPropertiesByContactIds()                    │
│     + findPropertiesByContactId()                              │
│   infrastructure/prisma-contact.repository.ts                  │
│     + impls of the two new methods (raw SQL aggregation)       │
│   application/use-cases/list-contacts.use-case.ts              │
│     + populates `propertyCount` per contact                    │
│   application/use-cases/get-contact.use-case.ts                │
│     + accepts `includeProperties: boolean`                     │
│     + extends `findAppointmentsByContactId` to also return     │
│       isPrimary + propertyId                                   │
│   interfaces/http/contact.routes.ts                            │
│     + listQuerySchema: no change                               │
│     + GET /v1/contacts/:id?includeProperties=true wired        │
│     + formatContact appends propertyCount when present         │
│                                                                │
│  packages/shared/src/schemas/contact.ts                        │
│     + contactResponseSchema       (canonical detail/payload)   │
│     + contactListItemSchema       (list row + propertyCount)   │
│     + contactAppointmentItemSchema (incl. isPrimary, propId)   │
│     + contactPropertyAggregateSchema (Properties tab row)      │
└──────────────────────────────────────────────────────────────┘
```

## Backend changes (detailed)

### 1. Repository: add aggregation methods

`apps/backend/src/modules/contact/domain/contact.repository.ts`

Add to `IContactRepository`:

```ts
/**
 * Returns a Map<contactId, propertyCount> for the given contact ids — counts
 * distinct property_ids across appointment_contacts → appointments. Used by
 * the list endpoint to avoid an N+1.
 */
countDistinctPropertiesByContactIds(contactIds: string[]): Promise<Map<string, number>>;

/**
 * Returns the distinct properties this contact has appeared in, with
 * appointment counts and the "is primary in any active appointment" flag.
 */
findPropertiesByContactId(contactId: string, pagination: ContactPagination): Promise<ContactPropertyAggregate[]>;
countPropertiesByContactId(contactId: string): Promise<number>;
```

Where `ContactPropertyAggregate`:

```ts
export interface ContactPropertyAggregate {
  propertyId: string;
  propertyCode: string;
  street: string;
  suburb: string;
  postcode: string;
  state: string;
  appointmentCount: number;
  isPrimaryInActiveAppointment: boolean;
}
```

`apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts`

Implements with a single `$queryRaw` per method:

```sql
-- countDistinctPropertiesByContactIds
SELECT ac.contact_id, count(DISTINCT a.property_id)::int AS property_count
FROM appointment_contacts ac
JOIN appointments a ON a.id = ac.appointment_id
WHERE ac.contact_id = ANY($1::uuid[])
GROUP BY ac.contact_id;

-- findPropertiesByContactId
SELECT
  p.id AS property_id,
  p.property_code,
  p.street,
  p.suburb,
  p.postcode,
  p.state,
  count(*)::int AS appointment_count,
  bool_or(ac.is_primary AND a.status NOT IN ('CANCELLED','REJECTED')) AS is_primary_in_active_appointment
FROM appointment_contacts ac
JOIN appointments a ON a.id = ac.appointment_id
JOIN properties p ON p.id = a.property_id
WHERE ac.contact_id = $1
GROUP BY p.id, p.property_code, p.street, p.suburb, p.postcode, p.state
ORDER BY MAX(a.scheduled_date) DESC NULLS LAST
LIMIT $2 OFFSET $3;
```

### 2. List use case: hydrate `propertyCount`

`apps/backend/src/modules/contact/application/use-cases/list-contacts.use-case.ts`

After fetching the page of contacts, batch-call `countDistinctPropertiesByContactIds(ids)` and merge the counts onto the result entities (or onto a DTO returned upstream — preferred).

### 3. Get use case: new options + parameterized pagination

`apps/backend/src/modules/contact/application/use-cases/get-contact.use-case.ts`

Replace the current hardcoded `page=1, pageSize=20` with caller-provided pagination per included sub-resource:

```ts
export interface GetContactOptions {
  includeAppointments?: boolean;
  appointmentsPagination?: { page: number; pageSize: number; sortOrder?: 'asc' | 'desc' };
  includeProperties?: boolean;
  propertiesPagination?: { page: number; pageSize: number; sortOrder?: 'asc' | 'desc' };
}

async execute(
  contactId: string,
  tenantId: string | null,
  options: GetContactOptions = {},
): Promise<GetContactResult>
```

Defaults: each sub-resource defaults to `page=1, pageSize=20`. Hard cap `pageSize=100` enforced at the route layer via Zod.

Result shape becomes:

```ts
export interface GetContactResult {
  contact: ContactEntity;
  appointments?: { data: ContactAppointmentSummary[]; total: number; page: number; pageSize: number };
  properties?: { data: ContactPropertyAggregate[]; total: number; page: number; pageSize: number };
}
```

When `includeAppointments: true`, also extend `findAppointmentsByContactId` to project `isPrimary`, `propertyId` and `propertyCode` (currently only role/status/date — see contact.repository.ts:18-24).

When `includeProperties: true`, paginate via `findPropertiesByContactId` + `countPropertiesByContactId`.

### 4. Routes: thread the options + register Fastify schemas + OpenAPI

`apps/backend/src/modules/contact/interfaces/http/contact.routes.ts`

Three concerns combined:

**4a. OP tenant-scope correction (Constitution v1.2.0).**
- Currently the routes accept `body.tenantId` for OP and use it to scope. Per `.specify/memory/correction-op-tenant-scope.md`, this is a bug.
- Fix: change the `tenantId` resolution at lines 70 and 115/148/177-184 so OP behaves like CL_ADMIN (uses `auth.tenantId`, ignores any override). Only AM still resolves from body/query `tenantId`.
- This is a **behavior change** to the 021-shipped routes. Documented in spec FR-105a. **No runtime audit event is emitted** — the correction is documented in the PR description with the reference label `correction.op_tenant_scope.contact_routes`. Regression coverage is enforced via Supertest (T-401).

**4b. Add Fastify route schemas + regenerate OpenAPI.**
Currently `contact.routes.ts` only does `safeParse` for runtime validation; it does NOT pass the Zod schemas to Fastify's `schema:` option, so OpenAPI generation produces empty `query`/`response` types in `packages/shared/src/api-types.ts` (verified at line 10941). Mirror the property routes pattern:

```ts
app.get(
  '/v1/contacts',
  {
    preHandler: authenticate,
    schema: {
      querystring: listQuerySchema,
      response: { 200: paginatedResponseSchema(contactListItemSchema) },
    },
  },
  handler,
);
```

Apply for: GET list, GET detail, POST create, PATCH update, POST deactivate. After landing the routes, run `pnpm generate:api` (calls `pnpm --filter backend generate:openapi && pnpm --filter shared generate:types`) and commit the regenerated `api-types.ts`.

**4c. Thread the new options.**
- `GET /v1/contacts`: `formatContact` becomes `formatListItem(contact, propertyCount?)`; controller passes the count map populated by the use case.
- `GET /v1/contacts/:id`: parse `includeProperties`, `appointmentsPage/Size`, `propertiesPage/Size` from query. Validate via Zod with `min(1)`, `max(100)`.

### 5. Shared schemas

`packages/shared/src/schemas/contact.ts`

**Naming convention**: the canonical detail/payload schema is `contactResponseSchema` (mirrors `propertyResponseSchema` in the property routes). The list-row variant is `contactListItemSchema` (extends `contactResponseSchema` with `propertyCount`). All routes use these two for `response: { 200/201: successResponseSchema(contactResponseSchema) }` (detail/create/update/deactivate) and `response: { 200: paginatedResponseSchema(contactListItemSchema) }` (list).

Add:

```ts
// Canonical contact detail/payload schema — used by GET :id, POST, PATCH,
// POST :id/deactivate. Defines the shape of a single contact registry row.
export const contactResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.nativeEnum(ContactType),
  displayName: z.string(),
  company: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  additionalChannels: z.array(additionalChannelSchema),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// List-row variant: contactResponseSchema + propertyCount aggregation.
export const contactListItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.nativeEnum(ContactType),
  displayName: z.string(),
  company: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  isActive: z.boolean(),
  propertyCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const contactAppointmentItemSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentNumber: z.number().int(),
  status: z.string(),
  scheduledDate: z.string().datetime(),
  role: z.nativeEnum(AppointmentContactRole),
  isPrimary: z.boolean(),
  propertyId: z.string().uuid(),
  propertyCode: z.string(),
});

export const contactPropertyAggregateSchema = z.object({
  propertyId: z.string().uuid(),
  propertyCode: z.string(),
  street: z.string(),
  suburb: z.string(),
  postcode: z.string(),
  state: z.string(),
  appointmentCount: z.number().int(),
  isPrimaryInActiveAppointment: z.boolean(),
});
```

## Frontend changes (detailed)

### 1. Routes (`apps/web/src/app/router.tsx`)

Add lazy imports + route definitions for `/contacts` and `/contacts/:id`. Both protected, AppShell, AuthGuard with all four roles for read; mutations gated UI-side by `usePermissions` / `hasRole`.

### 2. Sidebar (`apps/web/src/components/shell/Sidebar.tsx`)

- Rename current `/tenant-contacts` item label to `Tenant Confirmations` (URL unchanged).
- Add new `Contacts` item to `/contacts` with the same role visibility as Properties (`AM, OP, CL_ADMIN, CL_USER`).

### 3. New feature folder `apps/web/src/features/contacts/`

Mirror the Properties feature structure. Key components:

- **`ContactListPage.tsx`** — Agency selector + `FilterRequiredState` (until tenant chosen) shown **only for AM** per FR-105 / Constitution v1.2.0. OP/CL_ADMIN/CL_USER use the JWT tenant directly and the table loads immediately. Table with row click → drawer + row actions Edit/Deactivate (visible only when `canPerform` says so).
- **`ContactTable.tsx`** — `DataTable` columns: name, type chip, primaryEmail, primaryPhone, properties count, status badge.
- **`ContactFilters.tsx`** — search input (debounced), type select, active select.
- **`ContactDetailDrawer.tsx`** — Drawer mirroring `PropertyDetailDrawer`, with "Open full detail" navigating to `/contacts/:id`.
- **`ContactDetailPage.tsx`** — Page shell with tabs (uses existing `Tabs` component if available — confirm during implementation).
- **`ContactPropertiesTab.tsx`** — calls `useContactProperties(contactId)`, renders DataTable with Property code/address/appointment count/Primary chip; row click → `/properties/:id`.
- **`ContactAppointmentsTab.tsx`** — mirrors `PropertyAppointmentsTab`, with isPrimary column and link to appointment.
- **`ContactTimelineTab.tsx`** — calls `useContactTimeline(contactId)`; renders a vertical timeline using a small list of `AuditLog` entries (reuse `AuditLogTable` rows or render a custom timeline component — confirm during implementation).
- **`ContactFormDrawer.tsx`** — mirrors `PropertyFormDrawer`. Includes a dynamic sub-section for additional channels.
- **`DeactivateContactModal.tsx`** — `ConfirmDialog` with title/body and confirm button.

### 4. Permission gating

The role matrix in `packages/shared/src/permissions/role-matrix.ts` does not currently define `contact.*` keys (the backend uses inline role checks). Add the four keys below for FE consistency. **Do NOT** introduce `contact.read_audit` — the Timeline tab reuses the existing `audit.view` key.

```ts
'contact.create': { roles: ['AM', 'OP', 'CL_ADMIN'] },
'contact.update': { roles: ['AM', 'OP', 'CL_ADMIN'] },
'contact.deactivate': { roles: ['AM', 'OP', 'CL_ADMIN'] },
'contact.list': { roles: ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] },
```

**Drift correction**: `audit.view` is currently `['AM', 'OP']` in the matrix but the backend `ListAuditLogsUseCase` already permits CL_ADMIN (line 70-72). Widen the matrix entry to `['AM', 'OP', 'CL_ADMIN']` to match shipped behavior. This is a tiny, isolated, FE-only change; it unblocks the Timeline tab visibility check (FR-115/115a) and corrects an existing FE/BE inconsistency. Update `role-matrix.test.ts` accordingly.

## Build sequence (implementation order)

1. **shared/** — extend `packages/shared/src/schemas/contact.ts` with the new response item schemas. Add `contact.list/create/update/deactivate` to `role-matrix.ts`. Widen `audit.view` to include CL_ADMIN.
2. **backend domain & infra** — add new repository methods + raw SQL aggregations; extend `findAppointmentsByContactId` projection.
3. **backend application** — extend list use case (`propertyCount` hydration); rewrite get use case signature with `GetContactOptions` and parameterized pagination.
4. **backend routes** —
   4a. Apply OP tenant-scope correction (Constitution v1.2.0).
   4b. Register Fastify `schema:` for all `/v1/contacts*` routes.
   4c. Thread `includeProperties` + per-sub-resource pagination params.
5. **OpenAPI regen** — `pnpm generate:api` and commit `packages/shared/src/api-types.ts` (no manual edits).
6. **backend tests** — repository integration tests (Testcontainers, including EXPLAIN ANALYZE on the two aggregations), use case unit tests (including pagination), route integration tests (Supertest) for all five routes including the OP tenant-scope correction.
7. **frontend types & hooks** — `apps/web/src/features/contacts/types/index.ts` + 8 hooks (Properties + Appointments + Timeline hooks all use `enabled` flag for lazy-fetch).
8. **frontend list + drawer + detail page tabs** — components.
9. **frontend form + deactivate** — write/edit/deactivate flows.
10. **frontend router + sidebar wiring**.
11. **frontend tests** — component tests (Vitest + RTL); page integration test (list → drawer → detail navigation); explicit lazy-fetch tests asserting Timeline/Properties/Appointments tabs do NOT call APIs until activated (NFR-103/104).
12. **NFR verification** — produce EXPLAIN ANALYZE artifacts + load-test numbers per NFR-101/102; pin to PR description.
13. **manual QA via Docker** — end-to-end: create / list / search / detail / properties tab / timeline / edit / deactivate / reactivate. OP-scope verification: log in as OP and confirm no Agency selector appears and only own-tenant contacts are returned.
14. **lint, typecheck, build, test (all green)** before opening PR.

## Test strategy

### Backend

- **Unit (use-case)**: list-contacts populates `propertyCount` correctly given a count map; get-contact respects each `include*` option AND parameterized pagination (asserts `appointmentsPage`, `appointmentsPageSize` are honored, default fallbacks work, `pageSize > 100` is rejected).
- **Repo integration (Testcontainers)**:
  - `countDistinctPropertiesByContactIds` returns 0 for unlinked contacts, correct counts otherwise; benchmark with 500 contacts × 10 appointments avg → assert wall-clock under NFR-101 budget.
  - `findPropertiesByContactId` aggregates `is_primary_in_active_appointment` correctly across multiple appointments at the same property (mix of CANCELLED/REJECTED filtered out); benchmark per NFR-102.
- **Routes (Supertest)**: all four roles for list; **AM cross-tenant via `tenantId` query**; **OP tenant-scoped (passes `tenantId` body/query → ignored, scoped to own JWT tenant)** — explicit regression test for FR-105a; CL_USER allowed list, denied write; CL_ADMIN denied cross-tenant; all routes assert `request.routeOptions.schema` is bound (smoke test the OpenAPI surface).

### Frontend

- **Component tests** (Vitest + RTL) for each new component with mocked hooks.
- **Hook tests** for the new hooks using `usePaginatedQuery`/`useDetailQuery`/`useCreateMutation`/`useUpdateMutation` mocks.
- **Page integration test** for `ContactListPage`: render, search, open drawer, click "Open full detail", lands on detail.
- **OP-scope test**: render `ContactListPage` with role=OP; assert that the Agency selector is NOT rendered (FR-105) and that the list query is fired immediately scoped to JWT tenant (no `requiresTenantSelection` path).
- **Lazy-fetch tests** (NFR-103/104): render `ContactDetailPage`, assert that `/v1/contacts/:id?includeAppointments=true` is NOT called until the Appointments tab is activated; same for Properties and Timeline.
- **Sidebar test**: existing `Sidebar.roles.test.tsx` is updated to assert the renamed label and the new Contacts entry.

### Manual QA matrix (local Docker)

| Role | List | Drawer | Page | Properties tab | Timeline | Create | Edit | Deactivate | Reactivate |
|------|------|--------|------|----------------|----------|--------|------|------------|------------|
| AM | ✓ | ✓ | ✓ | ✓ | ✓ raw | ✓ | ✓ | ✓ | ✓ |
| OP | ✓ | ✓ | ✓ | ✓ | ✓ masked | ✓ | ✓ | ✓ | ✓ |
| CL_ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ [MASKED] | ✓ | ✓ | ✓ | ✓ |
| CL_USER | ✓ | ✓ | ✓ | ✓ | ✗ hidden | ✗ | ✗ | ✗ | ✗ |

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `countDistinctPropertiesByContactIds` may underperform with thousands of contacts. | Index already exists on `appointment_contacts(contact_id)`. Aggregation uses `WHERE contact_id = ANY(...)` which uses the index. Validate query plan via EXPLAIN ANALYZE in integration tests; numbers pinned to PR description (NFR-101). |
| Sidebar IA change ("Contacts" → "Tenant Confirmations") could surprise users. | URL kept the same; only the label changes. The new entry sits adjacent. Document in PR description. |
| `findAppointmentsByContactId` change is shape-breaking for any current consumer. | Currently only the contact module consumes it (this is internal to `contact/`). Adding fields is safe; verify no `select`-restricted callers. |
| CL_USER has list access but no write — risk of confused UI if buttons appear. | All write CTAs gated by `canPerform('contact.create' | 'update' | 'deactivate')` — added in this round. |
| **OP scope correction is a behavior change** to 021. May surprise OP users who relied on cross-tenant access in /v1/contacts. | Constitution v1.2.0 explicitly classifies the prior behavior as a bug. The correction is small, isolated to contact routes, and improves multi-tenant safety. Documented in spec FR-105a, plan §4a, and the PR description (with the reference label `correction.op_tenant_scope.contact_routes`). Regression locked by Supertest (T-401). |
| Widening `audit.view` to CL_ADMIN could surprise role-matrix consumers. | The change reflects shipped backend behavior — the matrix was the outdated artifact, not the backend. Update `role-matrix.test.ts` to lock the new contract. No other consumers gate UI on `audit.view` today (verified via grep). |
| OpenAPI regen could collide with unrelated drift in `api-types.ts`. | Run `pnpm generate:api` from a clean develop pull; commit only the `contacts`-related surface changes. If unrelated drift appears, surface it as a separate PR rather than bundling. |

## Out of scope (explicit)

- Bulk operations (deactivate, export, merge).
- AM cross-tenant global search (AM picks a tenant first per FR-105; a future "search across all tenants" affordance is not in scope).
- Searching contacts by linked property fields (GAP-002 — Phase 2).
- Adding `contact.linked_to_appointment` audit events (GAP-001 — Phase 2).
- Modifying the legacy `/tenant-contacts` page itself.
- Inline contact creation flow inside appointment creation (already implemented in `appointments/components/ContactAutocomplete.tsx`).

## Definition of Done

- All FRs satisfied; manual QA passes the matrix above.
- Backend tests green (unit + repo integration + routes).
- Frontend tests green (component + page integration).
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green.
- Docs: this spec + plan committed; `CHANGELOG` line if the project keeps one (verify during impl).
- PR opened to `develop` with the QA matrix in the description.
