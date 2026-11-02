# Quickstart: PWA App Tour

## Prerequisites (one-time per fresh worktree)

```bash
pnpm install
pnpm --filter @properfy/shared build          # PWA/E2E resolve shared via dist/
pnpm --filter @properfy/frontend-standards build
```

## Run the tour locally

```bash
pnpm --filter pwa dev
# Log in as an inspector whose onboarding is not yet completed, land on /today → tour opens.
# Replay any time: More → App settings → "Show app tour".
```

## Tests (TDD order)

```bash
# Unit/component (Vitest) — write first, watch them go red → green
pnpm --filter pwa test -- tour
pnpm --filter pwa test -- ProfileSettingsPage
pnpm --filter pwa test -- e2e-fixtures

# E2E (Playwright) — the 00.A1 gate. Needs both dist/ built first.
pnpm --filter pwa test:e2e -- app-tour
# Local flake sanity before PR:
pnpm --filter pwa exec playwright test app-tour --repeat-each=3 --retries=0
```

## Full gate set (inside the worktree, before PR)

```bash
pnpm --filter @properfy/shared build \
  && pnpm --filter pwa lint \
  && pnpm --filter pwa typecheck \
  && pnpm --filter pwa test \
  && pnpm --filter pwa build \
  && pnpm --filter pwa check:ds \
  && pnpm --filter pwa test:e2e
# And confirm NO new dependency:
git diff origin/develop... -- apps/pwa/package.json   # must be empty
```

## E2E scenarios (gate for 00.A1)

| # | Scenario | Expectation |
|---|---|---|
| E1 | First access, browser | dialog "Today" visible, "Step 1 of 9", overlay present |
| E2 | Skip | dialog closes; **1** POST app-state with `onboardingCompleted:true` |
| E3 | Next→Done | counter to "Step 9 of 9"; 1 POST; dialog closes |
| E4 | No reappear | after completing + mock now returns a filled date, reload & fresh context → no dialog in 3s |
| E5 | Replay from settings | opens on /today; Skip/Done → **0** completion POSTs |
| E6 | Install step conditional | browser → "Install Properfy" present (9); standalone emulated → absent ("Step 8 of 8") |

Tour specs run only on the 2 phone projects (`skipOnWide('tour targets are phone-layout anchors')`); 6 × 2 = 12 executions.

## Manual device QA (complementary, T2–T4/T7–T11)

iOS Safari install instructions; Android install prompt; cross-device no-reappear; no-stops-today step skipping; VoiceOver/TalkBack; reduced-motion; tablet rotation; airplane-mode completion + staging `onboardingCompletedAt` via API. Screenshots never committed.
