# Implementation Plan: Property Files & Issues — Backend & Shared Foundation

**Branch**: `075-f10-1-property-files-backend` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/075-f10-1-property-files-backend/spec.md`

## Summary

Build the backend + shared foundation for the property-centred file repository and issue log (contract **C.1–C.9**, **C.A1–C.A5**, + the "Issues" additive). Two tenant-scoped tables (`property_files`, `property_issues`) ship in one expand-only migration. A single cohesive backend module (`property-file`) houses both aggregates (issue photos *are* property files, and issue creation is a cross-table transaction). Files use a **presign → confirm** flow: presign validates the declared MIME and persists a `PENDING` row; confirm reads a byte prefix from storage, sniffs the real MIME with `file-type`, enforces `sizeBytes ≤ maxFileSizeMb`, and flips to `READY` (C.A5). Issue creation links already-confirmed `PENDING` photos atomically (D20, all-or-nothing → 409). Mark-as-seen is a CAS (D23); versioning relies on `UNIQUE(version_group_id, version)` + 23505 retry. Access is tenant-scoped with cross-tenant → **404** (C.A2); OP is cross-tenant (constitution v1.3.0), CL pinned, INSP gated by the existing T-1 visibility predicate (D28), CL_USER read-only. Config lives in one `propertyFiles` platform-settings key; a daily pg-boss job purges deleted, over-retention, and orphaned-`PENDING` objects from storage (D22). Existing `GET /v1/appointments`, `/v1/properties` (+ their `:id` details) gain `hasUnseenIssues` / `fileCounts` / a `withIssues` filter, so `openapi.json` + `api-types.ts` are regenerated for TASK-F10-2/3/4. Nine role-matrix actions are appended.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24 (CI; sandbox runs v26 — engine warning only, keep ICU/date drift in mind)
**Primary Dependencies**: Fastify 4, Prisma 6 (`$transaction`, `$queryRaw` with `Prisma.sql`), Zod 3, pg-boss 9, `file-type` (ESM, magic-byte sniff), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (existing storage adapter), `@properfy/shared`
**Storage**: PostgreSQL (Supabase); Supabase Storage (S3-compatible) private bucket `inspection-assets` (reused, D10). Two new tables, one migration, expand-only
**Testing**: Vitest (unit), Supertest (route integration), testcontainers (real-DB integration suite `vitest.integration-db.config.ts` — used for the DB-dependent transaction/retention/RBAC paths)
**Target Platform**: Linux server (Fly.io), stateless API + pg-boss workers
**Project Type**: Monorepo web service — backend (`apps/backend`) + shared contract (`packages/shared`). Web/PWA/portal consumers are TASK-F10-2/3/4, out of this plan
**Performance Goals**: Indicator reads (`hasUnseenIssues`, unseen-count) run on list screens → served by partial indexes, batched one query per page (no N+1), mirroring the `inspectorIssue` enrichment. Confirm reads only a ≤ ~16 KB byte prefix for the sniff, not the whole object
**Constraints**: Cross-tenant access MUST return 404 (never 403, never reveal existence); real MIME + size validated at confirm; mark-as-seen and versioning are race-safe; `Idempotency-Key` on confirm + create-issue; append-only to role-matrix + settings-registry (parallel with TASK-F07-1); one migration (timestamp regenerated on rebase); Sydney-only timezone for the retention job
**Scale/Scope**: One backend module + edits to the appointment/property modules, shared schemas/constants/matrix, one migration, one worker; ~70–90 changed files (verify `< 150` before PR)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | PASS | New module `property-file` with `domain/` (entities, repository ports, errors, storage-key re-export), `application/use-cases/*`, `infrastructure/prisma-*.repository.ts`, `interfaces/*.routes.ts`. Dependencies point inward. The storage sniff uses the existing `IStorageService` port (extended with a read-prefix method, not moved — D11). Cross-table create-issue transaction stays inside the one module. |
| II. Multi-Tenant Safety | PASS | `property_files`/`property_issues` carry `tenant_id` (D5). Scope via `requireTenantScope` (OP cross-tenant, v1.3.0) / `assertTenantScope` (CL pinned); cross-tenant → `NotFoundError` (404). INSP via existing T-1 predicate (D28); CL_USER read-only. Mutations audited (`property_file.uploaded/.version_added/.deleted/.purged`, `property_issue.created/.seen/.deleted`) with the entity's `tenantId`. `Idempotency-Key` on confirm + create-issue (D24). No inspector coordinates are stored on these entities (no coordinate-leak surface). |
| III. TDD | PASS | Red-green-refactor: shared schema/constant/matrix unit tests; domain unit tests (relaxed CHECK via a thin validator, storage-key grammar, MIME-compatibility, version-race retry logic); use-case unit tests with fakes; real-DB integration tests (the D20 transaction, CAS, retention job, RBAC 404, `withIssues` filter) since they need real Postgres; route integration tests. Tests written first. |
| IV. Contract-First APIs | PASS | Zod schemas in `packages/shared/src/schemas/` (new `property-files.ts`; `responses.ts` extended with `hasUnseenIssues`/`fileCounts`), imported by routes; `openapi.json` + `api-types.ts` regenerated and committed; error envelope `{ error: { code, message, details } }`; `/v1` prefix; camelCase; `request_id` via existing middleware. Additive (expand) only. |
| V. Simplicity & Minimal Impact | PASS | Reuses `IStorageService`, `require-tenant-scope`, the platform-settings registry + reader service, the role-matrix, the `publish-inspector-notice` idempotency shape, the `expire-files` retention worker shape, the `inspectorIssue` batched-enrichment pattern, and `T1VisibilityService`. New code limited to the two aggregates, their routes, the retention worker, and the one port method the magic-byte sniff requires. Existing dashboards untouched. |

**Knowledge classification**: The file/issue behavior and C.A1–C.A5 are **APPROVED RULES** (F10 client decisions 2026-10-30 + validation 2026-11-07, D1–D29). The `IStorageService` port, `inspection-assets` bucket, `inspector_field_events` table (FK target, F03-2), the `platform_settings` registry (F03-1) and `T1VisibilityService` are **IMPLEMENTED REALITY**. The stale `InspectionAsset` docs are corrected, not treated as reality. No FUTURE GAP is promoted into code.

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/075-f10-1-property-files-backend/
├── plan.md              # This file
├── research.md          # Phase 0 output (decisions R1–R16)
├── data-model.md        # Phase 1 output (two tables, enums, constraints, indexes, transitions)
├── quickstart.md        # Phase 1 output (verify C.A1–C.A5 + additive)
├── contracts/           # Phase 1 output (property-files-and-issues-api.md)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/
│   ├── property-files.ts            # NEW: presign/confirm/list/download/issue schemas, query filters, payload fragments
│   ├── property-files.test.ts       # NEW: schema validation + constant tests
│   ├── platform-settings.ts         # MODIFY (APPEND): propertyFiles key (6-field Zod object, section 'Property files')
│   ├── platform-settings.test.ts    # MODIFY: assert propertyFiles defaults/bounds
│   ├── responses.ts                 # MODIFY: appointment/property list + detail → hasUnseenIssues, fileCounts
│   └── index.ts                     # MODIFY: export property-files module
├── constants/
│   └── property-files.ts            # NEW: PORTAL_MAX_PHOTOS_PER_ISSUE=5, FILE_STORAGE_UNAVAILABLE_MESSAGE, storage-key builders
│   └── property-files.test.ts       # NEW: buildPropertyFileStorageKey/buildPortalIssueStorageKey grammar
├── permissions/
│   ├── role-matrix.ts               # MODIFY (APPEND): 8 property_file.*/property_issue.* actions
│   └── role-matrix.test.ts          # MODIFY: assert the new actions' roles
└── api-types.ts                     # REGEN (pnpm generate:api)

