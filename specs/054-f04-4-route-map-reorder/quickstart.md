# Quickstart & Verification: F04-4

## Build / test gates (inside the worktree)

```bash
pnpm --filter @properfy/shared build
pnpm --filter pwa lint
pnpm --filter pwa typecheck
pnpm --filter pwa test
pnpm --filter pwa build
pnpm --filter pwa check:ds
pnpm --filter pwa test:e2e   # Playwright, Chromium + WebKit (CI gate test-pwa-e2e)
```

No `style.transform` on map markers:
```bash
grep -rn "style.transform" apps/pwa/src/lib/map apps/pwa/src/features/day-plan
# expect: no hits outside comments
```

## Bundle check (mandatory, recorded in the PR)

1. `pnpm --filter pwa build` on `develop` (F04-1/2/3 merged) and on the branch; record gzip for the entry chunk (`index-*.js`), the lazy Route/Reorder chunk, and total `dist/assets/*.js`.
2. `grep -l "ROUTE_ORDER_MISMATCH" apps/pwa/dist/assets/*.js` → which chunk holds `route-planning`.
3. **Limit**: entry chunk grows ≤ 5 kB gzip AND `route-planning` is not in the entry chunk (must be in the lazy Route chunk). If exceeded, apply the `@properfy/shared/route-planning` subpath export (+0.25) and re-measure. If still exceeded, stop and escalate.

## Manual QA checklist (iOS Simulator, Android/Chrome, iPad; backend with Mapbox real and stub)

**Map**
- [ ] M1: Route → Map: pins 1..N, start pin, line follows streets; approximate legs dashed (stub).
- [ ] M2: tap pin → chip → "Open details" opens the detail.
- [ ] M3: no base → no start pin; today-only origin → pin at new address.
- [ ] M4: zoom/pan → nothing jumps; markers don't snap to the corner (`style.transform` lesson); line colors correct in light and dark.

**Reorder**
- [ ] R1: drag stop 3 above 2 → ETAs with "~", "+N min vs. suggested", window warning if any; Save → final times, new line on map.
- [ ] R2: arrows do the same; VoiceOver announces new position and finish.
- [ ] R3: order that overruns a window → "Stop n would arrive after its window …"; Save still works (warn only).
- [ ] R4: two devices: save on A, save on B without reload → B shows "Your route was updated…" and reloads.
- [ ] R5: OP recalculates (web) while inspector edits → "Your route was updated…" on focus.
- [ ] R6: "Can't do this job" on another stop during edit → draft discarded with the message.
- [ ] R7: "Reset to suggested order" (with and without a saved order).
- [ ] R8: airplane mode: reorder works locally; Save disabled; network back → Save.
- [ ] R9: 10+ stops (staging): drag with autoscroll; 2-digit numbers legible.
- [ ] R10: iPad landscape: Route in pane, Map fills pane; save bar doesn't cover last item; iPhone: bar above home indicator.
- [ ] R11: "Reduce motion" → drag without animation.
