# Quickstart / QA: Locked time and per-inspector alert limits (web)

Web-only. No migration, no backend deploy. Sign in as **AM** (or OP) — every surface is AM/OP-only.

## Build & verify (inside the worktree)

```bash
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
pnpm --filter web typecheck
pnpm --filter web lint        # eslint --max-warnings 0
pnpm --filter web test
# size gate (must be < 150):
git diff --stat origin/develop... | tail -1
```

## Manual QA — Locked time (01.13)

1. Open `/live-day`. Confirm a tab strip "Inspectors" (active) / "Locked time".
2. Click **Locked time**: the map keeps its pins/routes; only the panel body changes; the
   "Route ETA accuracy" footer stays visible.
3. Confirm the title "Locked time", the help tooltip, the overall summary ("Overall: X% locked
   (c of r)") with a meter, and the "By agency" + "By region" tables.
4. Switch the **Period** selector between Next 7 / 14 (default) / 30 days — a new query runs and the
   subtitle shows the real civil range (e.g. "5 Nov – 18 Nov").
5. Go back to **Inspectors**, pick **yesterday**, return to **Locked time** — the range still starts
   from **today** (L-F05-09).
6. Click the **Locked** column header — rows sort asc/desc; "No region" stays last.
7. Confirm a region row shows "North · Ray White", a global region shows "North · Platform", and
   "No region" has no suffix (L-F05-13).
8. Deep link `/live-day?tab=locked` opens on the Locked time tab.

## Manual QA — Alert limits (01.A5, end-to-end)

1. In **Platform settings → Live Day alerts**, change the **Delay alert** default from 20 to **15**,
   Save ("Settings saved."). Within ~60 s, an inspector running 16 min late shows a **Delay** alert on
   the Live Day (next poll).
2. Open that inspector's drawer → **Details → Live Day alerts → Edit**, set a **Delay** override of
   **40**, Save ("Alert limits saved."). The inspector's Delay alert **disappears** on the next poll
   (editor sees it immediately via `['live-day']` invalidation).
3. Check "Use platform default" for Not-started, Save → the override `PUT` sends
   `{ delayMinutes: 40, notStartedMinutes: null }`; the read view shows "40 min (custom)" /
   "30 min (platform default)".
4. Validation: enter 4 (or a decimal, or clear a field without the box) → "Enter a value between 5 and
   240 minutes."; Cancel/Escape discards and restores the read view.
5. Open an inspector drawer as **CL_ADMIN** (via `/inspectors`) — the "Live Day alerts" section is
   absent and no alert-thresholds request fires (check the network tab: no 403).

## Manual QA — Open inspector (L-F05-14)

1. In the Live Day inspector view, click **Open inspector** → lands on `/inspectors?open=<id>` with
   the drawer open.
2. Close the drawer → `open` is removed from the URL (no new history entry). Browser **Back** returns
   to the Live Day with the previous `?date`/`?inspector` selection.
3. `/inspectors?open=<unknown uuid>` → drawer shows "This inspector no longer exists." (no console
   error); `/inspectors?open=abc` → no drawer.
4. Row-click still opens the drawer as before.

## Rollback

Revert the PR. Any overrides already stored keep working in the backend calc; to clear one, `PUT`
`{ delayMinutes: null, notStartedMinutes: null }` via the API.