packages/shared/openapi.json         # REGEN (pnpm generate:api)

apps/backend/prisma/
├── schema.prisma                    # MODIFY: models PropertyFile, PropertyIssue + relations/enums
└── migrations/<ts>_property_files_and_issues/migration.sql  # NEW: 2 tables, relaxed CHECK (D20), UNIQUEs, partial indexes (raw SQL)

apps/backend/src/
├── modules/property-file/
│   ├── domain/
│   │   ├── property-file.entity.ts            # NEW
│   │   ├── property-issue.entity.ts           # NEW
│   │   ├── property-file.repository.ts        # NEW: IPropertyFileRepository port (tx-aware)
│   │   ├── property-issue.repository.ts       # NEW: IPropertyIssueRepository port (tx-aware)
│   │   ├── property-file.errors.ts            # NEW: NotFound/InvalidKey/Mime/Size/PhotoLink(409) errors
│   │   └── mime-compatibility.ts              # NEW: isDetectedMimeCompatible(declared, detected) (OOXML↔zip)
│   ├── application/use-cases/
│   │   ├── presign-property-file-upload.use-case.ts        # NEW
│   │   ├── confirm-property-file-upload.use-case.ts        # NEW (Idempotency-Key)
│   │   ├── list-property-files.use-case.ts                 # NEW (T-1 for INSP)
│   │   ├── get-property-file-download-url.use-case.ts      # NEW (TTL 5 min)
│   │   ├── add-property-file-version.use-case.ts           # NEW (23505 retry)
│   │   ├── delete-property-file.use-case.ts                # NEW (AM/OP)
│   │   ├── create-property-issue.use-case.ts               # NEW (D20 tx, Idempotency-Key)
│   │   ├── mark-property-issue-seen.use-case.ts            # NEW (CAS D23)
│   │   ├── delete-property-issue.use-case.ts               # NEW (AM/OP)
│   │   ├── list-property-issues.use-case.ts                # NEW (T-1 for INSP)
│   │   └── count-unseen-property-issues.use-case.ts        # NEW (AM/OP/CL_ADMIN)
│   ├── infrastructure/
│   │   ├── prisma-property-file.repository.ts  # NEW
│   │   ├── prisma-property-issue.repository.ts # NEW
│   │   └── workers/property-file-retention.worker.ts  # NEW (mirror expire-files)
│   └── interfaces/
│       ├── property-file.routes.ts             # NEW
│       └── property-issue.routes.ts            # NEW
├── modules/inspector-execution/
│   ├── domain/storage.service.ts               # MODIFY: add getObjectBytes(bucket,key,maxBytes) to IStorageService
│   └── infrastructure/{supabase-storage.service.ts, unconfigured-storage.service.ts}  # MODIFY: implement/throw
├── modules/appointment/
│   ├── application/use-cases/{list-appointments,get-appointment}.use-case.ts  # MODIFY: hasUnseenIssues (list), fileCounts (detail), withIssues
│   ├── infrastructure/prisma-appointment.repository.ts  # MODIFY: withIssues in buildWhere
│   └── interfaces/appointment.routes.ts        # MODIFY: withIssues query param
├── modules/property/
│   ├── application/use-cases/{list-property,get-property}.use-case.ts  # MODIFY: hasUnseenIssues, fileCounts, withIssues
│   ├── infrastructure/prisma-property.repository.ts    # MODIFY: withIssues in buildWhere
│   └── interfaces/property.routes.ts           # MODIFY: withIssues query param
├── main/
│   ├── container.ts                 # MODIFY: propertyFile repos/use cases + route container; inject count/file deps into appt/property use cases
│   ├── routes.ts                    # MODIFY: registerPropertyFileRoutes + registerPropertyIssueRoutes
│   ├── workers.ts                   # MODIFY: schedule+work property-file.retention
│   └── server.ts                    # MODIFY: pass retention deps to registerWorkers (new positional arg)
└── (apps/backend/CLAUDE.md, packages/shared/CLAUDE.md, root CLAUDE.md "Active Technologies")  # MODIFY

