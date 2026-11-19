# Quickstart — X01 verification

## Local gates (run inside the worktree)

```bash
pnpm --filter @properfy/shared build          # web resolves shared from dist
pnpm --filter @properfy/frontend-standards build
pnpm --filter web typecheck                    # run clean; incremental cache can lie
pnpm --filter web lint                          # --max-warnings 0
pnpm --filter web test
git diff --stat origin/develop... | tail -1     # must be ≤ 150 files
```

No backend suite, no `pnpm generate:api` (no API change), no migration.

## Manual smoke (P7.2) — backend + web running with seed; accounts AM, CL_ADMIN, INSP

1. **AM menu**: hover/click "Dashboard" → flyout with Overview, Analytics, Workload; each opens the
   right screen with the group active; Tab→Enter opens, Tab cycles links, Esc closes and restores focus.
2. **CL_ADMIN menu**: flyout has only Overview and Analytics.
3. **INSP menu**: "Dashboard" is a plain link straight to `/dashboard`.
4. **Three dashboards**: no cluster buttons, no Back; cards/charts/periods/WeekSelector identical to develop.
5. **AM history**: `/map` → List view → `/appointments` → open an appointment → Back → list with
   same filters → Back → map.
6. **Direct link**: paste `/appointments/<id>` in a new tab → Back → `/appointments`. Logged-out:
   paste → login → Back → `/appointments`. Direct `/appointments`, change a filter → Back → `/map`.
7. **New tab**: Ctrl/Cmd+click a service group in the list → Back in the new tab → `/service-groups`.
8. **Discard confirm**: `/properties/new`, fill a field, Back → dialog opens → Cancel stays, Discard navigates.
9. **Query fallback**: direct `/integrations/fy-api` → Back → `/integrations` on the API Keys tab;
   direct `/service-groups` → Back → map in groups mode.
10. **Settings**: via user menu Account settings → Back → previous screen. Direct `/settings/account`
    → open Security tab → Back → `/dashboard`. Direct `/settings/security` (redirect) → Back → `/dashboard`.
11. **Tenants**: CL_ADMIN direct `/tenants/<own>` → Back → `/dashboard`, no permission toast. AM same
    → Back → `/tenants`. CL_ADMIN with a load error → "Back to Dashboard" in `EmptyState` → `/dashboard`.
12. **Keyboard/focus**: on 3 sub-screens, Tab from the top of content lands on Back first, focus ring
    visible; Enter navigates.
13. **Mobile (375px)**: on a sub-screen with a primaryAction, Back (icon + text) sits left of the
    title without wrapping it; the FAB stays.
14. **Import**: preview step → header Back → `/appointments`; "Previous step" → upload. During commit,
    header Back does nothing and the final report appears.
15. **Service group**: step 2 of `/service-groups/new` → "Previous step" → step 1; header Back exits
    (with discard confirm if dirty).
16. **Board**: "List" and "Map View" remain beside Back.
17. **Refresh with history**: `/map` → `/appointments/<id>` → F5 → Back → `/map` (`idx` survives refresh).

## Deploy / rollback

Front-only (web). No migration, endpoint, data or flag. The group and Back appear on the next app
load; lazy page imports are covered by the existing stale-chunk retry. Rollback = revert the PR;
`apps/web/CLAUDE.md` reverts with it.
