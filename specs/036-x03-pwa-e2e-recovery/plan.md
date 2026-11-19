# Implementation Plan: Recover the PWA Playwright E2E suite and add a real CI job

**Branch**: `036-x03-pwa-e2e-recovery` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/036-x03-pwa-e2e-recovery/spec.md`

## Summary

The PWA Playwright suite (`apps/pwa/tests/e2e`, 14 tests × 4 projects = 56) fails 56/56 on a clean
worktree and is not in CI. Diagnosis (reproduced 2026-10-29) confirms **H1**: a worktree without
`@properfy/frontend-standards/dist` makes Vite 500 on `App.tsx` (top-level `TIMING` import), so the
shell never mounts and every spec's first `getByTestId('login-form')` times out. The fix is
**harness/config/docs only** (no `apps/pwa/src/` change): a `globalSetup` dist guard, a strict
dedicated dev-server port with no server reuse, fixed timezone/locale/env/service-worker context,
`failOnFlakyTests` + JSON reporter in CI, a hermetic mock harness in `tests/e2e/support/`
(`api.ts`, `auth.ts`, `fixtures.ts`, `projects.ts`, `idb.ts`), a strict Vitest validator for the
fixtures, migration of the 14 existing specs onto the helpers, a new `test-pwa-e2e` CI job (hard
gate + `PWA_E2E_ADVISORY` kill switch), and documentation/memory updates.

## Technical Context

**Language/Version**: TypeScript 5.6 (ESM), Node.js 24 runtime target  
**Primary Dependencies**: `@playwright/test ^1.59.1`, Vite 5 + `vite-plugin-pwa`, Vitest 1,
`@properfy/shared` (Zod response schemas), `@properfy/frontend-standards`  
**Storage**: N/A (all API calls mocked via `page.route`; IndexedDB seeded in-browser for one spec)  
**Testing**: Playwright E2E (Chromium + WebKit, 4 projects); Vitest unit for the fixture validator  
**Target Platform**: Mobile browsers (iPhone 13/iPad gen 7 WebKit, Pixel 5/foldable Chromium)  
**Project Type**: Mobile-first PWA (`apps/pwa`) within a pnpm + Turborepo monorepo  
**Performance Goals**: Suite green and deterministic under `--repeat-each=3 --retries=0`; CI
job ~5–7 min in parallel (not on the critical path, which is `build` + DB integration)  
**Constraints**: Hermetic (no outbound network); strict dedicated port `5175` (overridable via
`PWA_E2E_PORT`), `reuseExistingServer: false`; Sydney timezone fixed; `failOnFlakyTests` in CI; no
`waitForTimeout`, no `**/v1/**` catch-all, no `window.fetch` patch; no `apps/pwa/src/` change beyond
a new `data-testid` where no accessible selector exists  
**Scale/Scope**: 14 specs × 4 projects = 56 tests; ~15 files changed (well under the 150-file cap)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Clean Architecture | **N/A** — no backend code; test harness only. |
| II. Multi-Tenant Safety | **N/A / preserved** — no new entities or queries; the PWA actor is `INSP` and fixtures mock `INSP`-scoped responses only. No tenant-scope logic introduced. |
| III. TDD (NON-NEGOTIABLE) | **Honored** — the fixture validator (`e2e-fixtures.test.ts`, T1–T5) and harness behaviors (T6–T11) are written red first, then the helpers make them green. This is itself a test-infrastructure feature; the suite it restores is the project's E2E gate. |
| IV. Contract-First APIs (NON-NEGOTIABLE) | **Honored** — fixtures are validated with `schema.strict().parse` against the canonical `@properfy/shared` response schemas (no type duplication); mock envelopes (`{ data }`, `{ data, pagination }`, plain `/v1/me`, `{ error: { code, message, details? } }`) match the live contract. |
| V. Simplicity & Minimal Impact | **Honored** — harness/config/docs only; zero app refactors; `optimizeDeps` added only if a reload is observed (A-10); dead/`waitForTimeout` patterns removed, not hidden. |

**Result: PASS.** No violations; Complexity Tracking not required.

Governance note: the constitution §Branching says "develop on `staging`", but the binding runtime
guidance (root `CLAUDE.md` §12, and this Phase-2 rollout) targets `develop`; explicit session/role
instruction (PR → `develop`) takes precedence per §Governance. Commits are Conventional, English
only, no AI/co-author trailers.

## Project Structure

### Documentation (this feature)

```text
specs/036-x03-pwa-e2e-recovery/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 — diagnosis + decision record
├── data-model.md        # Phase 1 — fixture ↔ shared-schema map
├── quickstart.md        # Phase 1 — how to run / debug the suite
├── contracts/
│   └── e2e-support-api.md   # The tests/e2e/support/ exported harness contract (for F04-3b)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/pwa/
├── playwright.config.ts            # MODIFIED — strict port, no reuse, globalSetup, CI reporters, context
├── vite.config.ts                  # MODIFIED (only if H4 reload observed) — optimizeDeps.entries
├── package.json                    # unchanged (test:e2e already present)
├── tests/e2e/
│   ├── support/                    # NEW — hermetic mock harness
│   │   ├── global-setup.ts         #   dist existence guard (H1)
│   │   ├── api.ts                  #   API origin, stubJson, blockUnmockedApi, blockExternal
│   │   ├── auth.ts                 #   loginAsInspector, BASELINE_STUBS
│   │   ├── fixtures.ts             #   pure response fixtures (no @playwright/test import)
│   │   ├── projects.ts             #   WIDE_PROJECTS, isWideProject, isWebKitProject, skipOnWide/skipOnPhone
│   │   └── idb.ts                  #   seedExecutionState
│   ├── auth.spec.ts                # MODIFIED — hermetic, mock 401 login
│   ├── schedule.spec.ts            # MODIFIED — /month stub, Sydney "today"
│   ├── marketplace.spec.ts         # MODIFIED — two-pane drift, drop dead /range stub
│   └── execution-finish.spec.ts    # MODIFIED — loginAsInspector + seedExecutionState + blockUnmockedApi
└── src/__tests__/
    └── e2e-fixtures.test.ts        # NEW — Vitest strict-parse validator for fixtures

.github/workflows/ci.yml            # MODIFIED — new test-pwa-e2e job after test-web-e2e
.gitignore                          # MODIFIED (if needed) — ensure pwa report/test-results ignored
apps/pwa/CLAUDE.md                  # MODIFIED — §1, §2, §10
CLAUDE.md (root)                    # MODIFIED — §16 verified, R12 notice reverted
```

**Structure Decision**: Single affected workspace (`apps/pwa`) plus the shared CI workflow and docs.
The harness lives under `tests/e2e/support/` so the PWA `tsconfig` (which excludes `tests/`) is not
touched, and the fixture validator lives under `src/__tests__/` so the Vitest `exclude:
['tests/e2e/**']` config is honored without change.

## Phase 0 — Research

Consolidated in [research.md](./research.md): the reproduced diagnosis (H1 confirmed, H2 latent),
the ranked hypotheses with their code evidence, and the decision record (L-X03-01..09) with
rationale and rejected alternatives. No open `NEEDS CLARIFICATION` remains.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md): the fixture ↔ `@properfy/shared` schema/route map, id/date
  formats, and the strict-validation rules (and Zod-3 nested-key limitation).
- [contracts/e2e-support-api.md](./contracts/e2e-support-api.md): the exported harness surface that
  F04-3b consumes (`api.ts`, `auth.ts`, `projects.ts`, `idb.ts`, `fixtures.ts`), including the
  last-route-wins rule and the baseline-stub ownership rule.
- [quickstart.md](./quickstart.md): prerequisites (both `dist/` built), run commands, strict port
  and `PWA_E2E_PORT`, trace capture, and the CI/kill-switch model.

## Complexity Tracking

No constitution violations; not applicable.
