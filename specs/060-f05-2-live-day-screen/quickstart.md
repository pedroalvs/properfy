# Quickstart: Live Day screen (web)

## Build the shared packages first (required)

Web resolves `@properfy/shared` and `@properfy/frontend-standards` only through their `dist/`:

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

## Gates (run inside the worktree)

```bash
pnpm --filter web typecheck   # clean the TS cache if it lies (memory)
pnpm --filter web lint        # --max-warnings 0 (WEB-6)
pnpm --filter web test        # Vitest unit/component (a11y invariants asserted; no axe engine)
git diff --stat origin/develop... | tail -1   # must be < 150 files
```

## Manual browser QA (with the local backend)

Run the backend + web, log in as AM (or OP), open `/live-day`:

1. **Today (live)**: list + pins render; state badges, progress, delay, alerts; "Updated N s ago" ticks; with DevTools → Network, confirm a `live-day` request every 30 s and that it **pauses when the tab is hidden** and resumes on focus. Confirm **no** request to `api.mapbox.com/directions`.
2. **01.A4**: check in a stop via the PWA (or `POST /v1/inspector/appointments/:id/start`) → within 30 s the pin + row show "At a property"; check out with a remaining stop → "In transit"; last check-out → "Done for the day".
3. **01.A5**: trigger/seed each alert type and confirm it renders with the specified copy and counts in "Needs attention"; toggle the filter and confirm non-alerting inspectors disappear.
4. **Select an inspector**: route drawn in the inspector colour (dashed "Approximate route"), stop list with done/current/remaining times, appointment-code links open in the same tab; "Back to all inspectors" / Escape returns and restores focus.
5. **Show all routes**: ≤ 40 visible → every route draws with the legend; > 40 visible → toggle disabled with the tooltip.
6. **Date selector**: yesterday → polling stops, "Planned HH:mm" / "not started that day" copy, routes still dashed; tomorrow → still polls; "Today" disabled on today; `?date=` 10 days out → lands on today with "That day isn't available yet. Showing today.".
7. **Mobile (375 px)**: panel collapses via "Map / List"; no horizontal scroll; touch targets ≥ 44 px. Re-check `/map` on desktop (saved width intact) and at 375 px (lasso + filters still work).
8. **a11y**: keyboard-only pass (header → date → Today → toggles → list → footer, Enter selects, Escape returns); the automated tests assert the ARIA/keyboard invariants directly (no axe engine — the web workspace has none).

Screenshots stay out of the commit.
