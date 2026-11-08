# Quickstart — Goals & Rewards web (TASK-F08-3)

## Build & verify (inside the worktree)

```bash
# 1. Build the shared package first (web resolves @properfy/shared from dist/)
pnpm --filter @properfy/shared build
pnpm --filter @properfy/shared typecheck
pnpm --filter @properfy/shared test        # includes goal-copy.test.ts

# 2. Web gates
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test                      # Vitest + RTL + MSW (a11y via explicit ARIA/keyboard assertions; no axe engine in this workspace)

# 3. E2E (03.A4) — needs a local backend; run via a subagent that returns a condensed summary
pnpm --filter web test:e2e -- inspector-program-rewards

# 4. PR size guard
git diff --stat origin/develop... | tail -1   # must be < 150 files
```

> `api-types.ts` already carries the F08-1 routes — do **not** regenerate unless the CI `contract-freshness` job flags drift (then `pnpm generate:api` and commit both files).

## Manual QA (browser — `feedback_qa_must_test_in_browser`)

Log in as each role and confirm:
- **AM**: Dashboard menu shows "Goals & rewards" (last child). Create a goal → it lists. Rewards tab → pick a closed period → approve/void a sample award (no "Mark as paid" anywhere). Platform settings → Inspector program section saves. Inspector performance → Level column reflects thresholds.
- **OP**: same as AM (both cross-tenant; approve works for OP, DV2).
- **CL_ADMIN**: no "Goals & rewards" menu item; visiting `/goals-rewards` redirects to the dashboard (Q18).

## Key reuse map (don't reinvent)

| Need | Reuse |
|---|---|
| Page shell + back button | `PageHeader` (`backTo`, `onBack` override), `useGoBack` |
| List + filters + table | `ListFilterTableTemplate`, `DataTable` (column config; rows not keyboard-focusable → focusable button cell) |
| Dialogs | `Dialog` (`project_dialog_focus_steal_oncloseref`) |
| Selects | `SelectInput` (`project_select_option_scope_bugs`) |
| Platform settings section | `features/platform-settings` + `usePlatformSetting(key)`; `getFieldErrors` for 400 details; "Save changes" label |
| Status colours | `lib/status-colors.ts` `REWARD_AWARD_STATUS_MAP` (existing tokens) |
| Dates (Sydney) | shared `civilDateInTz`/instant helpers + a deterministic month-array formatter (not `@/lib/format-date`, not Intl month names — ICU drift) |
| Goal copy | shared `describeGoal`, `GOAL_METRIC_LABELS`, `REWARD_AWARD_STATUS_LABELS`, `INSPECTOR_LEVEL_LABELS`, `resolveInspectorLevel` |
| Menu | `components/shell/Sidebar.tsx` Dashboard submenu — append as **last** child (X01 order) |
| Routing | `app/router.tsx` `Loadable(lazyRetry(...))` + `AuthGuard roles={[AM, OP]}` |

## Gotchas carried from siblings (memory)

- **Empty `?inspector=`/`?period=` query**: `searchParams.get(x) || null` (empty string `!== null` opens a stuck skeleton — `project_f07_3_inspector_performance_web`).
- **Mounting a fetching child into an existing page** (PlatformSettingsPage, F07 page) breaks that page's tests via mockOnce-queue pollution → mock the new hook in the page's existing test (`project_f03_4_execution_block_web`, `project_vitest_mockonce_queue_pollution`).
- **`PlatformSettingsPage.test.tsx` already needs a `QueryClientProvider`** (F07-3 added one for `ReliabilityIndexSection`); the new section may invalidate `['reliability']`/`['inspectorProgram']` on save.
- **TZ-dependent tests pin `TZ` away from Sydney** (`feedback_tz_dependent_test_must_pin_away`).
- **`gh pr checks --watch | tail` swallows the exit code** — run without the pipe when verifying CI (`feedback_pipe_swallows_exit_code_in_verification`).
