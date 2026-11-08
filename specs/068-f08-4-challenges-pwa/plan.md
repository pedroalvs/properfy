# Implementation Plan: Challenges in the inspector app + performance messages

**Branch**: `068-f08-4-challenges-pwa` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/068-f08-4-challenges-pwa/spec.md`

## Summary

Add the inspector (PWA) surface of feature F08: one INSP-only read endpoint `GET /v1/inspector/program` (active goals with progress, standing = index/level/streak, reward history, **anonymous ranking** 03.A3), the three `PERFORMANCE_MESSAGE` steps on the **existing** `inspector-program.daily` 08:00 "MESSAGES" run (goal-reached aggregated by `(inspector, periodEnd)`, level-change with a 7-day guard + weights-version rule, streak-at-risk), the PWA "Challenges" screen (`/profile/challenges`, Active / My results / Ranking tabs + a More-hub tile), the `/profile/challenges` notice-target allowlist entry (same PR as the route), and tour step 8. No database table, column or migration; the only new contract surface is the one read route (`api-types` regenerated).

Technical approach: the endpoint is a thin `GetInspectorProgramUseCase` composing the **already-merged** `InspectorProgramStandingService` (standing + `getActiveGoalProgress`), a new recent-awards reader, and a new pure ranking-anonymiser over `ReliabilityIndexReader.getCurrentIndexes()`. The message steps implement the F08-1 `InspectorProgramDailyStep` interface (`phase: 'MESSAGES'`), publish through F02's `PublishSystemInspectorNoticeUseCase`, and gate level messages through a new `IRecentProgramNoticeReader` port backed by F02's `HasRecentSystemInspectorNoticeUseCase`. The PWA feature mirrors the `earnings` feature structure.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; pnpm 9 + Turborepo
**Primary Dependencies**: Backend — Fastify 4, `fastify-type-provider-zod`, Prisma 6 (read-only here), Zod 3, pg-boss 9 (existing queue only). Shared — Zod 3. PWA — React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3, lucide-react, vite-plugin-pwa.
**Storage**: PostgreSQL via existing repositories; **read-only** for this feature (`inspector_goals`, `reward_awards`, `goal_period_closures`, `inspector_reliability_snapshots`); the only write is a system notice via F02 (audited). No new table/column/migration.
**Testing**: Vitest (backend use case + message steps + shared), Supertest (route contract incl. 03.A3), Vitest + RTL + MSW (PWA components), Playwright (PWA E2E `test-pwa-e2e`, Chromium + WebKit — CI fallback authorised if the local runner is unavailable).
**Target Platform**: Fastify API (Fly.io); PWA (Vercel, iOS/Android browsers + installed PWA).
**Project Type**: Monorepo — backend module extension + shared contract + PWA feature.
**Performance Goals**: `GET /v1/inspector/program` p95 < 800 ms in staging; client `staleTime 60_000`.
**Constraints**: No new DB object; no new pg-boss queue/schedule/worker/subscriber; 03.A3 anonymity (no other inspector's identity anywhere); DR5 timezones (civil dates from backend in `PLATFORM_TIMEZONE`, no device tz); D12 platform-scoped (no `tenant_id`); PR ≤ 150 changed files.
**Scale/Scope**: ~38 files. Ranking cohort = whole platform's `ACTIVE` + `SCORED` inspectors (one `getCurrentIndexes()` call). One endpoint, three message steps, one PWA screen with three tabs + one tile + one tour-step edit + one allowlist entry.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Clean Architecture (PASS)**. Backend additions respect inward-only dependencies: `GetInspectorProgramUseCase`, the three `*MessagesStep` classes and `program-messages.ts` live in `application/`; the ranking-anonymiser and copy builders are pure `domain/`-free functions; the `IRecentProgramNoticeReader` and recent-awards reader are **ports** (interfaces) in `domain/`, implemented at the composition root (`container.ts`) over F02's use case / a Prisma repository. The route is `interfaces/`. No layer reaches outward.
- **II. Multi-Tenant Safety — documented exception (PASS)**. The entities read are **platform-scoped (no `tenant_id`)** per root `CLAUDE.md` §7.1 (D12) because an inspector is cross-tenant (precedents: `Inspector`, global `ServiceRegion`, `PlatformSetting`, `InspectorReliabilitySnapshot`; the constitution itself treats `Inspector` as global). Isolation is by **subject scope**, not a tenant predicate: the endpoint is INSP-only, always filtered to the caller's own `inspectorId`; `AM`/`OP`/`CL_*`/`TNT` → 403 (Q18); the ranking is anonymised server-side so no row about another inspector or agency leaves the backend (03.A3). This feature adds **no** write path except the F02 notice use case (which audits, actorType `SYSTEM`), and **no** new entity, so it cannot widen isolation. A Supertest contract test proves a caller receives none of the other inspectors' identifiers. Recorded in Complexity Tracking as the approved §7.1 exception (not a violation).
- **III. TDD (PASS)**. Red→green per unit: shared enum/schema/allowlist tests, the ranking-anonymiser + copy-builder pure tests, the use-case test, the Supertest 03.A3 contract test, each message-step test, and the PWA RTL/MSW tests are written before the implementation. TZ-dependent tests pin `TZ` away from Sydney.
- **IV. Contract-First (PASS)**. The one new route is Zod-schema'd in `packages/shared/src/schemas/inspector-program.ts` (`inspectorProgramResponseSchema`), registered on the Fastify route via `fastify-type-provider-zod`, and `api-types.ts` is regenerated with `pnpm generate:api` and committed (CI contract-freshness gate). Error envelope `{ error: { code, message, details? } }`; `request_id` propagated.
- **V. Simplicity (PASS)**. Reuses the merged standing service, F02 publish/has-recent use cases, the F02 allowlist matcher and the F08-1 daily-step interface instead of re-implementing them; no new queue/flag/abstraction; the PWA feature follows the existing `earnings` layout. No speculative code.

**Result: PASS, no unjustified violations.** The only noted deviation is the pre-approved platform-scoped (no-`tenant_id`) model, tracked below.

## Project Structure

### Documentation (this feature)

```text
specs/068-f08-4-challenges-pwa/
├── plan.md              # This file
├── spec.md              # Feature spec
├── research.md          # Phase 0 (this run)
├── data-model.md        # Phase 1 (this run)
├── quickstart.md        # Phase 1 (this run)
├── contracts/
│   └── get-inspector-program.md   # Phase 1 (this run)
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/inspector-program.ts        # + inspectorProgramResponseSchema (+ sub-schemas, ranking entry .strict())
├── schemas/inspector-program.test.ts   # + response/ranking-entry strictness cases
├── constants/inspector-notices.ts      # + '/profile/challenges' in INSPECTOR_NOTICE_TARGET_PATTERNS, + INSPECTOR_CHALLENGES_PATH
└── constants/inspector-notices.test.ts # + static-exact allowlist cases

