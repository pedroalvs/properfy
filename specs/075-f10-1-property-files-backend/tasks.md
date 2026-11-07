---
description: "Task list — Property Files & Issues backend/shared (TASK-F10-1)"
---

# Tasks: Property Files & Issues — Backend & Shared Foundation

**Input**: Design documents from `/specs/075-f10-1-property-files-backend/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — TDD is mandatory (constitution III, CLAUDE.md §11). Write each test first and watch it fail before implementing.

**Organization**: By user story (US1–US5 from spec.md). One PR; the stories are the review/verification slices, not separate PRs.

**Paths**: backend = `apps/backend`, shared = `packages/shared`. All absolute under the worktree root `/Users/pedro/Code/GitHub/properfy/.claude/worktrees/f10-1-property-files`.

## Phase 1: Setup

- [ ] T001 Worktree baseline is green (install, prisma generate, shared + frontend-standards build, backend/shared typecheck+lint) — already verified by the setup agent; re-run `pnpm --filter backend prisma:generate` after any schema edit.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: every user story depends on these. Complete before Phase 3.

### Shared contract (append-only; parallel-safe with TASK-F07-1)

- [ ] T002 [P] Write `packages/shared/src/constants/property-files.test.ts` (RED): `buildPropertyFileStorageKey` → `files/{tenantId}/{propertyId}/{fileId}.{ext}`, `buildPortalIssueStorageKey` → `files/{tenantId}/tenant-issues/{appointmentId}/{fileId}.{ext}`, `PORTAL_MAX_PHOTOS_PER_ISSUE === 5`, `FILE_STORAGE_UNAVAILABLE_MESSAGE` exported.
- [ ] T003 Implement `packages/shared/src/constants/property-files.ts` (GREEN) per D25; export from `packages/shared/src/index.ts`.
- [ ] T004 [P] Write `packages/shared/src/schemas/property-files.test.ts` (RED): presign/confirm/list/download/create-issue/mark-seen/unseen-count request+response schemas, `withIssues` query, `PropertyFileType`/`PropertyFileStatus`/`PropertyIssueSource` enums, `fileCounts` fragment.
- [ ] T005 Implement `packages/shared/src/schemas/property-files.ts` (GREEN); export from `index.ts`.
- [ ] T006 Append the `propertyFiles` key to `PLATFORM_SETTINGS_REGISTRY` in `packages/shared/src/schemas/platform-settings.ts` (6-field Zod object, `section: 'Property files'`, defaults per FR-033) and extend `packages/shared/src/schemas/platform-settings.test.ts` (defaults, bounds 5–200 / 1–20 / 30–3650, `retentionDays` null-or-int).
- [ ] T007 Append the 8 actions to `ROLE_ACTION_MATRIX` in `packages/shared/src/permissions/role-matrix.ts` (per contracts) and assert them in `role-matrix.test.ts`.
- [ ] T008 Extend `packages/shared/src/schemas/responses.ts`: add `hasUnseenIssues` to appointment + property **list-item** schemas and `fileCounts` to their **detail** schemas. Add the `withIssues` boolean to the appointment/property list **query** schemas (the request/query schema — shared `schemas/requests*` or the route's query schema, per where each list currently declares its filters; the repository/route wiring is T034/T035). (Do NOT regenerate api-types yet — T045.)

### Database

- [ ] T009 Add `PropertyFile` + `PropertyIssue` models (+ enums + relations) to `apps/backend/prisma/schema.prisma` per data-model.md; run `pnpm --filter backend prisma:generate`.
- [ ] T010 Create the migration `apps/backend/prisma/migrations/<ts>_property_files_and_issues/migration.sql` (regen timestamp on rebase): both tables, the relaxed `issue_id_matches_type` CHECK (D20), `uq_version`, `uq_storage_key`, and the 8 partial indexes in raw SQL (R14). Verify it applies twice on a fresh DB.

### Storage port extension (D11 — extend in place, do not move)

- [ ] T011 [P] Write a unit test (RED) for the new `getObjectBytes` on the storage adapter stub, and for `isDetectedMimeCompatible` in `apps/backend/tests/unit/property-file/mime-compatibility.test.ts` (exact match; OOXML declared ↔ detected `application/zip`; image/pdf signatures; reject mismatch).
- [ ] T012 Add `getObjectBytes(bucket, key, maxBytes): Promise<Buffer>` to `IStorageService` (`apps/backend/src/modules/inspector-execution/domain/storage.service.ts`); implement in `infrastructure/supabase-storage.service.ts` (S3 `GetObject` + `Range`) and throw `StorageNotConfiguredError` in `infrastructure/unconfigured-storage.service.ts`. Implement `domain/mime-compatibility.ts` in the new module (GREEN).

### Module skeleton, domain, repositories, wiring

- [ ] T013 [P] Create `apps/backend/src/modules/property-file/domain/`: `property-file.entity.ts`, `property-issue.entity.ts`, `property-file.repository.ts` (`IPropertyFileRepository`, tx-aware), `property-issue.repository.ts` (`IPropertyIssueRepository`, tx-aware), `property-file.errors.ts` (NotFound→404, InvalidKey, Mime, Size, PhotoLink→409).
- [ ] T014 Implement `infrastructure/prisma-property-file.repository.ts` and `infrastructure/prisma-property-issue.repository.ts` (scoped finders taking a tenant predicate; `linkPendingIssuePhotos` all-or-nothing returning affected count; batched `findAppointmentsWithUnseenIssues`/`findPropertiesWithUnseenIssues`/`countFilesByAppointment`/`countFilesByProperty`; retention finders).
- [ ] T015 Wire the module in `apps/backend/src/main/container.ts` (repos + use cases + `propertyFile` route container) and register routes in `apps/backend/src/main/routes.ts` (`registerPropertyFileRoutes`, `registerPropertyIssueRoutes`); add base keys to `apps/backend/tests/helpers/mock-container.ts`.

**Checkpoint**: contract compiles, migration applies, module is wired — user stories can begin.

---

## Phase 3: User Story 1 — File repository foundation (Priority: P1) 🎯 MVP

**Goal**: presign → confirm → list → download → new version → delete for Document/Report/Other files, tenant-scoped and audited.

**Independent Test**: presign+confirm a PDF on an appointment → `GET files?propertyId` returns it with `appointmentId`; add a version → v1+v2 both downloadable; delete → gone + audited (C.A1/A3/A4/A5 file side).

- [ ] T016 [P] [US1] Unit tests (RED) for `PresignPropertyFileUploadUseCase` (MIME allow/deny, key built via grammar, PENDING row, 503 on unconfigured) in `apps/backend/tests/unit/property-file/presign-property-file-upload.use-case.test.ts`.
- [ ] T017 [P] [US1] Unit tests (RED) for `ConfirmPropertyFileUploadUseCase` (headObject exists/missing, size over max → 400, magic-byte mismatch → 400, READY flip for non-issue, audit, Idempotency-Key required + replay) in `.../confirm-property-file-upload.use-case.test.ts`.
- [ ] T018 [P] [US1] Unit tests (RED) for list/download/version/delete use cases (counts by type, download TTL 5 min, version `max+1` + 23505 retry, soft-delete AM/OP-only + audit) in `.../{list,download,version,delete}-*.use-case.test.ts`.
- [ ] T019 [US1] Implement `PresignPropertyFileUploadUseCase` (GREEN) in `apps/backend/src/modules/property-file/application/use-cases/presign-property-file-upload.use-case.ts`.
- [ ] T020 [US1] Implement `ConfirmPropertyFileUploadUseCase` (GREEN): `headObject` + `getObjectBytes` + `fileTypeFromBuffer` + `isDetectedMimeCompatible` + size check + READY; Idempotency (`publish-inspector-notice` shape, scope `property-file.confirm`); audit `property_file.uploaded`.
- [ ] T021 [US1] Implement `ListPropertyFilesUseCase`, `GetPropertyFileDownloadUrlUseCase` (TTL 5 min), `AddPropertyFileVersionUseCase` (23505 retry; audit `property_file.version_added`), `DeletePropertyFileUseCase` (AM/OP soft-delete; audit `property_file.deleted`).
- [ ] T022 [US1] Implement `apps/backend/src/modules/property-file/interfaces/property-file.routes.ts` (presign, confirm, list, download, versions, delete) with Zod schemas + `Idempotency-Key` header on confirm.
- [ ] T023 [US1] Route integration tests in `apps/backend/tests/integration/property-file/property-file.routes.test.ts` (presign→confirm with storage stub; list; download; version; delete) and real-DB tests for C.A1 (appointment file via `?propertyId`), C.A3 (v1+v2 URLs), C.A4 (audit author/date/version), C.A5 (size + magic-byte rejection) in `apps/backend/tests/integration/db/property-file.integration.test.ts`.

**Checkpoint**: file CRUD + versioning works end to end for AM/OP/CL_ADMIN.

---

## Phase 4: User Story 2 — Property issues with photos (Priority: P1)

**Goal**: create issue (D20 transaction linking PENDING photos), mark-as-seen (CAS), delete issue (+ photos); list issues.

**Independent Test**: confirm 2 PENDING issue photos → create issue → both flip READY+linked; a missing photoId → 409, no issue; concurrent mark-seen → one audit, second `{ alreadySeen: true }`.

- [ ] T024 [P] [US2] Unit tests (RED) for `CreatePropertyIssueUseCase` (source server-derived by role R11; appointment∈property+tenant; ≤ maxPhotosPerIssue; zero-photo issue allowed; Idempotency-Key) in `apps/backend/tests/unit/property-file/create-property-issue.use-case.test.ts`.
- [ ] T025 [P] [US2] Unit tests (RED) for `MarkPropertyIssueAsSeenUseCase` (CAS: 1-row→audit; 0-row→`{alreadySeen:true}` no re-audit) and `DeletePropertyIssueUseCase` (AM/OP; cascades photos; audit) in `.../{mark-seen,delete-issue}.use-case.test.ts`.
- [ ] T026 [US2] Implement `CreatePropertyIssueUseCase` (GREEN): `runInTransaction` → create issue + `linkPendingIssuePhotos` all-or-nothing (affected≠requested → 409 `PropertyIssuePhotoLinkError`); Idempotency scope `property-issue.create`; audit `property_issue.created`.
- [ ] T027 [US2] Implement `MarkPropertyIssueAsSeenUseCase` (CAS D23; audit `property_issue.seen` on 1-row), `DeletePropertyIssueUseCase` (soft-delete issue + `issue_id` photos; audit `property_issue.deleted`), `ListPropertyIssuesUseCase`.
- [ ] T028 [US2] Implement `apps/backend/src/modules/property-file/interfaces/property-issue.routes.ts` (create [Idempotency-Key], `:id/seen`, delete, list) with Zod + server-derived `source`.
- [ ] T029 [US2] Real-DB integration tests in `apps/backend/tests/integration/db/property-issue.integration.test.ts`: D20 happy path + 409 rollback (missing/foreign/already-linked photo); CAS mark-seen (two concurrent → 1 audit); delete cascades photos; zero-photo issue.

**Checkpoint**: full issue lifecycle works; the D20 transaction is proven against a real DB.

---

## Phase 5: User Story 3 — Tenant isolation & RBAC across five roles (Priority: P1)

**Goal**: cross-tenant → 404; OP cross-tenant (v1.3.0); CL pinned; INSP via T-1 (D28); CL_USER read-only (no presign).

**Independent Test**: CL of T2 → 404 on T1's file/issue/download; CL_USER presign → 403; INSP sees only own+T-1 appointment files.

- [ ] T030 [US3] Apply scope in the use cases: `requireTenantScope`/`assertTenantScope` + scoped `findById` → `NotFoundError` (404) on cross-tenant (R4/R5); INSP list/download gated by `T1VisibilityService`/`findVisibleForInspector` (D28); presign/upload rejects CL_USER and refines INSP to `type=ISSUE` on own+T-1 appointment (R11).
- [ ] T031 [P] [US3] Real-DB RBAC integration tests in `apps/backend/tests/integration/db/property-file-rbac.integration.test.ts`: all 5 roles × (read/upload/version/delete/create-issue/mark-seen/delete-issue); **C.A2** cross-tenant 404 (file, issue, download — never 403); **CL_USER cannot presign** (403); **INSP cannot read another inspector's appointment files**, and cannot read own appointment outside the T-1 window.

**Checkpoint**: isolation + RBAC proven; C.A2 green.

---

## Phase 6: User Story 4 — Unseen indicators & payload fields (Priority: P2)

**Goal**: unseen-count endpoint + `hasUnseenIssues` (lists) + `fileCounts` (details) + `withIssues` filter; `false` for CL_USER/INSP.

**Independent Test**: unseen issue → `unseen-count` & list `hasUnseenIssues:true`; mark seen → flips off; CL_USER/INSP always `false`; `withIssues` filters both lists.

- [ ] T032 [P] [US4] Unit tests (RED) for `CountUnseenPropertyIssuesUseCase` (AM/OP/CL_ADMIN; CL_USER/INSP→403) in `apps/backend/tests/unit/property-file/count-unseen.use-case.test.ts`.
- [ ] T033 [US4] Implement `CountUnseenPropertyIssuesUseCase` + `GET /v1/property-issues/unseen-count` route (static path) returning `{ appointmentsWithUnseenIssues, propertiesWithUnseenIssues }` via the partial indexes (D26).
- [ ] T034 [US4] Inject the unseen-issue/file-count readers into `list-appointments`/`get-appointment` use cases: batched `hasUnseenIssues` (one query/page, mirror `findLatestCantDoByAppointmentIds`; skip + `false` for CL_USER/INSP), `fileCounts` on detail; add `withIssues` to `prisma-appointment.repository.ts#buildWhere` and the route query. Update `apps/backend/tests/unit/appointment/{list,get}-appointments.use-case.test.ts` + `mock-container.ts`.
- [ ] T035 [US4] Same for properties: `list-property`/`get-property` use cases (`hasUnseenIssues` D26 = any unseen issue of the property; `fileCounts`), `withIssues` in `prisma-property.repository.ts#buildWhere` + route. **Use `requireTenantScope` (do NOT copy the get-property OP-pinning bug).** Update `apps/backend/tests/unit/property/{list,get}-property.use-case.test.ts` + `mock-container.ts`.
- [ ] T036 [P] [US4] Real-DB integration test `apps/backend/tests/integration/db/property-issue-indicators.integration.test.ts`: `withIssues` (has-issue vs has-unseen-issue) on both lists; `hasUnseenIssues` flips on mark-seen; CL_USER/INSP get `false`; unseen-count correctness incl. no-appointment issues.

