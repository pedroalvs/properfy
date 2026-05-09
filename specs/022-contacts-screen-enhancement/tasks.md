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

- [ ] **T-401 [backend]** **OP scope rollback (Constitution v1.3.0 — REV 4)** — Revert the OP-scope hardening shipped after REV 3. In `contact.routes.ts`, treat OP exactly like AM for tenant resolution: both roles read `tenantId` from body/query (cross-tenant). Specific edits:
  - line 109 (POST): widen the resolution branch from `auth.role === 'AM'` to `auth.role === 'AM' || auth.role === 'OP'`.
  - line 241 (GET): same widening.
  - lines 248-249 (GET): keep `query.tenantId` requirement for AM and OP; CL roles continue using `auth.tenantId`.
  - PATCH and POST :id/deactivate: confirm OP is treated like AM (cross-tenant) — apply the same widening if any leftover REV 3 hardening exists.
  Then in the existing tests:
  - `apps/backend/tests/integration/contact/contact-tenant-scope.routes.test.ts` lines 23, 107, 127: REMOVE the "OP role (Constitution v1.2.0...)" tenant-pinned assertion block. ADD a new "OP cross-tenant access (Constitution v1.3.0)" block: OP token with `tenant_id = null` passing `body.tenantId = X` (or `query.tenantId = X`) succeeds and acts on tenant X.
  - `apps/backend/tests/integration/contact/contact.routes.test.ts` line 181: REMOVE the "FR-105a regression: OP cannot escape JWT tenant" test.
  - `apps/backend/tests/integration/contact/create-contact.test.ts` lines 189-193: REMOVE the analogous FR-105a regression block.
  PR reference label: **`constitution.v1_3.op_role_rollback`** (replaces the REV 3 `correction.op_tenant_scope.contact_routes` label). No runtime audit event.
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
- [ ] **T-703 [web]** `ContactListPage.tsx` — widen the role gate to `isCrossTenantRole = hasRole('AM', 'OP')` (Constitution v1.3.0). Specific edits:
  - line 25: replace `isAmRole = hasRole('AM')` with `isCrossTenantRole = hasRole('AM', 'OP')`.
  - line 112 (and any conditional referencing `isAmRole`): rename to `isCrossTenantRole` so the Agency selector + `FilterRequiredState` apply to AM AND OP.
  - `useContactList`: ensure the hook accepts the selected `tenantId` for both roles (no AM-only short-circuit).
  Filters + table + drawer + form unchanged. Test: render with role=AM and role=OP — both see the selector and the `FilterRequiredState` until a tenant is picked. CL_ADMIN/CL_USER still load immediately from JWT.
- [ ] **T-704 [web]** `ContactDetailPage.tsx` — Tabs shell + Overview/Properties/Appointments/Timeline. Each non-Overview tab uses lazy fetch via `enabled` flag tied to active-tab state (NFR-103/104). Test rendering of each tab, CL_USER-hidden Timeline (gated by `audit.view`), and lazy fetch (no API call until tab activated).

## 8. Frontend wiring

- [ ] **T-801 [web]** Register `/contacts` and `/contacts/:id` in `apps/web/src/app/router.tsx` with lazy imports + AuthGuard for the four roles.
- [ ] **T-802 [web]** Update `Sidebar.tsx`: rename existing item to "Tenant Confirmations" (URL unchanged); add new "Contacts" item to `/contacts`.
- [ ] **T-803 [web][test]** Update `Sidebar.test.tsx` and `Sidebar.roles.test.tsx` to assert the new IA.

## 9. End-to-end QA

- [ ] **T-901 [test]** Write a Playwright happy-path scenario covering CL_ADMIN: list → drawer → page → properties tab → timeline tab → edit → deactivate → reactivate.
- [ ] **T-902 [manual]** Execute the QA matrix from `plan.md` locally via Docker for AM, OP, CL_ADMIN, CL_USER. **Special check for OP (REV 4)**: confirm the Agency selector IS rendered, that selecting a tenant loads its contacts, and that an OP token with `tenant_id = null` can read/write contacts in any tenant via `body.tenantId` / `query.tenantId` — exactly like AM (Constitution v1.3.0).
- [ ] **T-903 [perf]** Produce EXPLAIN ANALYZE output for both aggregations (`countDistinctPropertiesByContactIds` and `findPropertiesByContactId`) on a seeded Testcontainers DB with 500 contacts × 10 appointments avg. Capture wall-clock numbers and pin to PR description (NFR-101/102 verification gate).

## 10. Pre-PR

- [ ] **T-1001** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **T-1002** Open PR to `develop` with the QA matrix in the description and the reference label `constitution.v1_3.op_role_rollback` for the OP scope rollback (REV 4).

## 11. Post-QA round 1/2 fixes (REV 4 only)

- [ ] **T-1100 [backend]** **BUG-001 fix — `::uuid` casts on `text` columns.** In `apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts`:
  - line 304 area (`countDistinctPropertiesByContactIds`): replace `${contactIds}::uuid[]` with `${contactIds}::text[]` (or remove the cast entirely if Prisma's `Prisma.sql` already binds `string[]` correctly — verify with `EXPLAIN` after the change).
  - line 343 area (`findPropertiesByContactId`): replace any `::uuid` cast on `contact_id` / `appointment_id` / `property_id` with `::text` to match the deployed `text` column types.
  - line 366 area (`countPropertiesByContactId`): same.
  Verify with `\\d+ contacts` and `\\d+ appointment_contacts` against staging Supabase that the column types are `text`; if any are actually `uuid`, keep the cast for those specific columns only.
- [ ] **T-1101 [backend][test]** Add an integration test for both aggregations (`countDistinctPropertiesByContactIds` and `findPropertiesByContactId`) running against a Postgres image whose column types match the deployed schema. If the local Testcontainers image cannot be aligned, add an explicit type-assertion test (`pg_typeof(contact_id) = 'text'`) that fails fast on a strict-typing regression — so a future drift cannot silently pass 153/153 again.
- [ ] **T-1102 [manual]** After implementing T-1100/T-1101, manually re-run the failing QA scenarios from cycle 1/2: `GET /v1/contacts` (no longer 500), `GET /v1/contacts/:id?includeProperties=true` (no longer 500). Capture before/after curl output and pin to PR.
