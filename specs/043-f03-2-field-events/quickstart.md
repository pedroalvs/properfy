# Quickstart — Inspector Field Events (F03-2)

Backend + shared only. Run everything from the worktree.

## Build order (shared before backend)

```bash
pnpm --filter @properfy/shared build
pnpm --filter backend exec prisma generate   # after editing schema.prisma
pnpm generate:api                              # regenerate openapi.json + api-types.ts after route/schema changes
```

## TDD gates (in order)

```bash
# Shared
pnpm --filter @properfy/shared test
pnpm --filter @properfy/shared typecheck
pnpm --filter @properfy/shared lint

# Backend unit
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test

# Backend DB integration (testcontainers, serial — excluded from the main run)
pnpm --filter backend test:integration:db

# Consumers compile against the regenerated contract
pnpm --filter web typecheck
pnpm --filter pwa typecheck
```

## Manual smoke (local, after migration applied)

1. Apply the migration locally: `pnpm --filter backend prisma migrate dev`.
2. As an inspector with a `SCHEDULED` job today, `POST /v1/inspector/appointments/:id/cant-do` with `Idempotency-Key` and `{ reason: 'KEY_FAILED', note: 'Lockbox code wrong' }` → 200, appointment becomes `REJECTED` / `INSPECTOR_UNABLE`, unlinked from group + inspector.
3. `GET /v1/appointments/:id` as OP → `inspectorIssue` populated; as CL of another tenant → 404 on `/field-activity`.
4. `GET /v1/appointments/:id/field-activity` as OP → coordinates present; as CL of the tenant → no lat/lng keys.
5. `POST .../late-notice` on today's job before check-in → 201 with `estimatedArrivalAt`; after check-in → 422.
6. Completion reminder (after F02-1 merged): run the job twice → one `COMPLETION_REMINDER` notice, one `inspection.completion_reminder_sent` audit.

## Key acceptance evidence

- **00.A3**: integration tests `inspector-cant-do.integration.test.ts` (17) and `inspector-cant-do-after-check-in.integration.test.ts` (18).
- **Concurrency (SC-008)**: `cant-do-finish-concurrency.integration.test.ts` (23) — must fail when the `FOR UPDATE` lock or the CAS is removed; record the mutation result in the PR.
- **Privacy (SC-009)**: `appointment-field-activity.integration.test.ts` (20) asserts the absence of coordinate keys for CL.

## Pair handoff

Pilar builds the core slice first (event model/enums, can't-do→REJECTED, abandoned handling, finish lock+CAS, transition-source constant), then hands the absolute worktree path to Esteio for the late-notice/alert/field-activity/portal/rejection-email/reminder slice in the same directory. Pilar runs the final gates and opens the PR crediting both. The 03.16 reminder slice ships last and the PR rebases onto F02-1 before merge.
