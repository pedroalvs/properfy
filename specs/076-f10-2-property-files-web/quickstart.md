# Quickstart — F10-2 (Property Files & Issues, Web)

## Prerequisites

- In the worktree `076-f10-2-property-files-web` (branched from `origin/develop` @ `ebf1b8e7`, which includes F10-1).
- Build the workspace packages consumed from `dist/` (web resolves `@properfy/shared` and `@properfy/frontend-standards` only from `dist/`):
  ```bash
  pnpm install
  pnpm --filter @properfy/shared build
  pnpm --filter @properfy/frontend-standards build
  ```

## Verify (gates, run inside the worktree)

```bash
pnpm --filter web typecheck
pnpm --filter web lint          # jsx-a11y runs with --max-warnings 0
pnpm --filter web test          # Vitest unit/component
pnpm --filter web test:e2e      # Playwright hermetic (Chromium) — CI gate test-web-e2e
```

> Do **not** run `pnpm generate:api` — F10-2 introduces no contract change (F10-4 owns the next regen). If a typecheck error references missing F10 routes/fields, the `@properfy/shared` `dist/` is stale — rebuild it.

## Manual smoke (dev)

```bash
pnpm --filter web dev
```

1. **AM/OP** → open an appointment → **Files** tab (after Portal Activity). Confirm Issues subtab default, counted subtabs, name search, upload a Document, add a New version, open Versions, download both (C.A3), delete a file.
2. Create an issue (reason + 1 photo) → appears on Issues subtab; **Mark as seen** flips the state.
3. Open the matching **property** → **Files** tab (after Appointments) → the appointment-uploaded file shows under the same subtab with "Appointment #{code}" + **Open appointment** (C.A1); **View all property files** from the appointment navigates here.
4. With an unseen issue present: a yellow dot shows on **Map** (appointment issues) / **Properties** (property-only issues); the list row shows a yellow left border; the **With issues** filter narrows the list; marking seen clears the dot + border.
5. Try an oversized/wrong-type file → clear rejection message (C.A5).
6. **Platform settings** → **Files** section → edit a field within bounds → Save → value round-trips.
7. **CL_USER**: Files tab visible, read-only (no upload/create/version/delete/mark-seen); no sidebar dot. Simulate a 503 on a file route → `FILE_STORAGE_UNAVAILABLE_MESSAGE`.

## Definition of done

- All five user stories' acceptance scenarios pass; SC-001…008 demonstrable.
- Gates green inside the worktree; PR < 150 files; `apps/web/CLAUDE.md` updated.
- No backend/schema/`api-types.ts` change; no raw ids/coords in the DOM.
