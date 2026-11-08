# Tasks: Early Offer Access by Inspector Level (backend + shared)

**Feature**: `066-f08-2-early-offer-access` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Tests**: TDD is mandatory for this project (Constitution III) — every behaviour task is preceded by its failing test.

**Paths** are relative to the worktree root. Backend = `apps/backend`, shared = `packages/shared`.

## Phase 1: Setup

- [X] T001 Build the shared package and generate the Prisma client so backend typecheck/tests resolve `@properfy/shared` from `dist/` and Prisma types exist: `pnpm --filter @properfy/shared build && pnpm --filter backend exec prisma generate` (no file change; confirms the baseline the worktree-setup subagent already produced).

## Phase 2: Foundational (blocking prerequisites for all user stories)

**These are the shared contracts every story builds on. No story can be demonstrated until they exist.**

- [X] T002 [P] Write the pure-domain test `apps/backend/src/modules/service-group/domain/early-access.test.ts` covering `resolveEarlyAccessParams` (disabled→null; viewer qualifies→null; no snapshot→null; happy path→the 5-field params with `protectedFrom = today+2`; `enabled true`+`enabledAt null`→null + `warn marketplace.early_access_missing_enabled_at`), `isGroupInEarlyAccess` (null params / null publishedAt / `publishedAt ≤ cutoff` / `publishedAt < enabledAt` / `scheduledDate < protectedFrom` / `!hasQualifiedEligible` → false; else true), and `formatOpensAt` (`2026-11-10T11:00:00Z`→`'Tue 10 Nov'`+`'10:00 pm'`, identical under `TZ=America/Los_Angeles`). Pin `TZ` away from Sydney. (RED)
- [X] T003 Implement `apps/backend/src/modules/service-group/domain/early-access.ts` — `EarlyAccessParams`, `resolveEarlyAccessParams`, `isGroupInEarlyAccess`, `formatOpensAt` (Sydney via the shared display helpers / `Intl` pinned to `PLATFORM_TIMEZONE`; UTC text `Z`-stripped for `cutoffUtc`/`enabledAtUtc`; `protectedFrom` via `addCivilDays(civilDateInTimezone(now, PLATFORM_TIMEZONE), 2)`; the warn log takes an injected logger or returns a sentinel the policy logs — keep the module pure). Make T002 green. (GREEN)
- [X] T004 [P] Define the domain port `apps/backend/src/modules/service-group/domain/offer-early-access.policy.ts` — `interface IOfferEarlyAccessPolicy { resolve(inspectorId: string, now: Date): Promise<EarlyAccessParams | null> }` (imports `EarlyAccessParams` from `early-access.ts`).
- [X] T005 [P] Add `OfferEarlyAccessOnlyError` to `apps/backend/src/modules/service-group/domain/service-group.errors.ts` — extends `ForbiddenError`, code `OFFER_EARLY_ACCESS_ONLY`, `details: { opensAt }` (ISO UTC), message from `formatOpensAt` ("This offer opens to all inspectors on {EEE d MMM} at {h:mm a}.").
- [X] T006 Extend the repository interface `apps/backend/src/modules/service-group/domain/service-group.repository.ts` — add `earlyAccess: EarlyAccessParams | null` as the **last** param of `findPublishedForInspector`, `countPublishedForInspector`, `findPublishedOfferDetail`; add `findEarlyAccessStateForGroup(groupId: string, params: EarlyAccessParams): Promise<{ publishedAt: Date | null; scheduledDate: string; hasQualifiedEligible: boolean } | null>`.
- [X] T007 Implement the SQL in `apps/backend/src/modules/service-group/infrastructure/prisma-service-group.repository.ts` — add private `qualifiedEligibleExistsSql(params)` (the region+type+denylist EXISTS scored against `inspector_reliability_snapshots` ≥ `minScore` on `latestSnapshotDate`, ACTIVE non-deleted inspectors) and `earlyAccessExclusionSql(params | null)` (`Prisma.empty` when null, else `AND NOT ( published_at IS NOT NULL AND published_at > ${cutoffUtc}::timestamp AND published_at >= ${enabledAtUtc}::timestamp AND scheduled_date >= ${protectedFrom}::date AND <qualifiedEligibleExists> )`), interpolate `earlyAccessExclusionSql` after `inspectorEligibilitySql` in `findEligibleGroupIds` (thread `earlyAccess` from `findPublishedForInspector`), `countPublishedForInspector` and the eligible-check of `findPublishedOfferDetail`, and implement `findEarlyAccessStateForGroup` (one `$queryRaw` selecting `published_at`, `scheduled_date`, `<qualifiedEligibleExists> AS has_qualified_eligible` for `sg.id = $groupId`).
- [X] T008 [P] Add `findLatestSnapshotDate(): Promise<string | null>` to `apps/backend/src/modules/reliability/application/reliability-index.reader.ts` (thin delegate to `this.repo.findLatestSnapshotDate()`).
- [X] T009 [P] Write the policy test `apps/backend/src/modules/inspector-program/application/offer-early-access.policy.test.ts` — asserts: disabled→null (no snapshot read); viewer qualifies→null; enabled+not-qualifying→params from `resolveEarlyAccessParams` with the real `minScore`/`latestSnapshotDate`; resolution happens once. (RED)
- [X] T010 Implement `apps/backend/src/modules/inspector-program/application/offer-early-access.policy.ts` — `OfferEarlyAccessPolicy implements IOfferEarlyAccessPolicy` composing `settingsReader.get('inspectorProgram')`, `standingService.hasEarlyAccess`, `indexReader.findLatestSnapshotDate`, `minScoreForLevel` and `resolveEarlyAccessParams` (logs the warn on the missing-`enabledAt` sentinel). Make T009 green. (GREEN)
- [X] T011 Wire the policy in `apps/backend/src/main/container.ts` — build `offerEarlyAccessPolicy` from `inspectorProgramStandingService`, `platformSettingsService`, `reliabilityIndexReader`, clock; expose it on the inspector-program container section for reuse.

