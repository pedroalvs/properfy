# Implementation Plan: Contacts Cross-Tenant Model (024)

**Feature**: `024-contacts-cross-tenant-model`
**Status**: NEW
**Predecessors**: 022 REV 4 (BUG-001 + Constitution v1.3.0 OP rollback) + 023 REV 5 (UX refactor + bulk re-send)
**Owner**: Arquiteto → Executor
**Branch**: `022-contacts-screen-enhancement` (stacked; do NOT branch off; do NOT push until 024 lands)
**Spec**: `./spec.md` · **User decisions**: `memory/project_contacts_cross_tenant_model.md`

## High-level architecture

Schema-level refactor of `Contact` from tenant-scoped to cross-tenant intrinsically. The change is bounded by three principles:

1. **Expand-only migration in this PR**: `tenant_id` becomes nullable; per-tenant unique indexes are swapped for global ones; existing rows are preserved unchanged. No column is dropped — `tenant_id` stays as a hint/cache for AM/OP filtering convenience and as the audit context for legacy rows.
2. **Visibility is a presentation filter, not a partition**: CL_ADMIN/CL_USER reads scope by `EXISTS via appointment_contacts → appointments.tenant_id`. AM/OP reads are unfiltered. No physical tenant separation is changed.
3. **Snapshot pattern preserved (021 FR-034)**: registry edits never mutate `appointment_contacts.snapshot_*`. The cross-tenant change strengthens the rationale for snapshots — a contact email update never re-leaks to other tenants' historical appointments.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend — schema migration (expand + dedup-gated index swap, single PR)  │
│                                                                            │
│  apps/backend/prisma/schema.prisma                                         │
│   model Contact {                                                          │
│     tenant_id  String?  // was String — now nullable                       │
│     ...                                                                    │
│     tenant     Tenant?   @relation(fields: [tenant_id], references: [id])  │
│     ...                                                                    │
│     // Composite indexes preserved as hints (AM/OP filter path):           │
│     @@index([tenant_id, type])                                             │
│     @@index([tenant_id, is_active])                                        │
│     @@index([tenant_id, display_name])                                     │
│   }                                                                        │
│                                                                            │
│  apps/backend/prisma/migrations/<timestamp>_contacts_cross_tenant/         │
│   migration.sql:                                                           │
│     -- Phase 1: dedup guard (raises if collisions exist)                   │
│     DO $$ BEGIN                                                            │
│       IF EXISTS (                                                          │
│         SELECT primary_email FROM contacts                                 │
│         WHERE is_active = true AND primary_email IS NOT NULL               │
│         GROUP BY primary_email HAVING count(*) > 1                         │
│       ) OR EXISTS (                                                        │
│         SELECT primary_phone FROM contacts                                 │
│         WHERE is_active = true AND primary_phone IS NOT NULL               │
│         GROUP BY primary_phone HAVING count(*) > 1                         │
│       ) THEN                                                               │
│         RAISE EXCEPTION 'Cross-tenant dedup pre-check failed; run         │
│         prisma/scripts/024-pre-migration-dedup-check.ts to inspect';       │
│       END IF;                                                              │
│     END $$;                                                                │
│                                                                            │
│     -- Phase 2: nullable tenant_id                                         │
│     ALTER TABLE "contacts" ALTER COLUMN "tenant_id" DROP NOT NULL;         │
│                                                                            │
│     -- Phase 3: swap unique indexes (per-tenant → global)                  │
│     DROP INDEX IF EXISTS "contacts_tenant_email_active_unique";            │
│     DROP INDEX IF EXISTS "contacts_tenant_phone_active_unique";            │
│     CREATE UNIQUE INDEX "contacts_email_active_unique"                     │
│       ON "contacts" ("primary_email")                                      │
│       WHERE "is_active" = true AND "primary_email" IS NOT NULL;            │
│     CREATE UNIQUE INDEX "contacts_phone_active_unique"                     │
│       ON "contacts" ("primary_phone")                                      │
│       WHERE "is_active" = true AND "primary_phone" IS NOT NULL;            │
│                                                                            │
│  apps/backend/prisma/scripts/024-pre-migration-dedup-check.ts (NEW)        │
│   Standalone TS script that executes the same SELECTs above and exits     │
│   non-zero with a JSON report if collisions exist. Documented in PR body. │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend — repository + use cases (visibility filter for CL roles)        │
│                                                                            │
│  apps/backend/src/modules/contact/infrastructure/                         │
│   prisma-contact.repository.ts                                            │
│     buildWhere(filters, scope):                                           │
│       if (scope.kind === 'tenant_pinned') {                                │
│         where.OR = [                                                       │
│           // Operational reachability (primary path):                      │
│           { appointment_contacts: { some: { appointment: {                 │
│               tenant_id: scope.tenantId } } } },                           │
│           // Legacy backfill safety: contact owned by this tenant          │
│           // (covers 021/022/023 rows with non-null tenant_id              │
│           // pre-024; harmless once all reads converge on EXISTS).         │
│           { tenant_id: scope.tenantId },                                   │
│         ];                                                                 │
│       } // else AM/OP scope: no scope filter; respect explicit             │
│         // tenantId from query if present (current behaviour).             │
│                                                                            │
│     Property/appointment aggregations for CL roles MUST scope to           │
│     a.tenant_id = scope.tenantId inside the SQL aggregations              │
│     (countDistinctPropertiesByContactIds, countPrimary*, find*).          │
│     All casts ::text — BUG-001 regression guard extended.                  │
│                                                                            │
│  apps/backend/src/modules/contact/application/use-cases/                  │
│   list-contacts.use-case.ts                                                │
│     Resolve scope from actor:                                             │
│       AM/OP   → { kind: 'global', explicitTenantId? }                     │
│       CL_*    → { kind: 'tenant_pinned', tenantId: auth.tenantId }        │
│   get-contact.use-case.ts                                                  │
│     Same scope object. CL_*: 404 if no operational junction.              │
│     CL_*: filter included appointments + properties to tenantId.          │
│   create-contact.use-case.ts                                              │
│     AM/OP path: tenantId optional (allows standalone, tenant_id=NULL).    │
│     CL_ADMIN path: tenant_id auto-resolved from auth (current behaviour). │
│     Audit: tenant_id = contact.tenantId or NULL;                          │
│             metadata.actor_tenant_id = auth.tenantId for context.         │
│   update-contact.use-case.ts                                              │
│     Same audit logic: emit with the contact's tenant_id (may be NULL).   │
│                                                                            │
│  apps/backend/src/modules/contact/interfaces/http/contact.routes.ts       │
│     listQuerySchema unchanged at the wire level; route handler resolves   │
│     scope before delegating to use case.                                   │
│     POST/PATCH/POST :id/deactivate handlers updated for nullable tenantId.│
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Shared changes                                                             │
│                                                                            │
│  packages/shared/src/schemas/contact.ts                                    │
│   contactRegistrySchema:                                                   │
│     tenantId: z.string().uuid().nullable().optional()                     │
│   contactResponseSchema:                                                   │
│     tenantId: z.string().uuid().nullable()                                │
│  pnpm generate:api → packages/shared/src/api-types.ts regenerated         │
└──────────────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Frontend changes (minimal — visibility filter is server-side)             │
│                                                                            │
│  apps/web/src/features/contacts/                                           │
│   pages/ContactListPage.tsx                                                │
│     For AM/OP: existing Agency selector behaviour preserved.               │
│     For CL_*: existing JWT-pinned behaviour preserved (the new EXISTS     │
│       filter is server-side; UI does not change).                          │
│   components/ContactFormDrawer.tsx                                         │
│     For AM/OP: tenant select becomes optional (a "Standalone (no tenant)" │
│       option enables tenant_id=null create). For CL_*: hidden, current   │
│       auto-resolve preserved.                                              │
│   types/index.ts                                                           │
│     Contact.tenantId: string | null                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

