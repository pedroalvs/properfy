# Tasks: Contacts Screen Enhancement

**Feature**: `022-contacts-screen-enhancement`
**Plan**: `./plan.md` · **Spec**: `./spec.md`
**Branch**: `022-contacts-screen-enhancement`

## Convention
- Tasks are dependency-ordered top-to-bottom.
- `[shared]` `[backend]` `[web]` `[test]` tags indicate workspace.
- Tests are written next to (or before) the implementation file per TDD.
- Each task is small enough to implement and test in isolation.

## 1. Shared schemas + permission keys

- [ ] **T-101 [shared]** Add `contactResponseSchema` (canonical detail/payload), `contactListItemSchema` (extends with `propertyCount`), `contactAppointmentItemSchema` (with `isPrimary` + `propertyId` + `propertyCode`), and `contactPropertyAggregateSchema` to `packages/shared/src/schemas/contact.ts`. Update `contact.test.ts` for new shapes. The single canonical name `contactResponseSchema` MUST be used by all single-contact routes; do not introduce alternate names like `contactDetailSchema`.
- [ ] **T-102 [shared]** Add `contact.list`, `contact.create`, `contact.update`, `contact.deactivate` to `packages/shared/src/permissions/role-matrix.ts`. Extend `role-matrix.test.ts` accordingly. **Do NOT** introduce `contact.read_audit`.
- [ ] **T-103 [shared]** Widen `audit.view` matrix entry from `['AM', 'OP']` to `['AM', 'OP', 'CL_ADMIN']` to match shipped backend behavior in `ListAuditLogsUseCase`. Update `role-matrix.test.ts`.

## 2. Backend domain & repository

- [ ] **T-201 [backend]** Extend `IContactRepository` with `countDistinctPropertiesByContactIds`, `findPropertiesByContactId`, `countPropertiesByContactId`. Define `ContactPropertyAggregate` interface. Update `findAppointmentsByContactId` return type to include `isPrimary` and `propertyId`.
- [ ] **T-202 [backend]** Implement raw-SQL aggregation in `PrismaContactRepository`. Add Testcontainers integration test covering: 0-property contact, multi-property contact, mix of CANCELLED/REJECTED filtered out of `is_primary_in_active_appointment`.
- [ ] **T-203 [backend]** Update `findAppointmentsByContactId` Prisma query to also project `is_primary` and `property_id`.

## 3. Backend application

- [ ] **T-301 [backend]** Update `ListContactsUseCase` to call `countDistinctPropertiesByContactIds(ids)` and merge counts into output DTO. Add a unit test for hydration.
- [ ] **T-302 [backend]** Update `GetContactUseCase` signature to `execute(contactId, tenantId, options: GetContactOptions = {})` where `GetContactOptions` includes `includeAppointments`, `appointmentsPagination`, `includeProperties`, `propertiesPagination`. Defaults: page=1, pageSize=20 each; max 100 enforced at route layer. Update result shape to include `pagination` per sub-resource. Add unit tests for: each include flag, default pagination, custom pagination, page-size cap rejection.

## 4. Backend interfaces

- [ ] **T-401 [backend]** **OP tenant-scope correction (Constitution v1.2.0)** — Update `contact.routes.ts` so all five routes (POST, PATCH, POST :id/deactivate, GET list, GET :id) treat OP exactly like CL_ADMIN: ignore any `tenantId` from body or query and always use `auth.tenantId`. Only AM resolves tenant from input. **No runtime audit event** — document the correction in the PR description with the reference label `correction.op_tenant_scope.contact_routes`. Add Supertest regression: OP passes `body.tenantId = X` while logged in for tenant Y → operation acts on Y, not X.
- [ ] **T-402 [backend]** Add Fastify `schema:` to all five `/v1/contacts*` routes (mirror property routes pattern): `querystring` / `body` / `params` / `response: { 200/201: ... }`. Use `paginatedResponseSchema(contactListItemSchema)` for list and `successResponseSchema(contactResponseSchema)` for detail/create/update/deactivate. Use the canonical name `contactResponseSchema` per T-101.
- [ ] **T-403 [backend]** Update `contact.routes.ts`: `formatListItem` accepts `propertyCount`; controller threads the map. Parse `includeProperties`, `appointmentsPage/Size`, `propertiesPage/Size` from `GET /v1/contacts/:id` query (Zod validation: min 1, max 100).
- [ ] **T-404 [backend][test]** Supertest cases for: `GET /v1/contacts` returns `propertyCount` per item; `GET /v1/contacts/:id?includeProperties=true&propertiesPageSize=5` returns paginated `properties.data` + `properties.pagination`; same for appointments; OP scope correction (T-401); page-size cap returns 400.
- [ ] **T-405 [shared]** Run `pnpm generate:api` (calls `pnpm --filter backend generate:openapi && pnpm --filter shared generate:types`). Commit the regenerated `packages/shared/src/api-types.ts` with only contact-related changes. If unrelated drift surfaces, raise as separate PR per plan.md mitigation.

## 5. Frontend types & hooks

