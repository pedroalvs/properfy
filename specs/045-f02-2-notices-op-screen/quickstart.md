# Quickstart — Inspector notices Web (045)

## Build & verify (inside the worktree)

```bash
pnpm --filter @properfy/shared build          # web typecheck resolves shared from dist/
pnpm --filter web lint                          # --max-warnings 0
pnpm --filter web typecheck                     # run clean; the incremental cache can lie (memory)
pnpm --filter web test                          # Vitest + RTL
CI=1 pnpm --filter web test:e2e                 # existing web E2E suite, prove no regression
```

## Manual smoke (backend local + web dev)

1. Start backend (`pnpm --filter backend dev`) and web (`pnpm --filter web dev`).
2. Sign in as **AM**. Confirm the Sidebar "Dashboard" group shows "Inspector notices" between
   Overview (or Live Day if present) and Analytics. Sign in as **OP** → same. Sign in as
   **CL_ADMIN** → the item is absent; typing `/inspector-notices` is denied by `AuthGuard`.
3. **Publish (ALL, non-critical)**: New notice → title + message → Audience "All active
   inspectors" → Publish → ConfirmDialog has no SMS/time phrase → confirm → snackbar "Notice
   published to N inspectors"; the row appears at the top of the list.
4. **Publish (critical, SELECTED)**: mark Critical, pick 2 inspectors → ConfirmDialog shows
   "Up to 2 inspectors may receive an SMS." (and the Sydney night-time phrase if between
   21:00–07:00) → confirm.
5. **Publish (critical, REGION)**: choose a region "{name} (K inspectors)" → ConfirmDialog
   shows "Up to K inspectors may receive an SMS."
6. **Message hint**: the Message field shows "Shown on the lock screen. Don't include keys,
   codes or tenant details."
7. **Detail / 00.A4 panel**: open a notice → "Read by X of Y"; have an inspector open it in
   the PWA/app → refresh → that row flips to "Read" with a time and X/Y increases.
8. **Accessibility chips (L-F02-09)**: a notice whose audience includes an INACTIVE or
   no-app-access inspector shows "(Z can't read in the app)" and the "Inactive" / "No app
   access" chips next to the names.
9. **Archive**: on an active notice → Archive → confirm → snackbar "Notice archived"; the
   Archive button disappears; InfoBanner appears; the list "Archived" filter shows it.
10. **Idempotency**: double-click Publish / drop the network and retry → exactly one notice.
11. **Push tooltip (D10)**: on `/inspectors`, the "Push" column/detail tooltip reads "Push is
    on for at least one of the inspector's devices" (On) / "No device has push turned on"
    (Off) / "No data yet" (—).
