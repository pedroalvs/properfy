# Quickstart — TASK-F03-3 (PWA field-event actions)

## Prerequisites
- Node 24, pnpm 9. Worktree branched from `origin/develop` (includes F03-1 + F03-2).
- Build the workspace packages the PWA consumes from `dist/`:
  ```bash
  pnpm --filter @properfy/shared build
  pnpm --filter @properfy/frontend-standards build
  ```

## Run the PWA locally
```bash
pnpm --filter pwa dev          # Vite dev server
# backend (for manual QA):
pnpm --filter backend dev
```

## Verify (the real gate)
```bash
pnpm --filter @properfy/shared build
pnpm --filter pwa typecheck
pnpm --filter pwa lint
pnpm --filter pwa test          # Vitest — the gate (Playwright E2E is broken repo-wide, D18; not run)
pnpm --filter pwa check:ds       # design-system class guard
pnpm --filter pwa build
```
All must pass; the diff must be ≤ 150 files and `git status --porcelain` must be empty (nothing under `build/` or generated).

## Manual QA checklist (iOS simulator + Android, backend local)
- Q1: today's schedule → "Check in" → grant location → success snackbar → card shows "Check out" → "Check out" (no link, in window) → job DONE.
- Q2: "Check out" on a job with an app link → `SyncConfirmModal`; after the end time → `PastTimeConfirmModal`.
- Q3: "More actions" → "Can't do this job" → `KEY_FAILED` → "Send to operations" → snackbar → card leaves the schedule.
- Q4: `SITE_ISSUE` with no note → send disabled; the "This note is shared with the agency." hint is visible.
- Q5: airplane mode → "Check in" → offline snackbar → leave airplane mode → queue syncs → badge clears.
- Q6: airplane mode → "Can't do this job" and "Running late" disabled with the connection alert.
- Q7: "Running late" → `TRAFFIC` + 20 → snackbar with the server ETA.
- Q8: BLOCK configured, position 900 m away → server 422 message; offline in BLOCK out of radius → item FAILED with the same message on sync **and the card returns to "Check in"** (L-F03-02); a new check-in near the property works.
- Q9: after check-in, "Can't complete this job" in `InProgressPanel` → back to the schedule, no exit blocker.
- Q10: screen reader (VoiceOver/TalkBack) reads the card action labels and the sheet controls.
- Q11: report "Can't do this job" (`KEY_FAILED`), OP re-offers, the same inspector re-accepts → the detail shows "You reported 'Key didn't work' on …" (L-F03-09).

## Key invariants to check by hand
- No `<button>` nested inside another `<button>` on the card (`container.querySelectorAll('button button').length === 0`).
- Field events never enqueue (offline → disabled, not queued).
- `accuracy` + `clientOccurredAt` ride on start/finish both online and when queued.
- All "today" checks use `useEffectiveTimezone`, never the device TZ.
