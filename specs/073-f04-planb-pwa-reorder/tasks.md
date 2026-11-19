# Tasks: F04 Plan B PR-B — PWA reorder via server preview

**Feature**: `073-f04-planb-pwa-reorder` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

**Scope**: PWA only (`apps/pwa/src/features/day-plan`). No shared / backend / api-types change.
Map (`plan.geometry`) and save/reset hooks are **not** modified. TDD: write/adapt the failing
test first, then implement. All paths relative to repo root.

## Phase 1: Setup

- [ ] T001 Confirm the preview contract shape in `packages/shared` (`PreviewDayPlanOrderRequest`,
  `PreviewDayPlanOrderResponse`) and the api-types path for
  `/v1/inspector/day-plans/{date}/order/preview` are present on `develop`; no code change —
  record the exact response field names used by the mappers.

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 Add the `orderPreview(date, version, order)` query key to
  `apps/pwa/src/features/day-plan/api/day-plan-keys.ts` (stable, order-sensitive key).
- [ ] T003 [P] Add/confirm a `useDebouncedValue` helper (reuse an existing one if present, else
  add `apps/pwa/src/hooks/useDebouncedValue.ts` + test) for the 400 ms reorder debounce.

## Phase 3: User Story 1 — Reorder with server-computed times (P1)

**Goal**: finish/delta/driving/ETAs/violations for a reorder come from the preview endpoint.
**Independent test**: with the preview stubbed, move a stop → summary shows server numbers; no
read of `plan.routingInput`.

