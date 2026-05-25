# Tasks: Contacts Cross-Tenant Model (024)

**Feature**: `024-contacts-cross-tenant-model`
**Plan**: `./plan.md` · **Spec**: `./spec.md`
**Branch**: `022-contacts-screen-enhancement` (stacked — same PR; do NOT push until 024 done)
**Predecessors**: 022 REV 4 + 023 REV 5

## Convention

- Tasks are dependency-ordered top-to-bottom.
- `[shared]` `[backend]` `[migration]` `[web]` `[test]` `[constitution]` tags indicate workspace.
- All Postgres casts use `::text` (BUG-001 from 022 — never `::uuid`).
- All commits target `022-contacts-screen-enhancement`. **Do NOT branch off. Do NOT push until 024 complete.**
- 022 + 023 regression guards MUST stay green at every step.

---

## 0. Constitution amendment (commit BEFORE implementation)

- [ ] **T-3-001 [constitution]** Update `.specify/memory/constitution.md`:
  - §II Multi-Tenant Safety: keep AM/OP cross-tenant; add a sentence noting "cross-tenant entities (Inspector, Contact) carry per-tenant visibility via operational junctions — see §RBAC".
  - §RBAC: insert "Cross-tenant entities — visibility on a per-tenant basis" subsection (text in `plan.md` §Constitution v1.4.0 amendment).
  - Bump version to 1.4.0; add Amendment Log entry citing 024 + memory `project_contacts_cross_tenant_model.md`.
  - Note dossier housekeeping (`regras-negocio-respostas-cliente.md` §4 line 510) as a flagged follow-up.

## 1. Shared schemas

- [ ] **T-3-101 [shared]** Update `packages/shared/src/schemas/contact.ts`:
  - `contactResponseSchema.tenantId`: `z.string().uuid().nullable()` (was `z.string().uuid()`).
  - `contactRegistrySchema.tenantId`: confirm already optional + nullable; tighten as needed.
  - `contactListItemSchema`: extends `contactResponseSchema` (still includes `propertyCount` + `primaryInPropertyCount` from 022/023).
  - Update `contact.test.ts` to cover the nullable tenant case.

## 2. Backend Prisma schema

- [ ] **T-3-201 [backend]** Update `apps/backend/prisma/schema.prisma` lines 565 and 577:
  - `tenant_id String?` (nullable).
  - `tenant Tenant? @relation(fields: [tenant_id], references: [id])` (optional).
  - Keep all `@@index([tenant_id, *])` composites — they become hints for AM/OP filtering paths.
  - Update the comment block above the partial unique indexes to read: "Global partial unique indexes managed in 024 migration SQL: `contacts_email_active_unique`, `contacts_phone_active_unique`".
  - Run `pnpm prisma generate` to refresh the client.

## 3. Backend migration

- [ ] **T-3-301 [migration]** Create `apps/backend/prisma/scripts/024-pre-migration-dedup-check.ts` with the queries + JSON report shape from `plan.md` §3. Add a brief README/header comment explaining how to run (`pnpm --filter backend exec tsx prisma/scripts/024-pre-migration-dedup-check.ts`).
- [ ] **T-3-302 [migration]** Generate the Prisma migration: `pnpm --filter backend exec prisma migrate dev --name contacts_cross_tenant --create-only`. Then HAND-EDIT the generated `migration.sql` to:
  1. Prepend the `DO $$ ... RAISE EXCEPTION ... END $$;` dedup guard (full SQL in `plan.md` §2).
  2. Confirm the `ALTER TABLE "contacts" ALTER COLUMN "tenant_id" DROP NOT NULL;` is present.
  3. Append the `DROP INDEX IF EXISTS "contacts_tenant_*_active_unique"` + `CREATE UNIQUE INDEX "contacts_*_active_unique"` block (see `plan.md` §2).
  4. Add a brief header comment: `-- Feature 024: Contact becomes cross-tenant. Aborts if dedup pre-check finds collisions.`
- [ ] **T-3-303 [migration][test]** Verify locally: run `pnpm --filter backend exec tsx prisma/scripts/024-pre-migration-dedup-check.ts` against the dev DB; expect status=CLEAN. Apply migration via `pnpm --filter backend exec prisma migrate deploy`; assert no errors. Verify indexes via `\d+ contacts` on the dev DB.

## 4. Backend repository — visibility filter + scope-aware aggregations

