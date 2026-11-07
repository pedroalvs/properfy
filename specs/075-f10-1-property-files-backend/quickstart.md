# Quickstart — Property Files & Issues (TASK-F10-1)

Backend + shared slice. No UI (TASK-F10-2/3/4 consume the contract). Run everything **inside the worktree**.

## Build & generate

```bash
pnpm --filter @properfy/shared build            # shared consumed from dist by backend tooling
pnpm --filter backend prisma:generate           # after editing schema.prisma
pnpm --filter backend exec prisma migrate dev --name property_files_and_issues   # creates the migration (regenerate timestamp on rebase)
pnpm generate:api                               # regenerate openapi.json + api-types.ts after schema/route changes
```

## Gates (run via a subagent; condensed summary)

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared lint && pnpm --filter @properfy/shared typecheck && pnpm --filter @properfy/shared test
pnpm --filter backend lint && pnpm --filter backend typecheck
pnpm --filter backend test                      # unit + route integration
pnpm --filter backend test:integration:db       # testcontainers: D20 tx, CAS, retention, RBAC 404, withIssues (REQUIRED for this task)
```

## Prove the acceptance criteria

- **C.A1** (appointment file shows on property too): integration test — presign+confirm a `DOCUMENT` with `appointmentId` → `GET /v1/property-files?propertyId=…` returns it with `appointmentId`; `GET …?appointmentId=…` returns it too.
- **C.A2** (cross-tenant → 404): seed a file+issue in T1; as a CL actor of T2, `GET /v1/property-files/:id/download`, the issue, and the file metadata each return **404** (never 403, no existence leak).
- **C.A3** (versioning): add a version → both v1 and v2 return distinct signed download URLs; v1 still `READY`.
- **C.A4** (audit): assert `property_file.uploaded`, `.version_added`, `.deleted` audit rows carry author, date and version.
- **C.A5** (format/size): presign a disallowed MIME → 400; confirm an object whose real size `> maxFileSizeMb` → 400; confirm an object whose magic bytes don't match the declared MIME → 400.
- **Additive**:
  - create an INSP issue (source `INSPECTOR`) on an assigned appointment → `GET /v1/property-issues/unseen-count` shows `appointmentsWithUnseenIssues ≥ 1` and the appointment row has `hasUnseenIssues: true`; mark seen → both flip off; a second concurrent mark-seen returns `{ alreadySeen: true }` and does not re-audit.
  - create an issue on a property with no appointment → `propertiesWithUnseenIssues ≥ 1`.
  - `GET /v1/appointments?withIssues=true` and `/v1/properties?withIssues=true` return only records with an issue.
  - CL_USER `POST /v1/property-files/presign` → 403; INSP `GET /v1/property-files?appointmentId=<another inspector's>` → not returned (T-1).
  - retention job: move a deleted file's `deleted_at` past `deletedRetentionDays`, an orphan `PENDING` past 24 h → run the worker → `deleteObject` called, `purged_at` set, `property_file.purged` audited.

## D20 transaction smoke (the trickiest invariant)

1. presign + confirm two `type=ISSUE` photos → rows exist `PENDING`, `issue_id = NULL` (allowed by the relaxed CHECK).
2. `POST /v1/property-issues` with both `photoFileIds` → one transaction inserts the issue and flips exactly those two rows to `READY` with `issue_id`/`appointmentId`.
3. Repeat referencing a third, non-existent fileId → whole create returns **409**, no issue row written, the two valid photos stay `PENDING`.

## PR checklist

- `git diff --stat origin/develop... | tail -1` → **< 150 files** (else ask the coordinator to split).
- `openapi.json` + `api-types.ts` regenerated and committed; the 4 modified payload fixtures + `mock-container` updated.
- Migration applies twice on a fresh PostGIS DB (CI gate); partial indexes present in raw SQL.
- `apps/backend/CLAUDE.md`, `packages/shared/CLAUDE.md`, root `CLAUDE.md` "Active Technologies" updated; stale `InspectionAsset` docs corrected.
- No reference to Claude/Anthropic in commits or PR body.