## Backend changes (detailed)

### 1. Prisma schema mutation

`apps/backend/prisma/schema.prisma` lines 565 and 577:

```prisma
model Contact {
  id                       String            @id @default(uuid())
  tenant_id                String?           // changed from String to String? (nullable)
  type                     ContactType
  // ...other fields unchanged
  tenant                   Tenant?           @relation(fields: [tenant_id], references: [id])  // optional relation
  appointment_contacts     AppointmentContact[]

  // Comments updated to reflect new global uniqueness:
  // - contacts_email_active_unique  (global, replaces tenant-scoped)
  // - contacts_phone_active_unique  (global)
  @@index([tenant_id, type])              // hint for AM/OP filtering
  @@index([tenant_id, is_active])         // hint
  @@index([tenant_id, display_name])      // hint
  @@map("contacts")
}
```

### 2. Migration SQL — single file with dedup guard

`apps/backend/prisma/migrations/<timestamp>_contacts_cross_tenant/migration.sql`:

```sql
-- 024 — Cross-tenant Contact model.
-- Aborts if dedup pre-check finds collisions; user must run
-- prisma/scripts/024-pre-migration-dedup-check.ts and resolve manually.

DO $$
DECLARE
  email_dups bigint;
  phone_dups bigint;
BEGIN
  SELECT count(*) INTO email_dups FROM (
    SELECT primary_email FROM contacts
    WHERE is_active = true AND primary_email IS NOT NULL
    GROUP BY primary_email HAVING count(*) > 1
  ) sub;

  SELECT count(*) INTO phone_dups FROM (
    SELECT primary_phone FROM contacts
    WHERE is_active = true AND primary_phone IS NOT NULL
    GROUP BY primary_phone HAVING count(*) > 1
  ) sub;

  IF email_dups > 0 OR phone_dups > 0 THEN
    RAISE EXCEPTION 'Cross-tenant dedup pre-check failed (% email collisions, % phone collisions). Run prisma/scripts/024-pre-migration-dedup-check.ts for the report and resolve manually before re-applying.', email_dups, phone_dups;
  END IF;
END $$;

-- 1) Make tenant_id nullable.
ALTER TABLE "contacts" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- 2) Swap per-tenant unique indexes for global ones.
DROP INDEX IF EXISTS "contacts_tenant_email_active_unique";
DROP INDEX IF EXISTS "contacts_tenant_phone_active_unique";

CREATE UNIQUE INDEX "contacts_email_active_unique"
  ON "contacts" ("primary_email")
  WHERE "is_active" = true AND "primary_email" IS NOT NULL;

CREATE UNIQUE INDEX "contacts_phone_active_unique"
  ON "contacts" ("primary_phone")
  WHERE "is_active" = true AND "primary_phone" IS NOT NULL;
```

