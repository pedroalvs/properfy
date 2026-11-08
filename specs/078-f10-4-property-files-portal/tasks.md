# Tasks: Portal — rental tenant reports a property problem before confirming

**Input**: Design documents from `specs/078-f10-4-property-files-portal/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/portal-property-issues.md

**Tests**: Included — TDD is mandatory (constitution III). Each use case gets a failing unit test before implementation; routes get supertest integration; isolation gets a real-DB test; the portal UI gets Vitest + hermetic Playwright.

**Absolute base**: `/Users/pedro/Code/GitHub/properfy/.claude/worktrees/078-f10-4-property-files-portal`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete dependency)
- **[US#]**: user story the task serves

---

## Phase 1: Setup

- [ ] T001 Verify worktree baseline is green (deps installed, `@properfy/shared` + `@properfy/frontend-standards` built, backend+web typecheck/lint pass) — already established; no scaffolding needed (the `rental-tenant-portal` and `property-file` modules exist on `ebf1b8e7`).

---

## Phase 2: Foundational (shared contract + mapper — blocks ALL user stories)

**⚠️ No user story work begins until this phase is complete.**

- [ ] T002 [P] Write failing schema tests in `packages/shared/src/schemas/property-files.test.ts` for the new portal schemas: `portalPresignIssuePhotoSchema` (fileName 1–255, mime required, optional sizeBytes), `portalPresignIssuePhotoResponseSchema` ({ fileId, uploadUrl, expiresAt } — **no storageKey**), `portalConfirmIssuePhotoSchema` ({ fileId uuid }), `portalCreatePropertyIssueSchema` (reason trimmed 1–1000, optional photoFileIds uuid[]), `portalIssuePhotoResponseSchema` ({ id, fileName, mime, status, createdAt }), `portalPropertyIssueResponseSchema`, `portalPropertyIssuesResponseSchema` (valid + invalid + edge cases).
- [ ] T003 Add the portal schemas + inferred types to `packages/shared/src/schemas/property-files.ts` (a clearly-marked "Portal (F10-4)" section, reusing `PROPERTY_ISSUE_REASON_MAX`; the presign response is the portal-specific `portalPresignIssuePhotoResponseSchema` **without `storageKey`**, not the F10-1 presign response), confirm they are exported via the barrel, then `pnpm --filter @properfy/shared build` → T002 green.
- [ ] T004 [P] Add portal-safe DTO mappers in `apps/backend/src/modules/rental-tenant-portal/application/portal-issue-mappers.ts` (entity + photos → `PortalPropertyIssue`/`PortalIssuePhoto`, excluding `source`/`createdByUserId`/`seenAt`/`seenByUserId`/`cantDoEventId`/`appointmentId`/`storageKey`/`uploadedByUserId`/`status`/`version*`) with a unit test asserting the excluded fields are absent.

---

## Phase 3: User Story 1 — Report a problem with photos (Priority: P1) 🎯 MVP

**Goal**: A tenant presigns → uploads → confirms photos one at a time, then submits a description to create a `RENTAL_TENANT_PORTAL` issue with the photos linked.

**Independent test**: With a valid token, run presign→confirm for two photos then create the issue; assert a `RENTAL_TENANT_PORTAL` issue with `createdByUserId=null`, the token's scope, and two READY linked photos exists.

- [ ] T005 [P] [US1] Failing unit test `apps/backend/src/modules/rental-tenant-portal/application/use-cases/__tests__/presign-portal-issue-photo.use-case.test.ts`: resolves `{propertyId,tenantId}` from the token's appointment; rejects a MIME not in `issueImageMimes` with a clear message (C.A5); builds the key via `buildPortalIssueStorageKey`; creates a `PENDING` ISSUE file with `issueId=null`, `uploadedByUserId=null`; rejects when the appointment has no property.
- [ ] T006 [US1] Implement `presign-portal-issue-photo.use-case.ts` (reuse `IPropertyFileRepository`, `IPropertyIssueRepository.findAppointmentScope`, `IStorageService`, `IPlatformSettingsReader`, shared key grammar) → T005 green.
- [ ] T007 [P] [US1] Failing unit test `__tests__/confirm-portal-issue-photo.use-case.test.ts`: requires `Idempotency-Key`; 404 when the file is not this token's appointment/tenant or not `type=ISSUE` (no disclosure, C.A2); rejects size > `maxFileSizeMb` and magic-byte mismatch with clear messages (C.A5); validates `parsePortalIssueStorageKey` embedded tenant/appointment (D25); keeps the file `PENDING` with `confirmed_at` set; idempotent replay.
- [ ] T008 [US1] Implement `confirm-portal-issue-photo.use-case.ts` (reuse `headObject`/`getObjectBytes`, `isDetectedMimeCompatible`, `fileRepo.confirmUpload(..., setReady=false)`, `IIdempotencyService`, `AuditService` ANONYMOUS, `runInTransaction`) → T007 green.
- [ ] T009 [P] [US1] Failing unit test `__tests__/create-portal-issue.use-case.test.ts`: `source=RENTAL_TENANT_PORTAL`, `createdByUserId=null`, `cantDoEventId=null`; caps photos at `min(PORTAL_MAX_PHOTOS_PER_ISSUE, maxPhotosPerIssue)`; D20 atomic link (partial link → 409 + rollback); no-property appointment → 422; requires `Idempotency-Key`; audits `property_issue.created` (ANONYMOUS, resolved tenantId); returns the portal DTO.
- [ ] T010 [US1] Implement `create-portal-issue.use-case.ts` (reuse `issueRepo.create`, `fileRepo.linkPendingIssuePhotos`, `fileRepo.listReadyPhotosByIssueIds`, idempotency, audit, `runInTransaction`, portal mapper) → T009 green.
- [ ] T011 [US1] Wire the three use cases into the portal container (`apps/backend/src/main/container.ts`) and add the three routes to `apps/backend/src/modules/rental-tenant-portal/interfaces/rental-tenant-portal.routes.ts`: `POST …/property-issues/presign` (per-token rate limit — see T020), `POST …/property-issues/confirm-upload` (Idempotency-Key header), `POST …/property-issues` (Idempotency-Key header); keep handlers thin (parse → use case → map), refuse writes for read-only tokens.
- [ ] T012 [P] [US1] Supertest integration `apps/backend/tests/integration/portal-property-issues.integration.test.ts` (stubbed storage): full presign→confirm→create happy path returns a portal issue with two linked READY photos; create rejects an unconfirmed/foreign photo id (409).
- [ ] T013 [US1] Portal web: `apps/web/src/features/rental-tenant-portal/hooks/usePortalIssues.ts` (one-photo-at-a-time presign→PUT→confirm with per-photo progress/error; create with a stable `Idempotency-Key`) and `components/PortalReportProblemSection.tsx` (description ≤1000, "Add photos" ≤5, "Submit report" separate from confirm, `FILE_STORAGE_UNAVAILABLE_MESSAGE` on 503) with a Vitest/RTL test (MIME/size error surfaced; failed photo doesn't lose confirmed ones).
- [ ] T014 [US1] Render `<PortalReportProblemSection>` **before** the confirmation control in `apps/web/src/features/rental-tenant-portal/pages/PortalPage.tsx` (only when the token is not read-only), with a test asserting placement/gating.

**Checkpoint**: US1 is an independently demoable MVP — a tenant can file a report with photos.

---

## Phase 4: User Story 2 — See my submitted reports (Priority: P2)

**Goal**: The tenant sees a read-only list of their own reports for this appointment (metadata only).

**Independent test**: Submit one report, call the list route, assert only own-appointment `RENTAL_TENANT_PORTAL` issues return with the privacy-reduced DTO.

- [ ] T015 [P] [US2] Failing unit test `__tests__/list-portal-issues.use-case.test.ts`: returns only `source=RENTAL_TENANT_PORTAL` issues of the token's appointment (excludes other sources and other appointments); maps to the portal DTO (no reviewer identity / seen status); newest first.
- [ ] T016 [US2] Implement `list-portal-issues.use-case.ts` (`issueRepo.listByAppointment(appointmentId, tenantId)` → filter source → `listReadyPhotosByIssueIds` → portal mapper), wire into the container, and add `GET …/property-issues` to the portal routes (read-only allowed) → T015 green.
- [ ] T017 [P] [US2] Supertest integration (append to `portal-property-issues.integration.test.ts`): the GET returns only this appointment's portal issues, excludes inspector/staff-sourced issues, and carries no `seenByUserId`/`createdByUserId`.
- [ ] T018 [US2] Portal web: render the read-only submitted-reports list inside `PortalReportProblemSection` (consume `usePortalIssues` list query; no reply/status affordance) with a Vitest/RTL test.

---

## Phase 5: User Story 3 — Abuse & isolation protection (Priority: P3)

**Goal**: One token cannot flood storage; a token can never reach another appointment/agency.

**Independent test**: Drive one token past 12 presigns/hour (13th 429); attempt cross-token confirm/list → not-found.

- [ ] T019 [P] [US3] Supertest integration: a single token's 13th presign within the hour → 429 with a retry hint (12 succeed). (Inject a deterministic clock/limit or drive the limiter directly.)
- [ ] T020 [US3] Finalize the presign route `config.rateLimit` = `{ max: 12, timeWindow: '1 hour', keyGenerator }` where `keyGenerator` returns `tokenService.hashToken(params.token)` with `request.ip` fallback (precedent `inspector.routes.ts:638` / `inspector-notice.routes.ts:87`); keep the generic `{ max: 30, timeWindow: '1 minute' }` on confirm/create/list in `rental-tenant-portal.routes.ts`.
- [ ] T021 [P] [US3] Supertest integration: a token for appointment A gets 404 confirming a file of appointment B and never sees B's issues in its list; a read-only (expired/superseded) token is refused presign/confirm/create but may read the list (C.A2).
- [ ] T022 [P] [US3] Real-DB test `apps/backend/tests/integration/db/portal-property-issues.scope.db.test.ts` (testcontainers): two agencies + two appointments; token A cannot read or create issues for appointment B; a created portal issue carries the correct `tenant_id`/`property_id`/`source`.
- [ ] T023 [US3] Portal E2E `apps/web/tests/e2e/portal-report-problem.spec.ts` (hermetic, stubbed API): submit a report with 2 photos → the create call fires; the report appears in the read-only list; storage-503 stub shows the unavailable message.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T024 Regenerate the contract: `pnpm generate:api` (openapi.json + api-types.ts); update any affected test fixtures; confirm `contract-freshness` would pass (no diff after regen).
- [ ] T025 [P] Update CLAUDE.md in every changed workspace (same PR): root `CLAUDE.md` (Active Technologies / Recent Changes — keep-all append, F10-4 bullet), `apps/backend/CLAUDE.md` (portal property-issue routes), `packages/shared/CLAUDE.md` (portal schemas in the property-files bullet), `apps/web/CLAUDE.md` (portal report-problem feature).
- [ ] T026 Run full gates inside the worktree via a subagent (condensed summary): `@properfy/shared` build, `pnpm --filter backend test` (unit + route integration) + `pnpm --filter backend test:integration:db`, `pnpm --filter web test` + `pnpm --filter web test:e2e`, typecheck + lint for backend and web. Fix any failure red→green before proceeding.

---

## Dependencies & parallelism

- **Phase 2 (T002–T004) blocks everything.** T003 must land (and shared must build) before any backend use case typechecks.
- **US1 (Phase 3) blocks US2 and US3**, because they add to the same routes/container that US1 creates.
- **Within US1**: T005→T006, T007→T008, T009→T010 are TDD pairs; the three test tasks (T005/T007/T009) are [P] with each other (different files). T011 depends on T006+T008+T010 (edits routes.ts + container.ts). T013 (web) is [P] with the backend use cases once T003 lands.
- **US2**: T015→T016; T016 edits the same routes.ts/container.ts as T011 (sequential after US1).
- **US3**: T020 edits routes.ts (sequential after T011/T016). T019/T021/T022 tests are [P]. T023 is [P] (web E2E).
- **Polish**: T024 after all routes land; T025 [P]; T026 last (the real gate).

## Implementation strategy

- **MVP = Phase 1–3 (US1)**: a tenant can file a report with photos end to end. Ship-demoable alone.
- Add US2 (read-back) and US3 (hardening) incrementally; US3's isolation + rate-limit tests are the security gate and must be green before PR.
- Shared-file discipline: `api-types.ts` is only ever regenerated (never hand-merged); if F10-2/F10-3 merge first, rebase onto `develop` and re-run `pnpm generate:api`.