- [ ] **T-3-401 [backend]** Define `ContactScope` type in `apps/backend/src/modules/contact/domain/contact.scope.ts` (NEW): discriminated union per `plan.md` §4.
- [ ] **T-3-402 [backend]** Update `apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts`:
  - `buildWhere(filters, scope)`: insert visibility predicate per `plan.md` §4 (CL: OR of `appointment_contacts.some` + legacy `tenant_id` match; AM/OP with explicit `tenantId`: same OR; AM/OP without explicit: no extra predicate).
  - Aggregation methods (`countDistinctPropertiesByContactIds`, `countPrimaryDistinctPropertiesByContactIds`, `findPropertiesByContactId`, `findAppointmentsByContactId`): accept optional `scopeTenantId?: string`; when present, add `WHERE a.tenant_id = $scopeTenantId` to the join. All casts `::text`.
  - `findById`: drop the `tenantId` filter (visibility is enforced at the use-case level for CL roles via the post-fetch check).
  - `existsByEmail` / `existsByPhone`: drop `tenant_id = ?` filter — global uniqueness now (FR-302 enforced by the partial unique indexes; the use-case-level check is for friendlier error messages).
- [ ] **T-3-403 [backend][test]** Run BUG-001 source-scan locally (`tests/unit/contact/prisma-contact.repository.bug-001.test.ts`): if it now flags any new method, extend the whitelist deliberately in the test (NOT silently in the repo).

## 5. Backend use cases

- [ ] **T-3-501 [backend]** Add `resolveScope(actor, queryTenantId?)` helper to `apps/backend/src/modules/contact/application/use-cases/list-contacts.use-case.ts` per `plan.md` §5. Thread `scope` into `contactRepo.findAll(filters, pagination, scope)` and aggregations.
- [ ] **T-3-502 [backend]** Update `get-contact.use-case.ts`:
  - Resolve scope.
  - For CL roles: after fetching contact, call `contactRepo.existsLinkedToTenant(contactId, auth.tenantId)`; if false, throw `ContactNotFoundError`.
  - When `?includeAppointments=true` / `?includeProperties=true`: pass `scopeTenantId` to the aggregation methods so they filter to `auth.tenantId`.
