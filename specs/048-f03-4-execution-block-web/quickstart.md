# Quickstart — F03-4 (web)

## Prerequisites
- F03-1 and F03-2 merged on `develop` (contracts present in `packages/shared`).
- Worktree deps installed; `@properfy/shared` and `@properfy/frontend-standards` built to `dist/` (web resolves them from `dist/`).

## Build shared packages (required before web gates)
```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## Dev
```bash
pnpm --filter web dev     # http://localhost:5173
```

## Gates (run inside the worktree before PR)
```bash
pnpm --filter web typecheck   # clean incremental cache can lie — if in doubt, remove tsbuildinfo
pnpm --filter web lint        # eslint --max-warnings 0
pnpm --filter web test        # Vitest + RTL
# E2E in CI mode (stubbed API):
CI=1 pnpm --filter web exec playwright test \
  tests/e2e/appointment-inspector-issue.spec.ts \
  tests/e2e/appointment-field-activity-cl.spec.ts \
  tests/e2e/platform-settings.spec.ts \
  tests/e2e/portal-inspector-unable.spec.ts
```

## Manual QA (per `feedback_test_portals_each_session`)
1. **AM/OP**: open an appointment detail with a completed execution + a `CANT_DO` event → see the Field activity block (times, distances, flag chips) and the "Inspector couldn't complete" card; open the map modal → compact card; Timeline tab → new labels/badges.
2. **CL_ADMIN / CL_USER**: same detail → distances + flags present, **no coordinate anywhere**; dialog does not offer "Inspector Unable".
3. **AM/OP**: open `/platform-settings` → edit radius/mode/tolerance/reminder → Save → reload → values persisted; "Default" badge gone, "Last changed by …" shown; try radius 49 / tolerance 241 / reminder 721 → inline errors; select Block → fallback help text.
4. **Tenant portal**: with a real link after a `cant-do` in a local env → banner "The agency will contact you to arrange a new time.", no time picker.
5. Confirm existing dashboards (Dashboard/Analytics/Workload) are visually unchanged.

## Definition of done
- 00.A3 (web) and 03.A2 (web) satisfied (see spec Success Criteria).
- All gates green; four E2E specs pass in CI mode; ≤ 150 changed files (`git diff --stat origin/develop... | tail -1`).
- `apps/web/CLAUDE.md` updated for the new page/route/components/hook.