### 3. Pre-migration dedup script

`apps/backend/prisma/scripts/024-pre-migration-dedup-check.ts` (NEW):

```ts
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const emailDups = await prisma.$queryRaw<Array<{ primary_email: string; count: bigint }>>`
    SELECT primary_email, count(*)::bigint AS count FROM contacts
    WHERE is_active = true AND primary_email IS NOT NULL
    GROUP BY primary_email HAVING count(*) > 1
  `;
  const phoneDups = await prisma.$queryRaw<Array<{ primary_phone: string; count: bigint }>>`
    SELECT primary_phone, count(*)::bigint AS count FROM contacts
    WHERE is_active = true AND primary_phone IS NOT NULL
    GROUP BY primary_phone HAVING count(*) > 1
  `;
  const report = {
    emailCollisions: emailDups.map((r) => ({ value: r.primary_email, count: Number(r.count) })),
    phoneCollisions: phoneDups.map((r) => ({ value: r.primary_phone, count: Number(r.count) })),
  };
  if (report.emailCollisions.length === 0 && report.phoneCollisions.length === 0) {
    console.log(JSON.stringify({ status: 'CLEAN', report }, null, 2));
    process.exit(0);
  }
  console.error(JSON.stringify({ status: 'COLLISIONS', report }, null, 2));
  console.error('\nResolve by deactivating one row of each colliding pair (UPDATE contacts SET is_active = false WHERE id = $1) and re-link any open appointments via SQL. Re-run this script until status=CLEAN, then apply the migration.');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
```