**Checkpoint**: domain, port, error, repository and policy exist and are unit-green; the gate can now be applied by the use cases.

## Phase 3: User Story 1 — Gate the four offer paths while in-window (Priority: P1) 🎯 MVP

**Goal**: An in-window group with a qualified-eligible inspector is hidden from list/count/detail and refused on accept for below-X inspectors; a level-≥-X inspector is unaffected; all four paths agree.
**Independent test**: the real-DB G1–G9 matrix + the accept/route tests below.

- [X] T012 [P] [US1] Extend `apps/backend/src/modules/service-group/application/use-cases/get-marketplace-offers.use-case.test.ts` — the use case receives the policy, resolves it **once**, and passes the resolved params to both `findPublishedForInspector` and `countPublishedForInspector`; with access/disabled → `null` is passed. (RED)
- [X] T013 [US1] Edit `get-marketplace-offers.use-case.ts` — inject `IOfferEarlyAccessPolicy`, `const params = await policy.resolve(inspectorId, new Date())`, pass `params` to the list and count calls. Make T012 green. (GREEN)
- [X] T014 [P] [US1] Extend `get-marketplace-offer-detail.use-case.test.ts` — the use case resolves the policy once and passes params to `findPublishedOfferDetail`; an in-window group → existing `404`. (RED)
- [X] T015 [US1] Edit `get-marketplace-offer-detail.use-case.ts` — inject the policy, resolve once, pass params to the detail read. Make T014 green. (GREEN)
- [X] T016 [P] [US1] Extend `accept-offer.use-case.test.ts` — in-window + below-X → `403 OFFER_EARLY_ACCESS_ONLY` with `details.opensAt = published_at + hours`, `acceptOptimistic` NOT called; viewer Gold → accepts; the check runs **after** `isGroupEligibleForInspector` and **before** `acceptOptimistic`; the idempotency-cache hit short-circuits before the check. (RED)
- [X] T017 [US1] Edit `accept-offer.use-case.ts` — add the policy as an **optional, last** constructor param; after `isGroupEligibleForInspector` and before `acceptOptimistic`, resolve the policy, and when non-null call `findEarlyAccessStateForGroup` + `isGroupInEarlyAccess` → throw `OfferEarlyAccessOnlyError(publishedAt + hours)` and log `info marketplace.early_access_denied`. Make T016 green. (GREEN)
- [X] T018 [US1] Wire the policy into `AcceptOfferUseCase`, `GetMarketplaceOffersUseCase` and `GetMarketplaceOfferDetailUseCase` in `apps/backend/src/main/container.ts` (pass `offerEarlyAccessPolicy`); update any backend test wiring/doubles that construct these use cases or the `IServiceGroupRepository` (4 changed signatures + new method) so the suite compiles.
- [X] T019 [US1] Write the real-DB test `apps/backend/tests/integration/db/marketplace-early-access.db.test.ts` (Testcontainers + PostGIS; today fixed `2026-11-10` Sydney; Gina Gold/R/T, Sam Silver/R/T, Gus Gold/only-S; H 12; minLevel GOLD): the G1–G8 visibility matrix, `countPublishedForInspector` matches each inspector's list ids, `findPublishedOfferDetail(G1, Sam)`→null / `(G1, Gina)`→detail, pagination (`pageSize 2`) applies the filter before LIMIT/OFFSET, and the same result under session `SET TIME ZONE 'Australia/Sydney'` and `UTC`. Implement until green (reuses Phase 2 code). (RED→GREEN)

