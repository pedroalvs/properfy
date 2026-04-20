# QA user provisioning for staging

The staging environment previously lacked `CL_ADMIN` and `CL_USER` fixtures,
blocking the Block C tests (`C1.3`, `C1.4`, `C2.3`, `C4.5`). This document
captures how those roles are now provisioned and how to re-run the
procedure on demand.

## What ships automatically

Every `staging` push triggers `Deploy to Fly.io`. The `release_command` in
`fly.staging.toml` now runs:

```bash
prisma migrate deploy \
  && node dist/prisma/provision-qa-users.js
```

`provision-qa-users` is bundled by `tsup` alongside the server, so it lives
inside the production image (no tsx runtime needed). It is idempotent and
only touches the four QA accounts and the Sydney tenant/branch scaffolding
they depend on — it will never alter appointments, properties, invoices, or
any other business data.

## Credentials made available

| Role | Email | Password | Scope |
|---|---|---|---|
| `AM` | `admin@pedroalvs.com` | `Admin@1234` | Platform-wide (tenant_id: null) |
| `OP` | `op@pedroalvs.com` | `Admin@1234` | Cross-tenant (tenant_id: null) |
| `CL_ADMIN` | `cl.admin@pedroalvs.com` | `Admin@1234` | Sydney Property Services |
| `CL_USER` | `cl.user@pedroalvs.com` | `Admin@1234` | Sydney Property Services |

## Manual re-provisioning

If a specific staging run needs the fixtures refreshed without a full
deploy, ssh into the Fly.io machine and run the script directly:

```bash
flyctl ssh console -a properfy -C \
  "sh -lc 'cd /app/apps/backend && node dist/prisma/provision-qa-users.js'"
```

Local / CI environments can run the tsx version instead:

```bash
pnpm --filter backend qa:provision-users
```

## What the script does

1. Looks up the Sydney Property Services tenant by `legal_name`. Creates it
   (with a fixed UUID) if missing; reuses the existing row otherwise.
2. Ensures one active branch exists for that tenant.
3. For each of the four QA emails, either updates the existing user (role,
   status=ACTIVE, tenant/branch bindings, password rehashed) or creates a
   fresh row with the fixed UUID.
4. Clears any `failed_login_count` / `locked_until` that would block login.

## What the script does NOT touch

- `appointments`, `properties`, `inspectors`, `branches` beyond the first
  active one, `financial_entries`, `inspector_invoices`, etc.
- Existing users outside the four QA emails (no deletions, no password
  changes).
- Tenant records other than the Sydney one.
- Any configuration in `settings_json`.

Use `pnpm --filter backend prisma:seed` for the full demo database. Use
this script to keep only QA credentials in sync.
