# Agent guidance — see `CLAUDE.md`

`CLAUDE.md` at the repository root is the single source of truth for how agents
operate in this monorepo: project overview, architecture, domain modules, the
appointment state machine, RBAC, multi-tenant rules, API/notification/financial
conventions, testing strategy, CI/CD, and the working conventions every agent
must follow.

This file used to duplicate that content and drifted out of sync. It is now a
pointer so there is exactly one place to maintain.

**Read `CLAUDE.md` (root), then the workspace file for whatever you are touching:**

- `apps/backend/CLAUDE.md`
- `apps/web/CLAUDE.md`
- `apps/pwa/CLAUDE.md`
- `packages/shared/CLAUDE.md`