- [ ] **T-501 [web]** Create `apps/web/src/features/contacts/types/index.ts` with `Contact`, `ContactDetail`, `ContactListItem`, `ContactAppointmentItem`, `ContactPropertyAggregate`, `ContactFiltersState`, `EMPTY_CONTACT_FORM`, `ContactFormData`, `ContactFormErrors`, `DEFAULT_FILTERS`.
- [ ] **T-502 [web]** Create `useContactList(tenantIdOverride?)` (`usePaginatedQuery` against `/v1/contacts`). Test stub.
- [ ] **T-503 [web]** Create `useContactDetail(contactId | null)` (`useDetailQuery` against `/v1/contacts/:id?includeProperties=false&includeAppointments=false`). Test stub.
- [ ] **T-504 [web]** Create `useContactProperties(contactId)` (paginated detail call with `includeProperties=true`). Test stub.
- [ ] **T-505 [web]** Create `useContactAppointments(contactId)` (paginated detail call with `includeAppointments=true`). Test stub.
- [ ] **T-506 [web]** Create `useContactTimeline(contactId)` (paginated `/v1/audit-logs?entityType=contact&entityId=:id`). Test stub.
- [ ] **T-507 [web]** Create `useContactSave()` (POST + PATCH via `useCreateMutation` / `useUpdateMutation`). Test stub.
- [ ] **T-508 [web]** Create `useContactDeactivate()` (`useCreateMutation('/v1/contacts/:id/deactivate')`). Test stub.

## 6. Frontend leaf components

- [ ] **T-601 [web]** `ContactTypeChip.tsx` — chip per `ContactType` with color mapping (mirror `PropertyTypeChip`). Test.
- [ ] **T-602 [web]** `ContactStatusBadge.tsx` — Active/Inactive badge. Test.
- [ ] **T-603 [web]** `ContactFilters.tsx` — debounced search + type select + active select (mirror `PropertyFilters`). Test.
- [ ] **T-604 [web]** `ContactTable.tsx` — DataTable with the column set from FR-102. Test with mock data.
- [ ] **T-605 [web]** `ContactDetailSections.tsx` — Overview body (data sections like `PropertyDetailSections`). Test.
- [ ] **T-606 [web]** `ContactPropertiesTab.tsx` — DataTable + isPrimary chip + click-to-property. Test.
- [ ] **T-607 [web]** `ContactAppointmentsTab.tsx` — Mirror `PropertyAppointmentsTab`. Test.
- [ ] **T-608 [web]** `ContactTimelineTab.tsx` — Vertical timeline of audit entries. Test.
- [ ] **T-609 [web]** `DeactivateContactModal.tsx` — `ConfirmDialog`. Test.

## 7. Frontend forms / drawers / pages

- [ ] **T-701 [web]** `ContactFormDrawer.tsx` — Create + Edit modes; dynamic additional channels list; surface API error codes; show registry-vs-snapshot note in edit mode. Test create + edit + error mapping.
- [ ] **T-702 [web]** `ContactDetailDrawer.tsx` — Drawer wrapping `ContactDetailSections` + Edit/Deactivate row actions + "Open full detail" button. Test.
- [ ] **T-703 [web]** `ContactListPage.tsx` — Agency selector visible **only for AM** (per FR-105 + Constitution v1.2.0); OP/CL_ADMIN/CL_USER all use the JWT tenant directly with no selector. Filters + table + drawer + form. Test that AM sees the selector and OP does NOT.
- [ ] **T-704 [web]** `ContactDetailPage.tsx` — Tabs shell + Overview/Properties/Appointments/Timeline. Each non-Overview tab uses lazy fetch via `enabled` flag tied to active-tab state (NFR-103/104). Test rendering of each tab, CL_USER-hidden Timeline (gated by `audit.view`), and lazy fetch (no API call until tab activated).

## 8. Frontend wiring

- [ ] **T-801 [web]** Register `/contacts` and `/contacts/:id` in `apps/web/src/app/router.tsx` with lazy imports + AuthGuard for the four roles.
- [ ] **T-802 [web]** Update `Sidebar.tsx`: rename existing item to "Tenant Confirmations" (URL unchanged); add new "Contacts" item to `/contacts`.
- [ ] **T-803 [web][test]** Update `Sidebar.test.tsx` and `Sidebar.roles.test.tsx` to assert the new IA.

## 9. End-to-end QA

- [ ] **T-901 [test]** Write a Playwright happy-path scenario covering CL_ADMIN: list → drawer → page → properties tab → timeline tab → edit → deactivate → reactivate.
- [ ] **T-902 [manual]** Execute the QA matrix from `plan.md` locally via Docker for AM, OP, CL_ADMIN, CL_USER. **Special check for OP**: confirm no Agency selector appears and only own-tenant contacts are returned (FR-105 + FR-105a regression).
- [ ] **T-903 [perf]** Produce EXPLAIN ANALYZE output for both aggregations (`countDistinctPropertiesByContactIds` and `findPropertiesByContactId`) on a seeded Testcontainers DB with 500 contacts × 10 appointments avg. Capture wall-clock numbers and pin to PR description (NFR-101/102 verification gate).

## 10. Pre-PR

- [ ] **T-1001** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **T-1002** Open PR to `develop` with the QA matrix in the description.