Documented in the PR body: "Before applying this migration to staging or prod, run `pnpm --filter backend exec tsx prisma/scripts/024-pre-migration-dedup-check.ts`. If status is COLLISIONS, resolve manually before applying."

### 4. Repository — visibility filter

`apps/backend/src/modules/contact/infrastructure/prisma-contact.repository.ts`:

Introduce a `ContactScope` discriminated union the use case passes down:

```ts
export type ContactScope =
  | { kind: 'global'; explicitTenantId?: string | null }   // AM/OP
  | { kind: 'tenant_pinned'; tenantId: string };           // CL_ADMIN, CL_USER
```

`buildWhere(filters, scope)` inserts the visibility predicate:

```ts
if (scope.kind === 'tenant_pinned') {
  where.OR = [
    { appointment_contacts: { some: { appointment: { tenant_id: scope.tenantId } } } },
    { tenant_id: scope.tenantId },  // legacy backfill safety
  ];
} else if (scope.explicitTenantId !== undefined && scope.explicitTenantId !== null) {
  // AM/OP with explicit tenantId in query (existing behaviour)
  where.OR = [
    { appointment_contacts: { some: { appointment: { tenant_id: scope.explicitTenantId } } } },
    { tenant_id: scope.explicitTenantId },
  ];
}
// AM/OP without explicit tenantId → no scope filter (cross-tenant default).
```

Aggregation methods (`countDistinctPropertiesByContactIds`, `countPrimaryDistinctPropertiesByContactIds`, `findPropertiesByContactId`, `findAppointmentsByContactId`) all gain an optional `scopeTenantId?: string` parameter:

- For `tenant_pinned` scope → pass `auth.tenantId` → aggregations join with `WHERE a.tenant_id = $scopeTenantId` (only count properties/appointments visible to this tenant).
- For `global` scope → no extra predicate.

All Postgres casts continue to be `::text` (BUG-001 regression guard from 022 must stay green; the source-scan whitelist gets extended to the new aggregation paths if the Executor introduces new methods).

### 5. List use case — scope resolution

`apps/backend/src/modules/contact/application/use-cases/list-contacts.use-case.ts`:

```ts
function resolveScope(actor: AuthContext, queryTenantId?: string | null): ContactScope {
  if (actor.role === 'AM' || actor.role === 'OP') {
    return { kind: 'global', explicitTenantId: queryTenantId ?? null };
  }
  return { kind: 'tenant_pinned', tenantId: actor.tenantId! };
}
```

The route handler keeps existing query parsing; it passes `actor` and `query.tenantId` to the use case.

### 6. Get use case — visibility on detail + sub-resources

`get-contact.use-case.ts`:

- AM/OP: behaviour unchanged.
- CL_ADMIN/CL_USER: 
  - `findById(contactId, tenantId=null)` (no row filter at the contact level — the visibility check is below).
  - After fetch: if no `appointment_contacts` join exists for `auth.tenantId`, return `CONTACT_NOT_FOUND` (preserves 021 FR-022 leakage avoidance).
  - When `?includeAppointments=true` / `?includeProperties=true`: pass the scope down so aggregations filter `a.tenant_id = auth.tenantId`.

### 7. Create use case — standalone path for AM/OP; CL_ADMIN unchanged

`create-contact.use-case.ts`:

