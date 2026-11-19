# Phase 0 Research — Property Files & Issues (TASK-F10-1)

All decisions below are derived from `fase2-etapa1/tarefas/F10-tarefas.md` (D1–D29), the F10 vision doc, the constitution, and a read-only codebase map (`explore-f10-1`, 2026-11-07). No `[NEEDS CLARIFICATION]` remains.

## R1 — Upload model: presign → confirm (not server-buffer)

- **Decision**: Use a presign → confirm flow for every file (Document/Report/Other and issue photos), following the inspector-document precedent (`generate-inspector-document-upload-url.use-case.ts` + `confirm-inspector-document-upload.use-case.ts`).
- **Rationale**: D9 mandates presign→confirm; files can be up to `maxFileSizeMb` (20 MB default), above the multipart/body limits the server-buffer logo flow assumes. Presign offloads bytes straight to Supabase Storage.
- **Alternatives rejected**: The `upload-tenant-logo` server-buffer model (receives the whole file in the request) — rejected because it does not scale to 20 MB mobile photos/PDFs and re-introduces the multipart size ceiling the presign is meant to bypass.

## R2 — Magic-byte sniff at confirm requires a storage read-prefix method

- **Decision**: Extend `IStorageService` (in `inspector-execution/domain/storage.service.ts`) with `getObjectBytes(bucket, key, maxBytes): Promise<Buffer>`, implemented in `SupabaseStorageService` via S3 `GetObject` with a `Range: bytes=0-(maxBytes-1)` header, and throwing `StorageNotConfiguredError` in `UnconfiguredStorageService`. `ConfirmPropertyFileUploadUseCase` fetches a byte prefix (~16 KB) and runs `fileTypeFromBuffer` from `file-type`.
- **Rationale**: D9 + C.A5 + FR-031 require the confirm to reject a spoofed content-type via `file-type`. The presign/confirm model does not hold the uploaded buffer server-side; `headObject` returns only `{exists, sizeBytes}`. Reading a small prefix is the minimal way to sniff. Extending the port (adding a method) is allowed; **the file is not moved** (D11 says don't relocate the port, not don't extend it).
- **MIME-compatibility nuance**: OOXML files (`.docx`/`.xlsx`) are ZIP containers; `file-type` on a short prefix may report `application/zip` rather than the exact OOXML MIME (the ZIP central directory is at the file's end). A `isDetectedMimeCompatible(declared, detected)` helper (`domain/mime-compatibility.ts`) accepts: an exact match; a detected `application/zip` when the declared type is a configured OOXML type; and the correct image/PDF signatures for those families. Anything else (e.g., an executable renamed `.pdf`) is rejected. This catches the real spoofing threat without false-rejecting legitimate docx/xlsx.
- **Alternatives rejected**: (a) Download the whole object to sniff — rejected (up to 20 MB per confirm, slow/expensive). (b) Trust the presign `contentType` — rejected (it is the client-declared, spoofable value — exactly what C.A5 guards against). (c) HTTP range-fetch via the signed download URL — rejected in favor of a typed port method (testable with a stub, no self-HTTP round-trip).

## R3 — Reuse the existing `inspection-assets` bucket (no new bucket)

- **Decision**: Use the already-provisioned private bucket `inspection-assets` for all property files (D10). Do **not** append to `BUCKETS_REQUIRED` in `provision-storage-buckets.ts`.
- **Rationale**: D10 and the coordinator's verification (2026-11-07) are explicit: use the existing bucket; its dashboard-level MIME/size restriction (images-only / 30 MB) is **operational config tracked in the DEV checklist, outside this PR**. Application-level validation is governed by `allowedMimes`/`maxFileSizeMb`. The code only references the bucket.
- **Alternatives rejected**: Creating a dedicated `property-files` bucket (the `explore-f10-1` suggestion) — rejected because it contradicts D10 and the coordinator's instruction; bucket dashboard config is an ops item, not code.

## R4 — OP is cross-tenant; use `requireTenantScope` (do not copy the get-property OP bug)

- **Decision**: Resolve tenant scope with `requireTenantScope(actor, action)` (→ `undefined` for AM/OP/SYS, pinned tenant for CL_*) and `assertTenantScope` where a tenant is mandatory. OP reads/writes across agencies.
- **Rationale**: Constitution v1.3.0 (CLOSED-REJECTED the OP-pinning correction) + the task's explicit warning: `get-property.use-case.ts:47-53` wrongly pins OP to its tenant ("CORRECTION-001") and must **not** be copied. The appointment list scope (`resolveAppointmentListTenantScope`) and property list scope (`resolveTenantScope`) both already treat OP as cross-tenant.
- **Alternatives rejected**: Mirroring `get-property`'s OP pinning — rejected (it is the documented bug; constitution is authoritative).

## R5 — Cross-tenant access returns 404, never 403 (C.A2)

- **Decision**: Repositories take a tenant predicate; use cases call `repo.findById(id, tenantScope)` and throw `PropertyFileNotFoundError` / `PropertyIssueNotFoundError` (→ 404) when the row is absent under scope. For CL_* a second guard re-checks `row.tenantId === actor.tenantId` → else `NotFoundError` (mirrors `get-appointment.use-case.ts`). The download use case applies the same check before issuing a URL.
- **Rationale**: D6 + C.A2 — a cross-tenant actor must not learn a resource exists. 403 would leak existence.
- **Alternatives rejected**: `ForbiddenError` (403) on cross-tenant — rejected (reveals existence).

## R6 — One `property-file` module with both aggregates; single cross-table transaction

- **Decision**: One backend module owns `PropertyFile` + `PropertyIssue`. `CreatePropertyIssueUseCase` runs `runInTransaction(tx => { issueRepo.create(issue, tx); fileRepo.linkPendingIssuePhotos({fileIds, issueId, appointmentId, tenantId}, tx) })`; both repo methods accept an optional `tx`.
- **Rationale**: Issue photos are property files; the D20 transaction spans both tables. One module keeps the transaction and the shared storage-key grammar cohesive and avoids a cross-module transactional dependency (Clean Architecture discourages reaching into another module's repository inside a transaction).
- **Alternatives rejected**: Two modules (`property-files`, `property-issues`) — the task's literal wording — rejected for the transaction coupling; the two logical groupings live as sibling use-case files instead. (This changes only internal layout, not the contract.)

## R7 — Payload enrichment (`hasUnseenIssues`, `fileCounts`) via batched queries, only for seer roles

- **Decision**: `hasUnseenIssues` is added to the appointment/property **list** payloads; `fileCounts` to the two **detail** payloads; a `withIssues` filter to both lists. List enrichment is batched (one query per page) mirroring `list-appointments`' `findLatestCantDoByAppointmentIds` Map pattern. All new fields are added to the **shared** `responses.ts` schemas (Fastify strips undeclared keys) and `api-types.ts`/`openapi.json` are regenerated. For CL_USER/INSP the enrichment is skipped and `hasUnseenIssues` is `false` (D26), exactly as `inspectorIssue` is fetched only for non-INSP.
- **Rationale**: D14/D26 semantics; partial indexes keep the per-screen count cheap. Adding fields to the shared schema is mandatory or the serializer drops them.
- **Implementation ripple**: the appointment/property list+detail use cases gain an **optional injected dependency** (the unseen-issue / file-count readers). Adding a use-case dependency breaks untyped test wirings and `mock-container` base — all four use-case test files + `mock-container.ts` must be updated (memory: `adding_usecase_dep_breaks_untyped_test_wirings`, `usecase_output_shape_change_grep_all_mocks`).
- **Alternatives rejected**: Per-row N+1 count queries — rejected (runs on every list screen). A separate "issues summary" endpoint instead of inlined fields — rejected (the web border/filter needs the flag on the list row; D26 requires it inline). A dedicated unseen-count endpoint **is** kept for the sidebar dots (FR-017), separate from the row flag.

## R8 — Retention job mirrors `expire-files`; `registerWorkers` positional-arg trap

- **Decision**: `property-file-retention.worker.ts` mirrors `report/infrastructure/workers/expire-files.worker.ts`: find rows, loop `storageService.deleteObject(bucket, key)` with per-row try/catch, set `purged_at`, audit `property_file.purged`. Scheduled daily on `SYDNEY_TZ` via `boss.schedule(name, cron, {}, SYDNEY_TZ)` + `boss.work(name, withJobMetrics(name, handler))` in `main/workers.ts`. Cron chosen in an unused slot (e.g. `0 4 * * *`, after `audit.retention` at `30 3`).
- **Rationale**: D8/D22/D27; reuse the proven expiry worker shape and per-row isolation (one bad object doesn't abort the batch).
- **Wiring ripple**: adding a worker adds a positional arg to `registerWorkers` → update the call site in `main/server.ts` **and** both worker test sites (`src/main/__tests__/workers.test.ts` `EXPECTED_SCHEDULES`, `tests/unit/workers.test.ts` counts) (memory: `register_workers_dual_test_sites`).
- **Alternatives rejected**: A cron outside pg-boss — rejected (no Redis; pg-boss is the platform scheduler). Hard-delete instead of `purged_at` marking — rejected (audit + idempotent re-runs need the marker).

## R9 — Idempotency: copy the `publish-inspector-notice` shape

- **Decision**: `ConfirmPropertyFileUploadUseCase` and `CreatePropertyIssueUseCase` require `Idempotency-Key` (D24), using `IIdempotencyService` with `getWithHash` fast-path (payload-hash mismatch → error), `runInTransaction`, `idempotency.set(key, SCOPE, output, TTL, hash, tx)`, and post-commit `defer(audit)`. Scopes: `property-file.confirm`, `property-issue.create`. TTL 24 h.
- **Rationale**: D24 + §7.7; the F02-2 `publish-inspector-notice` use case is the exact precedent (hashing + tx + set + defer).
- **Alternatives rejected**: No idempotency — rejected (a phone retry after timeout would duplicate a file/issue). A bespoke idempotency table — rejected (the shared service exists).

## R10 — INSP visibility reuses `T1VisibilityService` / `findVisibleForInspector` (D28)

- **Decision**: When INSP lists/downloads files or issues of an appointment, gate on the **existing** inspector↔appointment visibility (the appointment must be assigned to the inspector and T-1-visible), reusing `T1VisibilityService` / `prisma-appointment.repository.ts#findVisibleForInspector` — not a loose `inspector_id = me`.
- **Rationale**: D28 — a loose equality would ignore the T-1 assignment window. Files are always reached through an appointment on the PWA.
- **Alternatives rejected**: `inspector_id = me` filter — rejected (ignores the T-1 window, contradicts D28).

## R11 — `source` is server-derived from the actor's role (never client-supplied)

- **Decision**: `CreatePropertyIssueUseCase` sets `source` from the authenticated actor: INSP → `INSPECTOR`; AM/OP/CL_ADMIN → `STAFF`; portal token → `RENTAL_TENANT_PORTAL` (TASK-F10-4). The client never sends `source`. `created_by_user_id` is the actor (null for the portal). `cant_do_event_id` (optional) is accepted only on the INSP path.
- **Rationale**: Security — a CL_ADMIN must not forge `source=RENTAL_TENANT_PORTAL`. Matches the RBAC table (who-creates-what).
- **Alternatives rejected**: Client-supplied `source` — rejected (forgeable, mislabels provenance).

## R12 — Version race: `UNIQUE(version_group_id, version)` + 23505 retry (not P2002)

- **Decision**: `AddPropertyFileVersionUseCase` computes `version = max + 1` and inserts; on the raw Postgres `23505` unique-violation it recomputes and retries (bounded). The check is on the raw SQLSTATE, not Prisma's `P2002` (memory: `pricing_catalog_spec_execution` — raw `$queryRaw`/partial-unique conflicts surface as `23505`, not always `P2002`).
- **Rationale**: D-note in the task; two concurrent "new version" calls must not both win `max+1`.
- **Alternatives rejected**: Catching `P2002` only — rejected (raw-SQL inserts/partial constraints may surface `23505` directly). Advisory lock per group — heavier than a bounded retry for a rare race.

## R13 — D20 relaxed CHECK + all-or-nothing photo link → 409

- **Decision**: The `issue_id_matches_type` CHECK is relaxed for `status = 'PENDING'` (photo may be `type=ISSUE`, `issue_id = NULL`). `CreatePropertyIssueUseCase` links photos with a single `UPDATE … WHERE id = ANY(:ids) AND status='PENDING' AND type='ISSUE' AND issue_id IS NULL AND tenant_id=:t`; if the affected-row count ≠ requested count, the whole transaction rolls back with 409 (`PropertyIssuePhotoLinkError`).
- **Rationale**: D20 — the presign happens before the issue exists; the link must be atomic and reject already-linked/foreign/missing photos.
- **Alternatives rejected**: Creating issue first then photos — rejected (photos are presigned before the issue id exists). Per-photo linking without a count check — rejected (would silently drop missing/foreign photos).

## R14 — Partial indexes live in raw SQL inside the Prisma migration

- **Decision**: The partial indexes (unseen-issue indicators, by-type listings, retention sweeps) are written as raw `CREATE INDEX … WHERE …` statements in the migration SQL; the Prisma schema models only the tables/relations (and any full-column indexes Prisma can express).
- **Rationale**: Prisma cannot represent partial indexes, and the drift check does not drop raw ones (memory: `prisma_drift_drops_unsupported_indexes`, and F03-1/F09 precedent). Keeping them in SQL avoids drift-check deletion.
- **Alternatives rejected**: Full (non-partial) indexes via Prisma — rejected (larger, and the predicates matter for the unseen-only/`PENDING`-only sweeps).

## R15 — Append-only to role-matrix and platform-settings registry (parallel with TASK-F07-1)

- **Decision**: Append the 8 role-matrix actions and the single `propertyFiles` registry key at the end of their structures; never hand-merge `api-types.ts` (always `pnpm generate:api`); one migration with its timestamp regenerated on rebase; whoever merges after F07-1 rebases. Root `CLAUDE.md` "Active Technologies" keeps all entries.
- **Rationale**: `paralelizacao.md` conflict rules; F07-1 (Onda 5) concurrently touches the same shared files.
- **Alternatives rejected**: Editing shared structures destructively or resolving `api-types.ts` conflicts by hand — rejected (guaranteed merge corruption).

## R16 — Correct the stale `InspectionAsset` documentation

- **Decision**: `InspectionAsset` never existed in schema v1 (achado 1b). Update/remove its mentions in `docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md` and the `specs/008-*` references, and document the real `property_files`/`property_issues` model + retention job instead.
- **Rationale**: The docs describe a non-existent model; this PR introduces the real file model, so the correction belongs here.
- **Alternatives rejected**: Leaving the stale docs — rejected (they misdescribe reality; the F10 vision explicitly calls for the cleanup).

## Open items intentionally deferred

- **Supabase dashboard bucket config** (images-only/30 MB on `inspection-assets`) — operational, tracked in the DEV checklist, out of this PR (R3).
- **Portal routes + per-token rate limit** — TASK-F10-4 (uses the `buildPortalIssueStorageKey` grammar this task ships).
- **Web/PWA UI** — TASK-F10-2/F10-3 (consume the regenerated `api-types.ts`).
