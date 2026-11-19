# Quickstart / Verification — F06-1

Run inside the worktree (`.claude/worktrees/f06-1`). Gates are run via a subagent that returns a condensed pass/fail summary.

## Build order (shared first — backend/web consume `dist`)

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build   # already built at setup
pnpm --filter backend exec prisma generate
```

## Shared

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared test
pnpm --filter @properfy/shared typecheck
pnpm --filter @properfy/shared lint
```

## Backend (FULL suite — includes integration; plan reader needs the DB suite)

```bash
pnpm --filter backend typecheck
pnpm --filter backend lint
pnpm --filter backend test
pnpm --filter backend test:integration:db   # tenant-eta-plan.reader.integration.test.ts
```

## Web (lint required because the diff touches shared + api-types)

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test -- platform-settings notification-templates tenants notification-consents
```

## Contract freshness

```bash
pnpm --filter backend generate:openapi
pnpm --filter @properfy/shared generate:types
git add packages/shared/openapi.json packages/shared/src/api-types.ts
```

## PR size

```bash
git diff --stat origin/develop... | tail -1   # < 150 files (≈60 expected)
```

## Boot smoke (deploy verification)

```sql
SELECT template_code, channel, notification_class
FROM notification_templates
WHERE tenant_id IS NULL AND template_code LIKE 'TENANT_ETA_%';
-- expect 6 rows, all OPERATIONAL
```

`tenantEtaNotices` is born `enabled:false`; nothing is sent in this PR regardless.
