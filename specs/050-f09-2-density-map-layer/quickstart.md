# Quickstart: Activity density layer (web)

## Prerequisites

- `origin/develop` with TASK-F09-1 merged (PR #1326) — `GET /v1/map/execution-density` in `api-types.ts`. Verified.
- `pnpm install` done; `@properfy/shared` and `@properfy/frontend-standards` built to `dist/` (web resolves both only through `dist`).

## Build & verify (inside worktree)

```bash
pnpm --filter @properfy/shared build
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
# map flow touched → re-run the web E2E gate (Chromium-only, all API calls stubbed; prove no regression, no new spec needed):
CI=1 pnpm --filter web test:e2e
git diff --stat origin/develop... | tail -1   # expect ~14 files, < 150
```

## TDD order

1. `DensityLayer.test.tsx` (L1–L12, L6a, L7a–L7d) → `DensityLayer.tsx` → `components/map/index.ts` export.
2. `execution-density-period.test.ts` (P1–P10) → `execution-density-period.ts`.
3. `useExecutionDensity.test.tsx` (H1–H10) → `useExecutionDensity.ts` → `hooks/index.ts` export.
4. `ExecutionDensityControl.test.tsx` (C1–C17) → `ExecutionDensityControl.tsx`.
5. `AppointmentMapPage.test.tsx` (E1–E5) → ≤ ~12-line wiring in `AppointmentMapPage.tsx`.
6. `apps/web/CLAUDE.md` update (X00).

Each test file is written first, run red, then implemented green.

## Browser smoke (4 profiles, backend + web local, seed with executions in two agencies)

1. **AM**: `/map` → Activity density → panel `Last 30 days`, heat visible; Network `fromDate = today-29`, `toDate = today`. `Last 7 days` → new request. Filter one agency then one inspector → requests carry `tenantId`/`inspectorId`, heat changes. Lasso on + draw → polygon above heat. Change pin "Date Range" → no density request.
2. **OP**: same as AM (no `tenantId` in JWT).
3. **CL_ADMIN (agency A)**: `Your agency's inspections only. Other map filters don't apply.` + `Areas with fewer than 3 check-ins are hidden for privacy.`; no Custom tab; Network has no `tenantId`/`inspectorId`; no cell `count < 3`; heat only over A. AM filtered to A sees 1–2 cells the CL does not.
4. **CL_USER (agency B)**: heat differs from CL_ADMIN of A (D.A3 visual).
5. Groups mode → button absent. Custom (AM) 400 days → inline message, no request. Legend shows `1` and the max; max changes 7↔90 days. Backend down → empty layer + Retry. Keyboard: Tab/Enter/arrows/Escape.

Screenshots are review artifacts — never committed.