**Checkpoint**: 03.7 proven end-to-end at the DB level for the four paths.

## Phase 4: User Story 2 — Start safe (off by default, qualified-eligible only, never today/D+1, only after activation) (Priority: P1)

**Goal**: The guardrails that make the gate safe to ship and to switch on in business hours.
**Independent test**: domain guardrail cases + the save-hook test + the real-DB DV3/L-F08-08 cases.

- [X] T020 [P] [US2] Write the save-hook test `apps/backend/src/modules/inspector-program/application/prepare-inspector-program-setting-for-save.test.ts` — false→true (client sends old `enabledAt`)→`now.toISOString()`; true→true (hours 12→24)→previous `enabledAt`; true→false→null; false→false→null; no prior record→`now.toISOString()`. (RED)
- [X] T021 [US2] Implement `apps/backend/src/modules/inspector-program/application/prepare-inspector-program-setting-for-save.ts` — pure `prepareInspectorProgramSettingForSave(previous, next, now)`. Make T020 green. (GREEN)
- [X] T022 [US2] Register the hook at the composition root in `apps/backend/src/main/container.ts` — change the `UpdatePlatformSettingUseCase` construction to pass `{ ...PLATFORM_SETTING_SAVE_HOOKS, inspectorProgram: prepareInspectorProgramSettingForSave }` (no edit to `update-platform-setting.use-case.ts`, no edit to the shared `platform-setting-save-hooks.ts` const; `platform-settings` must not import `inspector-program`).
- [X] T023 [US2] Extend the real-DB test `marketplace-early-access.db.test.ts` with the DV3/L-F08-08 cases: only-qualified-eligible (Gina INACTIVE / type no Gold serves / agency blocks all Gold → Sam sees the group at 1 h), visibility after H hours (advance clock → Sam sees G1), disabled (Sam sees G1–G7), activation with live offers (`enabledAt = now − 30 min`: G1 published before → Sam sees; G9 published after → Sam does not, Gina does), empty snapshot table → Sam sees everything. (RED→GREEN)

**Checkpoint**: DV3 + L-F08-08 proven; the feature is safe to deploy (off) and to switch on.

## Phase 5: User Story 3 — Clear "opens at" message + `enabledAt` surfaced (Priority: P2)

