# Quickstart — F04 Plan B PR-B (PWA reorder via server preview)

## Build / verify (inside the worktree)

```bash
pnpm install
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
pnpm --filter pwa typecheck
pnpm --filter pwa lint
pnpm --filter pwa test
pnpm --filter pwa build        # record entry vs lazy chunk gzip sizes for the PR
pnpm --filter pwa check:ds
```

Grep gates (must be empty in `apps/pwa/src/features/day-plan`, outside comments):

```bash
grep -rn "routingInput" apps/pwa/src/features/day-plan      # reorder path: none (map/geometry untouched)
grep -rn "evaluateSequence\|toOptimizerInput\|buildLegOverrides" apps/pwa/src/features/day-plan
```

## Manual QA (checklist R1–R11 / M-series from TASK-F04-4, reorder subset)

Backend local/staging with Mapbox real and with the stub:

- R1: drag stop 3 above 2 → after ~400 ms the summary shows the server finish "~", "+N min vs.
  suggested" and (if applicable) a window warning; Save → final Directions times.
- R2: arrows do the same; VoiceOver announces the new position immediately, then finish/delta.
- R3: an order that overflows a window shows "Stop n would arrive after its window …"; Save works.
- R4/R5: save on device A / OP recalculates → device B shows "Your route was updated…" and reloads.
- R6: "Can't do this job" mid-edit → draft discarded with the removal notice.
- R7: "Reset to suggested order" (with and without a saved order).
- R8: airplane mode → reorder changes locally, times show "unavailable offline", Save disabled;
  back online → times refresh, Save enabled.
- Started day: after the first check-in, reorder the tail → times show "unavailable for a started
  day", no delta; Save still follows its rules (premise P2; asymmetry flagged to coordinator).

## E2E

PWA Playwright suite (Chromium + WebKit, hermetic). If any spec navigates the reorder screen,
`POST /v1/inspector/day-plans/:date/order/preview` is added to `BASELINE_STUBS`.