```ts
async execute(input, actor) {
  const tenantId =
    actor.role === 'AM' || actor.role === 'OP'
      ? (input.tenantId ?? null)         // optional — null = standalone
      : actor.tenantId!;                 // CL_ADMIN: pinned to JWT tenant

  // ...existing validation, uniqueness check (now global per FR-302/310)...

  await this.contactRepo.save({ ...input, tenantId });

  this.auditService.log({
    action: 'contact.created',
    entityType: 'contact',
    entityId: contact.id,
    tenantId,                             // may be null
    metadata: { actor_tenant_id: actor.tenantId ?? null },
    ...
  });
}
```

Same shape applies to `update-contact.use-case.ts` audit emission.

### 8. Routes — Fastify schemas refreshed

`apps/backend/src/modules/contact/interfaces/http/contact.routes.ts`:

The route handlers don't change shape, but the response/body schemas reflect nullable `tenantId`. The wire format is preserved (`tenantId: string | null`). The route delegates scope resolution to the use case — no business logic in the route layer.

### 9. Shared schema updates

`packages/shared/src/schemas/contact.ts`:

```ts
// Already has: contactRegistrySchema with tenantId optional (021 FR-001 path)
// Update contactResponseSchema and contactListItemSchema:
export const contactResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),     // was: z.string().uuid()
  // ...rest unchanged
});

export const contactListItemSchema = contactResponseSchema.extend({
  propertyCount: z.number().int().nonnegative(),
  primaryInPropertyCount: z.number().int().nonnegative(),
});
```

### 10. OpenAPI regen

`pnpm generate:api` → commits regenerated `packages/shared/src/api-types.ts`. The wire change is small (`tenantId` now `string | null` instead of `string`); the regen ensures TS consumers see the union.

## Frontend changes (detailed)

### 1. `ContactListPage.tsx` — no behavioural change

The visibility filter is entirely server-side. The existing AM/OP Agency selector + CL_* JWT-pinned behaviour from 023 stays identical. The new `EXISTS` filter for CL_* is invisible to the UI.

### 2. `ContactFormDrawer.tsx` — standalone option for AM/OP

When the actor is AM or OP, the existing Agency selector in the create flow gains a "(Standalone — no tenant)" sentinel option that posts `tenantId: null`. CL_ADMIN does not see the selector — current 023 behaviour preserved (auto-resolve from JWT).

### 3. `types/index.ts` — nullable tenantId

```ts
export interface Contact {
  id: string;
  tenantId: string | null;     // was: string
  // ...rest unchanged
}
```

Components that render `contact.tenantName` for display (e.g. detail header) handle the `null` case with a "Standalone" label.

### 4. No other UI changes

RelationsTab (023), bulk re-send (023), `AppointmentFormDrawer` inline contact (023): no changes. The cross-tenant model is invisible to these flows.

## Performance strategy — Phase 1 decision

Spec §Non-Goals commits to **composite-indexed EXISTS subquery** for Phase 1. Justification:

- The EXISTS path uses `appointment_contacts(contact_id)` (existing index, verified) + `appointments(tenant_id, *)` (existing composites: `[tenant_id, status]`, `[tenant_id, branch_id]`, etc.) + `properties(tenant_id)` (existing index).
- The 023 branch filter already established the EXISTS pattern; adding tenant filter is a structural twin.
- No trigger code, no materialized view refresh, no denormalized array — least surface area, lowest maintenance cost, easiest to revert.
- NFR-301 budget: < 400 ms p95 for CL_ADMIN at a tenant with up to 500 visible contacts (out of 5,000 platform-wide). EXPLAIN ANALYZE pinned to PR.

**Phase 2 fallback** (NOT in 024): if NFR-301 fails under realistic load, GAP-302 captures the next move — add `contacts.linked_tenant_ids text[]` populated by trigger on `appointment_contacts` mutations, with a `GIN` index. This is a 1-week follow-up spec, not an emergency backstop.