**Checkpoint**: indicators + payload fields ready for TASK-F10-2.

---

## Phase 7: User Story 5 — Configuration & retention job (Priority: P2)

**Goal**: `propertyFiles` config (done in T006) consumed by the use cases; daily retention job purges deleted, over-retention, and orphan-PENDING objects.

**Independent Test**: move `deleted_at`/`created_at` past thresholds → run worker → `deleteObject` called, `purged_at` set, `property_file.purged` audited.

- [ ] T037 [P] [US5] Unit test (RED) for the retention handler logic (3 steps; per-row try/catch; not-found ignored on orphan purge) in `apps/backend/tests/unit/property-file/property-file-retention.worker.test.ts`.
- [ ] T038 [US5] Implement `apps/backend/src/modules/property-file/infrastructure/workers/property-file-retention.worker.ts` (mirror `expire-files.worker.ts`): (1) deleted > `deletedRetentionDays` & READY, (2) active > `retentionDays` (non-null; issue photo follows D27), (3) PENDING > 24 h (ignore not-found) — each `deleteObject` + `purged_at` + audit `property_file.purged`.
- [ ] T039 [US5] Schedule + work `property-file.retention` daily on `SYDNEY_TZ` in `apps/backend/src/main/workers.ts`; pass the new deps through `registerWorkers` in `apps/backend/src/main/server.ts`; update BOTH `apps/backend/src/main/__tests__/workers.test.ts` (`EXPECTED_SCHEDULES` + arity) and `apps/backend/tests/unit/workers.test.ts` (counts).
- [ ] T040 [US5] Real-DB integration test `apps/backend/tests/integration/db/property-file-retention.integration.test.ts`: all 3 purge steps call `deleteObject`, set `purged_at`, audit; a retention purge of an issue photo leaves the issue (D27).