apps/backend/src/modules/inspector-program/
├── domain/
│   ├── recent-program-notice.reader.ts      # IRecentProgramNoticeReader port (hasRecentNotice(prefix, since))
│   ├── recent-awards.reader.ts              # IRecentRewardAwardReader port (recent by created_at / by inspector)
│   ├── ranking-anonymiser.ts                # pure: CurrentIndex[] + selfId + thresholds + snapshotDate → ranking
│   ├── ranking-anonymiser.test.ts
│   ├── program-message-copy.ts             # pure: titles/bodies/dedupe + "Mon 2 Nov" period text + truncation
│   └── program-message-copy.test.ts
├── application/
│   ├── use-cases/get-inspector-program.use-case.ts
│   ├── use-cases/get-inspector-program.use-case.test.ts
│   ├── program-messages.ts                  # aggregation + level/streak selection helpers (Prisma-free)
│   ├── program-messages.test.ts
│   ├── steps/send-goal-reached-messages.step.ts
│   ├── steps/send-level-change-messages.step.ts
│   ├── steps/send-streak-risk-messages.step.ts
│   └── steps/program-message-steps.test.ts
├── infrastructure/
│   ├── prisma-recent-reward-award.reader.ts
│   └── f02-recent-program-notice.reader.ts  # adapts HasRecentSystemInspectorNoticeUseCase
└── interfaces/
    ├── inspector-program-inspector.routes.ts      # GET /v1/inspector/program (requireLinkedInspector local)
    └── inspector-program-inspector.routes.test.ts # Supertest incl. 03.A3 anonymity + RBAC

apps/backend/src/main/
├── container.ts   # wire the use case, readers, and append the 3 MESSAGES steps to the daily-step array
└── (routes registration file)   # register the new INSP route

apps/pwa/src/
├── app/router.tsx                         # + { path: 'challenges', element: lazyElement(ChallengesPage) } under profile
├── features/profile/pages/ProfilePage.tsx # + "Challenges" ProfileTile after Earnings
├── features/tour/lib/tour-steps.ts        # step 8 copy
└── features/challenges/
    ├── pages/ChallengesPage.tsx
    ├── components/{ActiveGoalsTab,MyResultsTab,RankingTab,GoalProgressCard,UpcomingGoalCard,RewardStatusChip,StandingCards}.tsx
    ├── hooks/useInspectorProgram.ts        # React Query, staleTime 60_000
    ├── lib/challenge-copy.ts               # footer/ranking copy + AUD/period formatting
    └── pages/__tests__/ChallengesPage.test.tsx (+ component tests)

apps/backend/CLAUDE.md · apps/pwa/CLAUDE.md · packages/shared/CLAUDE.md   # doc updates (X00 rule)
packages/shared/src/api-types.ts · packages/shared/openapi.json          # regenerated (pnpm generate:api)
```

**Structure Decision**: Monorepo three-surface change. The backend work is an **extension of the existing `inspector-program` module** (new use case + ports + adapters + 3 daily steps + 1 route), not a new module — it shares the F08-1 domain and the daily-job orchestrator. The PWA adds a self-contained `challenges` feature mirroring `earnings`. The shared package gains one response schema and one allowlist entry. The PWA router/ProfilePage/tour touch-points are the only edits to files the "C · PWA" lane owns exclusively (router, ProfilePage, tour), avoiding cross-lane conflict.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| Platform-scoped entities (no `tenant_id`) read without a tenant predicate | The subject is an inspector, who is cross-tenant (root `CLAUDE.md` §7.1 / D12; the constitution treats `Inspector` as global). The whole surface is the inspector's own data + an anonymised platform ranking. | A `tenant_id` predicate is impossible for a cross-tenant subject and would fracture the ranking. Isolation is instead enforced by INSP-only RBAC + own-`inspectorId` scope + server-side anonymisation (03.A3), proven by a contract test. This is the pre-approved §7.1 exception, not new complexity. |