- [ ] **T-3-503 [backend]** Update `create-contact.use-case.ts`:
  - For AM/OP: `tenantId = input.tenantId ?? null` (allows standalone).
  - For CL_ADMIN: `tenantId = actor.tenantId` (preserves 021 behaviour; body's `tenantId` ignored).
  - Audit emit: `tenantId` (may be null), `metadata: { actor_tenant_id: actor.tenantId ?? null }`.
- [ ] **T-3-504 [backend]** Update `update-contact.use-case.ts`:
  - Audit emit uses the contact's `tenantId` (may be null after 024) + `metadata.actor_tenant_id`.
  - Visibility check: CL roles can update only contacts they can see (operational junction in their tenant) — same `existsLinkedToTenant` check used by get use case.
- [ ] **T-3-505 [backend]** Add repository method `existsLinkedToTenant(contactId, tenantId): Promise<boolean>` to `IContactRepository` and Prisma impl: `SELECT 1 FROM appointment_contacts ac JOIN appointments a ON a.id = ac.appointment_id WHERE ac.contact_id = $1 AND a.tenant_id = $2 LIMIT 1`. Used by get/update/deactivate use cases for CL visibility check.

## 6. Backend routes — Fastify schemas + handler refresh

- [ ] **T-3-601 [backend]** Update `apps/backend/src/modules/contact/interfaces/http/contact.routes.ts`:
  - Response schemas reflect nullable `tenantId` (no wire change beyond null union).
  - Route handlers pass `actor` + `query.tenantId` to use cases (no business logic in route layer).
  - POST handler: AM/OP path accepts `body.tenantId === null` explicitly; CL_ADMIN ignores body.tenantId.
- [ ] **T-3-602 [shared]** Run `pnpm generate:api`. Commit regenerated `packages/shared/src/api-types.ts`. Verify the wire change is only `tenantId: string` → `tenantId: string | null`.

## 7. Backend tests

- [ ] **T-3-701 [test]** Migration test (Testcontainers): seed 3 contacts (no collisions) → run dedup script (status=CLEAN) → apply migration → assert nullable + global indexes via `\d+ contacts`. Then seed 2 colliding emails → run dedup script → expect status=COLLISIONS exit 1 → run migration via `prisma migrate deploy` → expect failure with the dedup-guard message.
- [ ] **T-3-702 [test]** Repository integration: `buildWhere(filters, scope=tenant_pinned)` produces the OR-of-EXISTS-and-legacy clause; `buildWhere(filters, scope=global)` does not add the predicate.
- [ ] **T-3-703 [test]** Aggregation scoping: `countDistinctPropertiesByContactIds` with `scopeTenantId=Y` returns only Y's property count for a contact with appointments in Y and Z.
- [ ] **T-3-704 [test]** Use case unit: `list-contacts.use-case` resolves the right scope per role; `get-contact.use-case` returns 404 for CL_ADMIN(Z) on a contact only in Y; `create-contact.use-case` AM standalone path posts tenant_id=null.
- [ ] **T-3-705 [test]** Routes (Supertest): `GET /v1/contacts` for 4 actors × seeded multi-tenant data → assert visibility per `spec.md` US2; `POST /v1/contacts` AM standalone → 201 with `tenantId: null`; `POST /v1/contacts` AM with duplicate email globally → 400 CONTACT_EMAIL_ALREADY_EXISTS.
- [ ] **T-3-706 [test]** Snapshot regression (extends 023 T-2-407): inquilino updates email via portal in tenant Y appointment → registry updated globally → existing snapshot in tenant Z appointment unchanged.
- [ ] **T-3-707 [test]** Performance: EXPLAIN ANALYZE the EXISTS query for CL_ADMIN under seeded load (500 contacts × 5,000 appointments). Capture wall-clock + plan; pin to PR description (NFR-301 gate).

## 8. Frontend

- [ ] **T-3-801 [web]** Update `apps/web/src/features/contacts/types/index.ts`: `Contact.tenantId: string | null`.
- [ ] **T-3-802 [web]** Update `ContactFormDrawer.tsx`:
  - For AM/OP: tenant selector gains a "(Standalone — no tenant)" sentinel option (value `null`); submitting it posts `tenantId: null`.
  - For CL_ADMIN: hidden — current 023 auto-resolve preserved.
- [ ] **T-3-803 [web]** Update components that render `contact.tenantName` (e.g. detail header) to handle `null` with a "Standalone" label.
- [ ] **T-3-804 [test]** Component tests:
  - `ContactFormDrawer.test.tsx`: role=AM with standalone option → posts tenantId=null. Role=CL_ADMIN → no standalone option visible.
  - `ContactDetailDrawer.test.tsx`: contact with `tenantId=null` renders "Standalone" label.
- [ ] **T-3-805 [test]** Type-check sweep: `pnpm typecheck` catches any consumer that fails to handle `tenantId: string | null`.

## 9. Regression gates (MUST stay green)

- [ ] **T-3-901 [test]** BUG-001 source-scan (`tests/unit/contact/prisma-contact.repository.bug-001.test.ts`) green; whitelist updated deliberately if T-3-402 added new methods.
- [ ] **T-3-902 [test]** BUG-001 `pg_typeof` integration green.
- [ ] **T-3-903 [test]** T-2-907 cross-form contract green.
- [ ] **T-3-904 [test]** BUG-023-001 portal-token whitelist green.
- [ ] **T-3-905 [test]** Constitution v1.3.0 OP cross-tenant Supertest green (still applies — v1.4.0 is additive).
- [ ] **T-3-906 [test]** RelationsTab lazy-fetch test (023 NFR-204) green.
- [ ] **T-3-907 [manual]** Re-run 022 + 023 QA matrices end-to-end.

## 10. End-to-end QA

- [ ] **T-3-1001 [test]** Playwright happy path:
  - CL_ADMIN(Y) creates a contact via inline AppointmentFormDrawer → assert visible in /contacts.
  - AM creates standalone contact with same email → assert 400 CONTACT_EMAIL_ALREADY_EXISTS.
  - AM creates standalone contact with unique email → assert AM sees it; CL_ADMIN(Y) does not.
  - AM creates an appointment in Y linking the standalone contact → CL_ADMIN(Y) now sees it.
- [ ] **T-3-1002 [manual]** Execute the QA matrix from `plan.md` for AM, OP, CL_ADMIN, CL_USER. Capture screenshots for the new standalone option + visibility filter behaviour.

## 11. Pre-PR

- [ ] **T-3-1101** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **T-3-1102** `pnpm generate:api` re-run; `api-types.ts` committed (only contact-related delta).
- [ ] **T-3-1103** Update PR description (existing PR on `022-contacts-screen-enhancement`):
  - Add 024 acceptance criteria (FRs 301-346).
  - Add reference label `refactor.contacts.cross_tenant_model` (next to 022/023 labels).
  - Pin EXPLAIN ANALYZE artifact (T-3-707) for NFR-301.
  - Pin migration timing (T-3-701) for NFR-303.
  - Document the dedup pre-check operational requirement (run `024-pre-migration-dedup-check.ts` before deploy).
  - Note Constitution v1.4.0 amendment landed in this PR.
- [ ] **T-3-1104** Notify reviewer/QA via Guia channel: PR ready for QA cycle 2/2 covering 022 + 023 + 024 consolidated. **Branch NOT pushed yet** — push happens after QA cycle 2/2 passes.
