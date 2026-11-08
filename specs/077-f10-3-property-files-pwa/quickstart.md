# Quickstart — F10-3 PWA Property Files

## Prerequisites (fresh worktree)

```bash
pnpm install
pnpm --filter @properfy/shared build
pnpm --filter @properfy/frontend-standards build
```

> The PWA resolves both workspace packages only through their `dist/`. Rebuild after pulling.

## Run the PWA

```bash
pnpm --filter pwa dev
# log in as an inspector, open a scheduled job → the "Files" section is in the detail
```

## Manual test paths

1. **View files**: open a job with issues/documents → Files section, Issues subtab active → switch subtabs → download a document (PDF opens new tab; image previews inline).
2. **Report issue**: Issues subtab → "Report issue" → enter a reason → add 1–2 photos (watch per-photo progress) → submit → the new issue appears in the list.
3. **Report issue, one photo fails**: add two photos, force one to fail (e.g. offline toggle mid-upload) → the confirmed one stays, the failed one shows retry/remove → finish by retrying or removing.
4. **Can't do with photos**: on a SCHEDULED job → "Can't do this job" → pick a reason → add a photo → submit → the decline happens and an issue is created (source INSPECTOR, linked to the decline).
5. **Storage down / offline**: with the backend returning 503 → the shared "File storage is temporarily unavailable…" message; offline → "connect to load" and the Report-issue flow is unavailable.

## Verification gates (run inside the worktree)

```bash
pnpm --filter pwa lint
pnpm --filter pwa typecheck
pnpm --filter pwa check:ds
pnpm --filter pwa test          # Vitest unit/component
pnpm --filter pwa test:e2e      # Playwright, 4 projects (Chromium + WebKit)
```

> E2E needs both `dist/` built (globalSetup guards it). Use `PWA_E2E_PORT` to override port 5175 per worktree if taken.

## Key files

- Feature: `apps/pwa/src/features/property-files/`
- Modified: `apps/pwa/src/features/field-events/components/CantDoSheet.tsx`, `.../hooks/useReportCantDo.ts`, `apps/pwa/src/features/schedule/pages/AppointmentDetailPage.tsx`
- E2E: `apps/pwa/tests/e2e/property-files.spec.ts`
- CLAUDE.md to update in this PR: `apps/pwa/CLAUDE.md` (§8 "no photo upload" → F10-3 flips it; add the Files section + Report-issue + cant-do-photos to §4).

## Contract (consumed, unchanged)

See `contracts/consumed-endpoints.md`. No `openapi.json`/`api-types.ts` change in this PR (D19 — only TASK-F10-4 regenerates them).
