# Implementation Plan: Inspector base address, banner, heartbeat & push slot (PWA)

**Branch**: `041-f01-3-inspector-base-app` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/041-f01-3-inspector-base-app/spec.md`

## Summary

Wire the inspector-facing PWA onto the base-address + app-state contracts already shipped by TASK-F01-1 (#1317): an editable, validated **base address card** on `/profile/account`; a fixed, non-dismissable **`BaseAddressBanner`** (two variants) on `/schedule` and `/profile`; a throttled **app-state heartbeat** from `PwaLayout`; a reserved **push-preference slot** plus a build **version footer** on `/profile/settings`; and the **E2E baseline stub** for `POST /v1/inspectors/me/app-state`. No backend, schema, or API-contract changes.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24  
**Primary Dependencies**: React 18, Vite 5, React Router 6, TanStack Query 5, react-hook-form, Zod 3 (via `@properfy/shared`), Tailwind 3, lucide-react; Playwright (E2E), Vitest 1 + Testing Library (unit)  
**Storage**: Client `localStorage` only (heartbeat throttle key `properfy.pwa.appStateHeartbeat`); no DB (backend persists on `Inspector`, TASK-F01-1)  
**Testing**: Vitest + React Testing Library (unit), Playwright (hermetic E2E, Chromium + WebKit — `test-pwa-e2e` gate)  
**Target Platform**: PWA on mobile (iOS Safari ≥16.4 for push, Android Chrome) + desktop installed browsers  
**Project Type**: Mobile PWA frontend (`apps/pwa`) consuming the Properfy API; shared contracts in `packages/shared`  
**Performance Goals**: Heartbeat ≤ 1 request / 6 h / device; no added boot blocking; banner render is synchronous off `useInspectorMe`  
**Constraints**: `__APP_VERSION__` ≤ 40 chars; `localStorage` access wrapped in try/catch (unreliable in jsdom and private mode); no raw inspector coordinates ever read/sent by the client; shared `dist/` built before PWA typecheck/lint/test  
**Scale/Scope**: ~5 PWA screens/components touched, 1 new hook, 1 new component, 1 build helper, 1 CI workflow edit, 1 E2E baseline edit

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Clean Architecture | ✅ PASS | Frontend-only; no backend layers touched. PWA feature layout respected (`features/profile`, `app/`, `components/shell`). No cross-layer import added. |
| II. Multi-Tenant Safety | ✅ PASS | `Inspector` is a **platform-scoped (no `tenant_id`) cross-tenant entity** (precedent: `Inspector`, global `ServiceRegion`, `IntegrationSetting`; CLAUDE.md §7.1). The PWA reads/writes only the authenticated inspector's own row via `/v1/inspectors/me*`, scoped by the INSP token server-side. No business query in the client. No new entity. Documented in spec Key Entities. |
| III. Test-Driven Development | ✅ PASS | Vitest + RTL unit tests written first (card, banner, heartbeat hook, settings order, version helper); E2E stays a real gate via the baseline stub. |
| IV. Contract-First APIs | ✅ PASS | Consumes existing TASK-F01-1 contracts only; **no** route schema change, so `openapi.json`/`api-types.ts` are NOT regenerated (verified by running `generate:api` and confirming no diff before PR). `/v1/inspectors/me` has no response schema — the PWA types what the use case returns (A-8). |
| V. Simplicity & Minimal Impact | ✅ PASS | Minimal wiring; no new abstractions, flags, or shims. `getIsStandalone()` is merely exported, not changed. Only files the task names are touched. |
| Workflow: Commits | ✅ PASS | Conventional Commits, English only, no Claude/AI references or co-author trailers. |

**No violations.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/041-f01-3-inspector-base-app/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (consumed fields + client storage shape)
├── quickstart.md        # Phase 1 output (dev/test/smoke)
├── contracts/
│   ├── consumed-endpoints.md   # TASK-F01-1 endpoints this PWA consumes (unchanged)
│   └── e2e-baseline.md         # BASELINE_STUBS contract addition (FR-025)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/pwa/
├── build/
│   └── app-version.ts                         # NEW buildAppVersion(pkgVersion, sha?) helper
├── vite.config.ts                             # MODIFY define __APP_VERSION__
├── vite-env.d.ts                              # MODIFY declare const __APP_VERSION__
├── src/
│   ├── app/
│   │   ├── useInstallPrompt.tsx               # MODIFY export getIsStandalone
│   │   ├── useAppStateHeartbeat.ts            # NEW throttled heartbeat hook
│   │   └── __tests__/
│   │       ├── useAppStateHeartbeat.test.tsx  # NEW
│   │       ├── useInstallPrompt.test.tsx      # MODIFY (export assertion)
│   │       └── appVersion.test.ts             # NEW
│   ├── components/shell/
│   │   ├── PwaLayout.tsx                       # MODIFY call heartbeat (INSP only)
│   │   └── __tests__/PwaLayout.test.tsx        # MODIFY (hook called once)
│   ├── components/feedback/
│   │   ├── BaseAddressBanner.tsx               # NEW (shared layer: schedule + profile mount it)
│   │   └── __tests__/BaseAddressBanner.test.tsx # NEW
│   ├── lib/auth-storage.ts                     # MODIFY clear throttle key on logout
│   └── features/
│       ├── profile/
│       │   ├── pages/ProfileAccountPage.tsx    # MODIFY add Base address card
│       │   ├── pages/ProfilePage.tsx           # MODIFY mount banner
│       │   ├── pages/ProfileSettingsPage.tsx   # MODIFY slot + footer order
│       │   ├── hooks/useInspectorMe.ts         # MODIFY type (base fields)
│       │   ├── hooks/useUpdateInspectorSelf.ts # MODIFY type + return
│       │   └── pages/__tests__/{ProfileAccountPage,ProfilePage,ProfileSettingsPage}.test.tsx # MODIFY/NEW
│       └── schedule/
│           ├── pages/SchedulePage.tsx          # MODIFY mount banner above install banners
│           └── pages/__tests__/SchedulePage.banner.test.tsx     # NEW
└── tests/e2e/support/auth.ts                   # MODIFY add app-state to BASELINE_STUBS

packages/shared/                                 # CONSUMED ONLY (inspectorBaseAddressSchema, AU_STATES) — not modified
.github/workflows/frontend-deploy.yml            # MODIFY APP_BUILD_SHA in 3 PWA build steps
```

**Structure Decision**: Mobile PWA frontend. All production changes live under `apps/pwa/`, plus one CI workflow edit for the build SHA. `packages/shared` is consumed (its `dist/` is built first) but not modified — the schema and `AU_STATES` were added by TASK-F01-1.

## Complexity Tracking

No constitution violations — section intentionally empty.
