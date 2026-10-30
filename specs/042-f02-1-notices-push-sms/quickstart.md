# Quickstart — Inspector Notices Backend (TASK-F02-1)

## Prerequisites

- On branch `042-f02-1-notices-push-sms` (worktree off `origin/develop`).
- `pnpm install`; `pnpm --filter @properfy/shared build`; `pnpm --filter backend exec prisma generate`.
- Optional local VAPID keys: `npx web-push generate-vapid-keys` → set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@example.com` in `apps/backend/.env`. Without them, push is disabled and critical notices fall back to SMS (safe degradation). Add the three names (empty) to `apps/backend/.env.example`.

## Build & verify (the real correctness gate, run inside the worktree)

```bash
pnpm --filter @properfy/shared build && pnpm --filter backend exec prisma generate
pnpm --filter @properfy/shared lint typecheck test
pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test
pnpm --filter backend test:integration:db          # testcontainers, serial
pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types
git diff --stat packages/shared/src/api-types.ts    # must show the regenerated client committed
git diff --stat origin/develop... | tail -1         # <= 150 files
```

## Smoke (local)

1. Start backend (`pnpm --filter backend dev`), log in as AM/OP, grab a JWT.
2. Publish a critical notice to an inspector that is ACTIVE, has a phone, and has no push subscription:

   ```bash
   curl -X POST localhost:3000/v1/inspector-notices \
     -H "Authorization: Bearer $AM_JWT" \
     -H "Idempotency-Key: $(uuidgen)" \
     -H "Content-Type: application/json" \
     -d '{"title":"Road closure","body":"Pacific Hwy closed","critical":true,"audience":{"type":"SELECTED","inspectorIds":["<inspectorId>"]}}'
   ```

3. Let the `inspector-notice.deliver` job run (`ENABLE_JOB_QUEUE=true`). Confirm one `notifications` row:

   ```sql
   SELECT template_code, channel, tenant_id, notification_class, recipient
   FROM notifications
   WHERE template_code = 'INSPECTOR_NOTICE_SMS'
   ORDER BY created_at DESC LIMIT 1;
   -- expect: INSPECTOR_NOTICE_SMS | SMS | NULL | TRANSACTIONAL | <inspector phone>
   ```

4. Confirm the platform template exists (created by `syncPlatformTemplates` at boot):

   ```sql
   SELECT template_code, channel, notification_class
   FROM notification_templates
   WHERE tenant_id IS NULL AND template_code = 'INSPECTOR_NOTICE_SMS';
   ```

## Acceptance-criteria quick map

- **00.A2 (SC-001)**: DB integration test `inspector-notice.integration.test.ts` — publish (critical, SELECTED) → run `inspector-notice.deliver` with real repos → one `notifications` SMS row for the inspector without a subscription; a sender-`SENT` variant produces zero.
- **00.A4 (SC-002)**: `inspector-notice.routes.test.ts` — publish → `GET /v1/inspectors/me/notices` (recipient) → `POST …/read` → admin `readCount` 0→1 in list and detail.
- **Multi-tenant scoping (SC-006)**: `inspector-notice-rbac.test.ts` + a §7.1 test that a `CL_*`/`INSP` actor cannot read another subject's rows; INSP endpoints scoped to the caller's `inspectorId`.
- **Idempotency concurrency (7c)**: DB test runs two `PublishInspectorNoticeUseCase.execute` in parallel with the same key → one row; must fail without `pg_advisory_xact_lock`.

## Deploy notes

- Migration is expand-only; runs in the Fly release command. Generate per-environment VAPID keys (`fly secrets set …` for prod — user runs it, never without explicit request).
- Optional envs: `INSPECTOR_NOTICE_SMS_DAILY_CAP` (default 500; set low, e.g. 20, in staging for QA), `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (default 30).
- This backend PR merges **before** the web (F02-2) and PWA (F02-3) PRs; the PWA in production before this would 404.