- [ ] T004 [P] [US1] Write `apps/pwa/src/features/day-plan/lib/__tests__/reorder-preview.test.ts`:
  pure mappers — `toReorderPreviewView(response)`, `computeDeltaMin(draftFinishMs, suggestedFinishMs)`,
  `toViolationMessages(plan, displayOrder, violations)`, `etaByAppointmentId(response)`, "~"
  formatting per stop timezone, delta text ("+12 min vs. suggested" / "−5 …" / "Same finish time
  as suggested").
- [ ] T005 [US1] Implement `apps/pwa/src/features/day-plan/lib/reorder-preview.ts` to pass T004;
  relocate the still-needed formatting helpers (`formatDelta`, `formatDrivingTotal`,
  `formatLocalEta`, `toViolationMessages`) **into this module** so `reorder-draft.ts` can shed the
  optimizer imports entirely (FR-002). Update importers accordingly.
- [ ] T006 [P] [US1] Write `apps/pwa/src/features/day-plan/hooks/__tests__/usePreviewDayPlanOrder.test.ts`:
  debounced (400 ms) React Query call to `POST …/order/preview`; identical orders dedupe;
  superseded order never renders; `enabled` gating (≥ 2 reorderable, online).
- [ ] T007 [US1] Implement `apps/pwa/src/features/day-plan/hooks/usePreviewDayPlanOrder.ts`
  (apiPost, keyed on `orderPreview(date, version, debouncedOrder)`, `keepPreviousData`).
- [ ] T008 [P] [US1] Write `apps/pwa/src/features/day-plan/hooks/__tests__/useReorderPreview.test.ts`:
  composes the draft preview + the suggested-order preview (cached per version) into
  `ReorderPreviewView` with `finishMs`, `deltaMin`, `driveS`, `etaByAppointmentId`, `violations`,
  `status`; delta 0 and no extra call when draft === aligned suggested order.
- [ ] T009 [US1] Implement `apps/pwa/src/features/day-plan/hooks/useReorderPreview.ts` to pass T008.
- [ ] T010 [US1] Adapt `apps/pwa/src/features/day-plan/hooks/useReorderDraft.ts`: remove the
  synchronous `evaluateDraft` evaluation and the `DraftEvaluation` field; expose `order`,
  `displayOrder`, `baseVersion`, `reorderableIds`, `lockedIds`, dirty/frozen/stale/notice, and the
  move/reset/clear API unchanged. Update `hooks/__tests__/useReorderDraft.test.ts` to drop the
  local-evaluation expectations (set/drift logic stays).
- [ ] T011 [US1] Remove `evaluateDraft` and the `routingInput`-based optimizer imports
  (`evaluateSequence`, `toOptimizerInput`, `buildLegOverrides`) from
  `apps/pwa/src/features/day-plan/lib/reorder-draft.ts`; update
  `lib/__tests__/reorder-draft.test.ts` to keep only set/move/align/format coverage. `canReorder`
  derives from the live reorderable set (≥ 2), not `routingInput` (FR-012).
- [ ] T012 [US1] Wire `RouteSummary.tsx` + its test to consume the `ReorderPreviewView` (finish
  "~", delta, driving, violation alert) instead of `draft.evaluation`; `RoutePage.tsx` passes the
  preview view down.
- [ ] T013 [US1] Wire `ReorderableStopList.tsx` + its test to read per-stop ETAs from the preview
  view and implement the two-step a11y announcement (position immediately, finish/delta on resolve,
  FR-011).

## Phase 4: User Story 2 — Save unchanged (P1)

**Goal**: saving stays byte-for-byte behaviourally identical.
**Independent test**: existing `ReorderSaveBar.test.tsx` save/conflict/stale/mismatch/past/
already-started/429/network cases pass with the delta now sourced from the preview view.

- [ ] T014 [US2] Update `ReorderSaveBar.tsx` so the delta text reads from the `ReorderPreviewView`
  (not `draft.evaluation`); keep all save branches, offline/frozen/stale disabling and the
  unsaved-changes prompt unchanged. Adapt `components/__tests__/ReorderSaveBar.test.tsx` only where
  the delta source changed.

## Phase 5: User Story 3 — Degrade gracefully (P2)

**Goal**: offline / 429 / provider-error / started-day never fabricate numbers or break controls.
**Independent test**: stub preview with offline / 429 / 422 ALREADY_STARTED → controls usable,
neutral "updating/unavailable" state, Save rules unchanged.

- [ ] T015 [P] [US3] Add degraded-path tests to `useReorderPreview.test.ts` /
  `RouteSummary.test.tsx` / `ReorderableStopList.test.tsx`: offline → "unavailable offline", 429 →
  keep last good / "updating… try again", 422 `DAY_PLAN_ALREADY_STARTED` → "unavailable for a
  started day", no delta; controls stay enabled; Save follows existing rules.
- [ ] T016 [US3] Implement the `status: 'UNAVAILABLE'` + `reason` handling in `useReorderPreview.ts`
  and the neutral UI states in `RouteSummary.tsx` / `ReorderableStopList.tsx`.

## Phase 6: Polish & Cross-Cutting

- [ ] T017 [P] If any PWA E2E spec navigates the reorder screen, add
  `POST /v1/inspector/day-plans/:date/order/preview` to the E2E `BASELINE_STUBS`
  (`apps/pwa/tests/e2e/support/`); keep the hermetic suite green (Chromium + WebKit).
- [ ] T018 Grep gates: no `routingInput` / `evaluateSequence` / `toOptimizerInput` /
  `buildLegOverrides` remain in the reorder path (`apps/pwa/src/features/day-plan`, outside the map
  and comments). Remove the now-dead PWA `@properfy/shared/route-planning` import if unused.
- [ ] T019 Bundle check: `pnpm --filter pwa build` before/after; record entry vs lazy chunk gzip in
  the PR; confirm the optimizer no longer ships to the client and the entry chunk did not grow.
- [ ] T020 Update `apps/pwa/CLAUDE.md` (reorder now uses the server preview, not local recompute;
  Plan B PR-B) and the root `CLAUDE.md` one-line F04 entry (§13.11). No other CLAUDE.md affected.
- [ ] T021 Full gate inside the worktree: `pnpm --filter @properfy/shared build && pnpm --filter pwa
  lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm
  --filter pwa check:ds`; ≤ 150 files.

## Dependencies & order

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6.
- US2 and US3 build on US1's preview view model; US1 is the MVP.
- `[P]` tasks touch distinct files and may run together within their phase.

## MVP

User Story 1 (T004–T013): reorder shows server-computed times and no longer reads the raw matrix.
US2 guarantees no save regression; US3 hardens the new network dependency.