**Checkpoint**: retention + config complete.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T041 [P] Correct the stale `InspectionAsset` docs: update/remove in `docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md`, and `specs/008-*` references; document `property_files`/`property_issues` + the retention job (R16).
- [ ] T042 [P] Update `apps/backend/CLAUDE.md` (module, routes, worker, storage-port method, idempotency scopes, 404-not-403 rule).
- [ ] T043 [P] Update `packages/shared/CLAUDE.md` (property-files schemas/constants, `propertyFiles` setting key, role-matrix actions, storage-key grammar) and the root `CLAUDE.md` "Active Technologies" (APPEND F10-1 entry; keep all existing).
- [ ] T044 Review: `property_issues`/`property_files` are tenant-scoped (carry `tenant_id`) — confirm no accidental platform-scoping; confirm no inspector coordinate is ever written to these tables or their audits.
- [ ] T045 Run `pnpm generate:api` → commit regenerated `packages/shared/openapi.json` + `packages/shared/src/api-types.ts`; confirm the 4 modified payload fixtures compile.
- [ ] T046 Full gates via subagent (condensed): shared build+lint+typecheck+test; backend lint+typecheck+test + `test:integration:db`. Fix to green.
- [ ] T047 `git diff --stat origin/develop... | tail -1` → verify **< 150 files**; if over, pause and ask the coordinator to split. Then run `quickstart.md` validation checklist.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → Phase 3+**. Foundational (T002–T015) blocks every story.
- **US1 (P1)** and **US2 (P1)**: US2 create-issue depends on US1 presign/confirm (photos are presigned first) and on the shared transaction/repo (T014). Do US1 before/with US2.
- **US3 (P1)** depends on US1+US2 use cases existing (it adds scope + the RBAC test matrix).
- **US4 (P2)** depends on the issue model (US2) for counts.
- **US5 (P2)** depends on the file model (US1/foundational).
- **Polish** last; T045 (api-types regen) after all schema/route edits; T046 the real gate; T047 the PR guard.

### Parallel opportunities

- T002/T004 (shared tests), T011/T013 (port test + domain) are `[P]`.
- Within a story, the `[P]` RED test files are independent; implementation tasks touching the same route/use-case file are sequential.
- MVP = Phase 1 + 2 + US1. Each later story is an independently verifiable increment inside the one PR.

## Notes

- One migration; regenerate its timestamp on rebase. Append-only to role-matrix + settings registry + root CLAUDE.md (parallel with TASK-F07-1).
- Never hand-merge `api-types.ts` — always `pnpm generate:api`.
- Adding use-case deps (T034/T035) and a worker (T039) breaks existing test wirings/mock-container — update them in the same task.
- Conventional Commits; no Claude/Anthropic references.