## Build sequence (implementation order)

1. **shared/** — extend `contactResponseSchema` with nullable `tenantId`; extend `contactRegistrySchema` if not already nullable. Update `contact.test.ts` for the new shape.
2. **backend prisma** — schema.prisma `tenant_id String?` + relation optional. Generate Prisma client (`pnpm prisma generate`).
3. **backend migration** — write `migration.sql` with dedup guard + nullable + index swap. Write `prisma/scripts/024-pre-migration-dedup-check.ts`. Verify on local DB: run dedup script (expect CLEAN), apply migration (expect success), assert constraint shape via `\d+ contacts`.
4. **backend repo** — introduce `ContactScope` union; thread through `buildWhere` with EXISTS; extend aggregation methods with optional `scopeTenantId`. Run BUG-001 source-scan locally; if it now flags a method, extend the whitelist deliberately (in the test, not in the repo).
5. **backend use cases** — `resolveScope` helper in list use case; visibility-after-fetch in get use case; standalone create path in create use case; audit emit with nullable `tenantId` + `metadata.actor_tenant_id`.
6. **backend routes** — Fastify response schemas reflect nullable `tenantId`. No new endpoints.
7. **OpenAPI regen** — `pnpm generate:api`; commit `api-types.ts`.
8. **backend tests**:
   - Migration test (Testcontainers): seed with 3 contacts (tenant_id NOT NULL) → run migration → assert nullable + global indexes; seed with 2 colliding emails → run dedup script → expect status=COLLISIONS; seed with no collisions → migration succeeds.
   - Visibility test: 4 actors (AM, OP, CL_ADMIN tenant Y, CL_ADMIN tenant Z) + a contact with appointments only in Y → assert AM/OP see it; CL_ADMIN(Y) sees it; CL_ADMIN(Z) gets CONTACT_NOT_FOUND.
   - Standalone test: AM POST /v1/contacts without tenantId → contact created with tenant_id=NULL; AM GET sees it; CL_ADMIN GET does not.
   - Email global uniqueness test: 2 POSTs with the same email (different actors / tenants) → second gets 400 CONTACT_EMAIL_ALREADY_EXISTS.
   - Aggregation scoping test: a contact with appointments in Y and Z → CL_ADMIN(Y) sees `propertyCount` counting only Y's properties.
   - Performance test: EXPLAIN ANALYZE the EXISTS query under seeded load (500 contacts × 5,000 appointments) → wall-clock pinned to PR (NFR-301 gate).
9. **frontend** — `Contact.tenantId` now nullable; ContactFormDrawer optional standalone for AM/OP; rendering paths for `tenantName` handle null.
10. **frontend tests** — ContactListPage: existing tests must pass unchanged (server-side filter is invisible). New test: ContactFormDrawer with role=AM submitting standalone → posts tenantId=null. Type tests catch any consumer that didn't handle null.
11. **regression — 022/023 must stay green**:
   - BUG-001 source-scan (extend whitelist if new methods)
   - `pg_typeof` integration test
   - T-2-907 cross-form contract
   - BUG-023-001 portal-token whitelist
   - Constitution v1.3.0 OP cross-tenant Supertest
12. **NFR verification** — EXPLAIN ANALYZE artifacts pinned to PR description (NFR-301/302 + migration timing NFR-303).
13. **Playwright happy path** (CL_ADMIN tenant Y): create contact via AppointmentFormDrawer inline (tenant_id auto = Y) → see it in /contacts → AM creates standalone contact with same email → expects 400 → AM creates standalone contact with different email → AM sees it; CL_ADMIN(Y) does not see standalone.
14. **lint, typecheck, build, test** all green.
15. **Stack on existing branch** — push commits to `022-contacts-screen-enhancement`. Update PR description with the consolidated 022+023+024 acceptance criteria, the new reference label `refactor.contacts.cross_tenant_model`, and EXPLAIN ANALYZE artifacts. **Do NOT push the branch until 024 cycle 2/2 QA passes.**

## Test strategy

### Backend

- **Migration** (Testcontainers, custom test using `prisma migrate deploy`):
  - Seed 3 contacts (tenant_id NOT NULL, no email/phone collisions); run migration; assert `\d+ contacts` shows `tenant_id` nullable + `contacts_email_active_unique` global.
  - Seed 2 contacts with the same `primary_email` and `is_active = true`; run migration; assert it raises `Cross-tenant dedup pre-check failed`.
  - Run the dedup script directly against both seeds; assert exit codes (0 / 1).
- **Repository integration** (Testcontainers):
  - Visibility filter (CL scope EXISTS): assert WHERE clause shape via `prisma._engine.config.dataModel.models.contact` introspection OR via end-to-end query with seeded multi-tenant data.
  - Aggregation scoping: `countDistinctPropertiesByContactIds(scope=tenant_pinned, scopeTenantId=Y)` returns counts only for tenant Y's properties.
- **Use case unit**:
  - `list-contacts.use-case`: scope resolution per role.
  - `get-contact.use-case`: CL_ADMIN gets 404 when no junction in their tenant.
  - `create-contact.use-case`: AM standalone path (`tenantId=null`); CL_ADMIN ignores body `tenantId`.
- **Routes (Supertest)**:
  - 4 actors × `GET /v1/contacts` × seeded multi-tenant data → expected visibility.
  - `POST /v1/contacts` (AM, standalone) → 201 with `tenantId: null` in response.
  - `POST /v1/contacts` (AM, duplicate email globally) → 400 CONTACT_EMAIL_ALREADY_EXISTS.
  - `GET /v1/contacts/:id` (CL_ADMIN(Y), contact only in Z) → 404.
- **Performance (EXPLAIN ANALYZE)**:
  - The EXISTS query for CL_ADMIN with seeded load. Wall-clock < NFR-301 budget. Report pinned to PR.

### Frontend

- **Component**:
  - `ContactFormDrawer.test.tsx`: role=AM with standalone option → submits tenantId=null. Role=CL_ADMIN → no standalone option visible.
  - `ContactDetailDrawer.test.tsx`: contact with `tenantId=null` renders "Standalone" label instead of tenant name.
- **Page integration**:
  - Existing `ContactListPage` tests pass unchanged.
- **Type test**:
  - TypeScript compilation catches any consumer that fails to handle `tenantId: string | null` after the type widening.

### Manual QA matrix

| Role | List w/ visibility | Standalone create | Email global unique | Aggregation scoping |
|------|-------------------|-------------------|---------------------|---------------------|
| AM | ✓ all | ✓ | ✓ enforced | n/a (no scope filter) |
| OP | ✓ all | ✓ | ✓ enforced | n/a (no scope filter) |
| CL_ADMIN | ✓ filtered (own tenant junctions) | ✗ (auto-resolve) | ✓ enforced | ✓ scoped |
| CL_USER | ✓ filtered | ✗ (cannot create per 022) | n/a | ✓ scoped |

### Regression gates (022/023 stay green)

- BUG-001 source-scan: must remain green; extend whitelist deliberately if 024 introduces new repository methods that need auditing.
- BUG-001 `pg_typeof` integration: green.
- T-2-907 cross-form contract: green.
- BUG-023-001 portal-token whitelist: green.
- Constitution v1.3.0 OP cross-tenant Supertest: green.
- Lazy-fetch invariants on RelationsTab: green (server-side change only).

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Dedup pre-check finds collisions in staging — migration aborts. | The script + `RAISE EXCEPTION` are intentional fail-fast. User runs the script locally first; resolves manually (deactivate one of each pair, re-link open appointments via SQL). 20+ contacts in current data set → low collision probability, but the safety net is the point. |
| EXISTS subquery underperforms under realistic load. | NFR-301 EXPLAIN ANALYZE budget pinned to PR; index coverage verified at planning time (appointment_contacts.contact_id, appointments composites, properties.tenant_id). Phase 2 fallback (GAP-302: trigger-maintained `linked_tenant_ids` cache) is documented but out of scope. |
| Visibility filter inadvertently leaks cross-tenant data through an aggregation. | Every aggregation method gains `scopeTenantId` and a corresponding test asserting the scoping. The CL_ADMIN(Z) → CONTACT_NOT_FOUND test (US2 AC4) is the canary. |
| Audit `tenant_id = null` for standalone surprises consumers expecting NOT NULL. | `audit_logs.tenant_id` is already nullable in the schema (verified). Audit reader UI may need to render "Platform-wide / Standalone" for null. Add a small frontend test if the audit-log feature has a tenant column. |
| Snapshot pattern mistakenly assumed broken by cross-tenant write. | Spec FR-345 + regression test (extends T-2-407): inquilino updates email via portal → registry updated globally → existing snapshots in OTHER tenants unchanged. |
| Constitution v1.4.0 amendment text is forgotten. | The amendment is a separate file edit (`.specify/memory/constitution.md`); it MUST be in the same commit as the implementation. Listed in Build sequence step 7-bis (insert before regen step). |
| `tenant_id` column drift: kept as a hint but reads no longer use it as the primary filter. Could become stale or misleading. | Documented as a hint/cache only; legacy backfill safety relies on it (see repo `where.OR` clause). A future spec may drop the column entirely once all reads have migrated; tracked under Phase 2 follow-up if useful. |

## Out of scope (explicit)

- Dropping `tenant_id` column entirely (kept as hint/cache for AM/OP filtering convenience and as audit context for legacy rows).
- Materialized view, trigger-maintained cache, denormalized `linked_tenant_ids` (Phase 2 — GAP-302).
- Contact merge UI (GAP-301).
- Standalone orphan janitor (GAP-304).
- Dossier housekeeping annotation (GAP-305).
- Renaming the branch (cosmetic).

## Constitution v1.4.0 amendment (text proposal)

Insert under §RBAC Tenant scope rule, after the OP row:

> **Cross-tenant entities — visibility on a per-tenant basis**: when a global entity (Inspector, Contact) is reachable from a tenant via an operational junction (`inspectors.client_eligibility_json`, `appointment_contacts → appointments`), it is visible to that tenant's CL_ADMIN/CL_USER. AM and OP see all rows regardless of junction. Standalone (junction-less) rows are visible only to AM and OP until linked.

Amendment Log entry:

> **v1.4.0 (2026-05-09)**: §RBAC clarified to formalize per-tenant visibility on cross-tenant entities (Inspector + Contact). Driver: feature 024 cross-tenant Contact model; user decisions in `memory/project_contacts_cross_tenant_model.md`. Dossier housekeeping (`regras-negocio-respostas-cliente.md` §4 line 510 cardinality 1:1) flagged for follow-up; not blocking.

## Definition of Done

- All FRs (301-346) satisfied; manual QA matrix green.
- Backend tests green: migration + repo + use case + routes; new visibility tests; new standalone tests; new global-uniqueness test.
- BUG-001 source-scan whitelist updated and green; `pg_typeof` integration green.
- 022 + 023 regression gates green (T-2-907, BUG-023-001, Constitution v1.3.0).
- Frontend type-check green; ContactFormDrawer standalone option for AM/OP.
- `pnpm generate:api` re-run; `api-types.ts` reflects nullable `tenantId`.
- Constitution v1.4.0 amendment landed in the same commit as the implementation.
- EXPLAIN ANALYZE pinned to PR description (NFR-301/302) + migration timing (NFR-303).
- PR description updated with consolidated 022+023+024 acceptance criteria + reference label `refactor.contacts.cross_tenant_model`.
- Branch NOT pushed until QA cycle 2/2 passes.