**Goal**: The 403 states the Sydney day+time; the setting round-trips the server-owned `enabledAt`; the contract is regenerated.
**Independent test**: the route test + the OpenAPI/api-types freshness check.

- [X] T024 [US3] Do NOT declare the 403 in the accept route's Fastify schema — no route in this codebase declares 4xx responses and it would risk the zod response serializer. The 403 flows through the shared error handler; the behaviour is proven by T026 and documented in CLAUDE.md (T027). (No route edit.)
- [X] T025 [US3] Run `pnpm generate:api` to confirm the committed `openapi.json`/`api-types.ts` are not stale (this slice changes no route/shared schema, so expect no diff); commit only if something changes. Rebuild shared (`pnpm --filter @properfy/shared build`).
- [X] T026 [US3] Prove the message + `enabledAt` flow at the code-path level rather than with a disproportionate DB-backed HTTP harness (the repo gate is already proven in the real DB, T019/T023, and the accept 403 — code/message/details/order — in the accept use-case unit test, T016): (a) the 403 message + `details.opensAt` are asserted in `early-access.test.ts` (`formatOpensAt`, `offerOpensAt`) and `accept-offer.use-case.test.ts`; (b) the server-owned `enabledAt` + the `platform_setting.updated` audit `after` (03.A5) are asserted in the co-located `update-platform-setting.use-case.test.ts` using the **real** `prepareInspectorProgramSettingForSave` hook (the exact map the container registers). The HTTP 403 envelope is the generic `DomainError`→envelope path already covered by `baseline-envelope.routes.test.ts`. Pin `TZ` away from Sydney where relevant.

**Checkpoint**: the inspector sees an unambiguous opening time; the contract is fresh; 03.A5 covered.

## Phase 6: Polish & Cross-Cutting

- [X] T027 [P] Update `apps/backend/CLAUDE.md` (marketplace / service-group section) — document the early-access window on the four offer paths, the DV3 start-safe rules, `published_at` reopening the window, "only publications after `enabledAt`", increasing H being retroactive, and the platform-settings per-key save-hook note (server-owned `enabledAt`).
- [X] T028 Run the full gates inside the worktree (via a subagent that returns a condensed summary): `pnpm --filter @properfy/shared lint typecheck test`; `pnpm --filter backend lint typecheck test`; `pnpm --filter backend test:integration:db`; confirm `openapi.json`/`api-types.ts` are committed and fresh; `git diff --stat origin/develop... | tail -1` < 150 files.

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T011)** → **US1 (T012–T019)** → **US2 (T020–T023)** → **US3 (T024–T026)** → **Polish (T027–T028)**.
- Foundational blocks everything. Within Foundational: T003 needs T002; T007 needs T006; T010 needs T004+T008+T009; T011 needs T010.
- US1 is the MVP (the gate). US2 adds the guardrails + save hook; US3 adds the message + contract.
- The real-DB test file (`marketplace-early-access.db.test.ts`) is created in T019 (US1) and extended in T023 (US2) — same file, sequential.

## Parallel opportunities

- T002, T004, T005, T008 are independent files → `[P]`.
- T009 (policy test) parallel with T004/T005/T008.
- Use-case test tasks T012, T014, T016 touch different files → `[P]` (their implementations T013/T015/T017 edit the same respective files sequentially).
- T020 (hook test) and T024 (route schema) are independent of the use-case edits.

## Independent test criteria

- **US1**: real-DB G1–G8 matrix + accept 403 + route omission prove the gate across all four paths.
- **US2**: save-hook unit test + real-DB DV3/L-F08-08 cases prove off-by-default, qualified-eligible-only, never-today/D+1, only-after-activation.
- **US3**: route test proves the Sydney message, `details.opensAt`, and the server-owned `enabledAt` round-trip + audit.

## MVP scope

Setup + Foundational + **US1** = a working early-access gate on all four paths. US2 and US3 complete the start-safe guarantees and the human-facing message required by the contract (DV3 / L-F08-08) and must ship in the same PR (1 task = 1 PR).