apps/backend/tests/
├── unit/property-file/             # NEW: use-case + domain unit tests (fakes/stubs)
├── unit/appointment/{list,get}-appointments.use-case.test.ts  # MODIFY: new output shape + injected dep
├── unit/property/{list,get}-property.use-case.test.ts         # MODIFY: new output shape + injected dep
├── unit/workers.test.ts            # MODIFY: worker count/schedule
├── integration/db/property-file*.integration.test.ts  # NEW: D20 tx, CAS, retention, RBAC 404, withIssues, C.A1/A3/A4/A5 (testcontainers)
├── integration/property-file/*.routes.test.ts         # NEW: route RBAC + presign→confirm (storage stub)
└── helpers/mock-container.ts       # MODIFY: propertyFile container keys + appt/property injected deps

apps/backend/src/main/__tests__/workers.test.ts  # MODIFY: EXPECTED_SCHEDULES + registerWorkers arity

docs/
├── database-schema.md              # MODIFY: remove stale InspectionAsset, add property_files/property_issues
├── runbooks/inspection-asset-retention.md  # MODIFY/REMOVE (stale) + document property-file retention job
└── (specs/008-* InspectionAsset references)  # MODIFY: correct stale mentions
```

**Structure Decision**: Monorepo web service. A single new backend module `property-file` owns both the `PropertyFile` and `PropertyIssue` aggregates — they are one bounded context (issue photos are property files, and `CreatePropertyIssueUseCase` is a single cross-table transaction), so splitting them into two modules would force a cross-module transactional dependency for no benefit. The task's logical "property-files" and "property-issues" use-case groupings are realized as sibling files under the module's `application/use-cases/`. The Zod contract lives in `packages/shared`. The appointment/property modules are edited only to add the payload enrichment and filter. The `IStorageService` port is extended in place (not moved — D11).

## Complexity Tracking

> No constitution violations. Section intentionally empty.
