# Tasks: Default Map Period Window + per-agency mapWindowDays (F00)

**Input**: Design documents from `/specs/037-f00-map-period-window/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: INCLUDED — TDD mandatory (constitution §III). Each implementation task is preceded by its red test.

**Organization**: by user story. US1 (map window) and US2 (editing + RBAC) are both P1; US3 (CL fixed
window + out-of-panel indicator) is P2. Paths relative to repo root. `[P]` = different files, no dep on an
incomplete task.

## Phase 1: Setup

- [X] T001 Worktree off `origin/develop` (has X00); `pnpm install`, prisma generate, shared + frontend-standards
  builds, shared/web/backend typecheck, web lint — baseline all PASS (delegated).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the `mapWindowDays` schema + regenerated api-types; backend and web both consume it.

- [ ] T002 In `packages/shared/src/schemas/tenant.test.ts` write S1–S5 red: parse accepts 1/14/90; rejects
  0/91/7.5/`"14"`/null; settings without the key parses with `mapWindowDays` absent (no injected default);
  `updateTenantSchema.parse({ settings: { mapWindowDays: 30 } })` ok; `MAP_WINDOW_DAYS_DEFAULT === 14`.
- [ ] T003 In `packages/shared/src/schemas/tenant.ts` add `mapWindowDays: z.number().int().min(1).max(90).optional()`
  to `tenantSettingsSchema` (no `.default()`) and export `MAP_WINDOW_DAYS_DEFAULT = 14`. S1–S5 green.
- [ ] T004 Regenerate the contract: `pnpm generate:api` (→ `generate:openapi` then `generate:types`), then
  `pnpm --filter @properfy/shared build`. Commit `packages/shared/openapi.json` and `src/api-types.ts`
  (CI `contract-freshness` gate). Confirm `openapi.json` now contains `mapWindowDays`.

---

## Phase 3: User Story 2 — Editing mapWindowDays with scoped RBAC + audit (Priority: P1)

**Goal**: AM edits any agency; OP edits only `mapWindowDays` on any agency; CL_ADMIN cannot; empty-PATCH
writes/audits nothing. Drawer surfaces the field per role with Save-disabled-when-clean.

**Independent test**: use-case units (B1–B16, N1–N8) assert update/audit/event calls and before/after.

### Backend (P2 / P2a)

- [ ] T005 [US2] In `apps/backend/tests/unit/tenant/update-tenant.use-case.test.ts` write B1–B16 red and
  **remove** the dead "should allow OP to update own tenant" test (B11): OP `tenantId:null` writing
  `{settings:{mapWindowDays:30}}` on `tenant-1` and on `tenant-other` → 200 + `deepMerge` + audit before
  undefined/after 30 (B1/B2); OP with any top-level field, mixed payload, extra settings key, `logoUrl`,
  `{}`/`{settings:{}}`, each top-level field → `ForbiddenError`, nothing written (B3–B8); OP out-of-range
  via use case → `ValidationError field 'settings.mapWindowDays'` (B9); OP missing target →
  `TenantNotFoundError` (B10); AM writes + audit (B12); CL_ADMIN own `mapWindowDays` → 200, no update/log
  (B13, via guard); CL_ADMIN `mapWindowDays`+allowed key → update without `mapWindowDays`, audit without it
  (B14); CL_ADMIN other / CL_USER → 403 (B15); keep the filter/merge regressions (B16).
- [ ] T006 [US2] In `update-tenant.use-case.ts` add `OP_EXTRA_SETTINGS_KEYS = ['mapWindowDays']`, remove
  `OP` from the `(CL_ADMIN || OP) && actor.tenantId === tenantId` condition (→ `CL_ADMIN` only), add the OP
  cross-tenant path (top-level field or absent/`{}` settings or any key ∉ allow-list → `ForbiddenError`;
  else normal flow with value revalidation). B1–B16 green.
- [ ] T007 [US2] In the same test file write N1–N8 red (empty-PATCH guard; spy `eventBus.emit`): discarded-only
  / out-of-allow-list CL payloads → no update/log/event, return current (N1/N2); AM `{}` and `{settings:{}}`
  → nothing (N3/N4); real change still audits (N5/N6); CL_ADMIN `name`+`mapWindowDays` → update `name` only,
  audit without `mapWindowDays` (N7); AM `{}` on a missing target → `TenantNotFoundError` (N8, guard after findById).
- [ ] T008 [US2] In `update-tenant.use-case.ts` add the empty-PATCH guard after `findById`: collapse `settings`
  reduced to `{}` into `undefined`; if `updateData` empty → return current tenant without update/audit/event.
  N1–N8 green.
- [ ] T009 [US2] In `apps/backend/tests/integration/tenant/tenant.routes.test.ts` (PATCH block) write R1–R4:
  `mapWindowDays` 0/91/`"14"` → 400 `VALIDATION_ERROR`; 30 (use case mocked) → 200 with
  `res.body.data.settingsJson.mapWindowDays === 30`. Run the RBAC checklist grep to ensure no route test with
  a mocked use case asserts OP-403 on PATCH.

### Docs (P2b)

- [ ] T010 [P] [US2] Update `specs/002-tenants-branches/contracts/tenant-endpoints.md` (PATCH: OP writes only
  `mapWindowDays` on any agency; drop "OP (own tenant…)"; fix the OP lines in list/GET/deactivate to
  "OP (any tenant)"; document the empty-PATCH guard + rollback note), `specs/015-permissions-rbac-matrix/spec.md:98`,
  and `specs/backend/tenant.spec.md`. In `packages/shared/src/permissions/role-matrix.ts` keep
  `'tenant.update': { roles: ['AM','OP'] }` and add the scope comment (no new `canPerform`).

### Drawer (P3)

- [ ] T011 [US2] In `TenantFormDrawer.test.tsx` / `useTenantAdminSave.test.ts` write W1–W12 red: field shows
  for AM (edit) prefilled 30/14 (W1/W2), OP sees only "Map" (W3), absent for CL_ADMIN (W4) and in create (W5);
  keep the non-AM notifications regression (W6); AM save sends `settings.mapWindowDays` as number with the
  rest (W7); OP save body is exactly `{settings:{mapWindowDays:30}}` (W8); validation `''`/`0`/`91`/`7.5`
  → inline error, no save (W9); backend `VALIDATION_ERROR` maps inline (W10); Save disabled while not dirty,
  toggling with the value (W11); help-text wired by `aria-describedby` (W12).
- [ ] T012 [US2] Implement in `TenantFormDrawer.tsx` (+ `types/index.ts`, `useTenantAdminSave.ts`): a "Map"
  `FormSection` (edit mode only) with the number field + help text, role-gated visibility (AM all / OP only
  "Map" / CL_ADMIN none), OP payload exactly `{settings:{mapWindowDays}}`, and `disabled={!isDirty||isSaving}`
  on Save in edit mode. Rewrite the stale "OP cannot PATCH tenants" comment. W1–W12 green.

---

## Phase 4: User Story 1 — Map opens on a bounded period (Priority: P1)

**Goal**: `/map` opens today..today+N for every role; the first request carries the window; AM/OP can remove it.

### Pure lib (P4)

- [ ] T013 [P] [US1] Create `apps/web/src/features/appointments/lib/map-period-window.test.ts` with L1–L12
  (computeWindowRange incl. year/leap/90 bounds; clampRangeToWindow incl. empty/over/under/inverted; resolve
  helpers; formatWindowLabel singular/plural). Red.
- [ ] T014 [P] [US1] Implement `map-period-window.ts` (`resolveMapWindowDays`, `resolveWindowTimezone`,
  `computeWindowRange`, `clampRangeToWindow`, `formatWindowLabel`, `buildDefaultAppointmentFilters`,
  `buildDefaultGroupFilters`). L1–L12 green.
- [ ] T015 [US1] In `AppointmentMapFilterPanel.tsx`/`.test.tsx` replace the `DEFAULT_*` constants with the
  builders (F1–F3): default statuses preserved, dates = window. Keep the dead `DEFAULT_MAP_FILTERS` untouched.

### Hook + wiring (P5 / P6)

- [ ] T016 [US1] Create `useMapPeriodWindow.test.tsx` (H1–H18, `vi.setSystemTime` at a UTC/Sydney-divergent
  instant): N/timezone/today per role×mode; `windowReady` gating; agency GET `retry: false` called once on 500
  (H5b); agency switch reapply (H8/H16); chip removal (H9/H17); manual edit AM/OP vs CL clamp (H10/H13/H14);
  `resetDates` (H11); N-change-in-cache reapply (H12); other-field pass-through (H15); same-date no-op (H18). Red.
- [ ] T017 [US1] Implement `useMapPeriodWindow.ts` (+ `hooks/index.ts`) and add the optional `options?: { retry?: false }`
  param to `useTenantAdminDetail.ts` (spread into `useDetailQuery`; drawer unchanged). H1–H18 green.
- [ ] T018 [US1] In `AppointmentMapPage.test.tsx` write M1–M3/M3b/M5 red (first `/v1/appointments` carries
  `fromDate/toDate`; CL waits for the agency GET; groups `scheduledDateFrom/To`; `?mode=groups`→Appointments
  carries dates; status change keeps dates). Then wire `AppointmentMapPage.tsx` (≤~20 lines): initial builders,
  `enabled: windowReady`, `onFiltersChange` entry, agency-switch/`resetDates`, `?mode=groups` opening. M-tests green.

### Chip (P7, AM/OP part)

- [ ] T019 [US1] In `AppointmentMapFilterPanel.test.tsx` write C1–C8 red (chip name/text, singular, ✕ clears
  dates in each mode, keyboard + focus-to-From, hidden for CL and when `!windowActive`). Implement the chip in
  `AppointmentMapFilterPanel.tsx` above the Date Range. C1–C8 green.

---

## Phase 5: User Story 3 — CL fixed window + out-of-panel indicator (Priority: P2)

**Goal**: CL gets a clamped, labelled window; the window state shows even with the panel closed.

- [ ] T020 [US3] In `FilterDateRange.test.tsx`/`AppointmentMapFilterPanel.test.tsx` write C9–C11 red (min/max
  attrs on both inputs; CL gets `min=today`/`max=today+N`; CL help text `Dates are limited to today + {N} days (…)`
  wired by `aria-describedby`, absent for AM/OP). Implement `FilterDateRange` `min`/`max`/`helperText` and the
  CL clamp-on-`onChange` path in the hook (M2b `Loading…` header too). C9–C11 + M2b green.
- [ ] T021 [US3] Create `MapWindowChip.tsx` + `.test.tsx` (C12/C13: `static` `<span>` with aria-label, no button;
  `removable` fires `onRemove` and returns focus via `returnFocusRef`). Render it beside `MapFilterToggleButton`
  in `AppointmentMapPage.tsx` and reuse it in the panel; add M4 to `AppointmentMapPage.test.tsx` (panel closed:
  AM removable visible → click clears dates and hides it; CL static label, no remove button). All green.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T022 [P] Update workspace docs (§13.11): `packages/shared/CLAUDE.md` (`mapWindowDays` + `MAP_WINDOW_DAYS_DEFAULT`),
  `apps/backend/CLAUDE.md` (OP `mapWindowDays` cross-tenant path + empty-PATCH guard), `apps/web/CLAUDE.md`
  (map window / chip / out-of-panel indicator / agency-timezone source).
- [ ] T023 Run the full gate inside the worktree (shared build+test; backend typecheck+lint+test incl. integration;
  web typecheck+lint+test) and `git diff --stat origin/develop... | tail -1` (<150). Via a subagent returning a
  condensed pass/fail summary.
- [ ] T024 Browser smoke per quickstart.md (P8), 4 profiles; PR description carries E.A1-1..7 / E.A2-1..6 evidence,
  the approved E.A1 interpretation, the narrow audit guard (L-F00-06) and the rollback note (L-F00-10).

---

## Dependencies

- T002→T003→T004 (Foundational) block all backend (T005–T009) and web (T013–T021) work.
- US2 backend: T005→T006, T007→T008, then T009; T010 (docs) parallel; drawer T011→T012 after T004.
- US1: T013→T014→T015; T016→T017; T018 after T017; T019 after T015+T017.
- US3: T020 after T017; T021 after T018+T019.
- Polish T022–T024 last.

## Parallel opportunities

T010 (docs) runs alongside the backend code. T013/T014 (lib) are independent of the backend. T022 doc edits
are parallel. Everything else is sequential within its slice (shared→backend→web build order).

## MVP

US2 backend + US1 web window are both P1 and ship together in one PR; US3 (P2) completes the UX. One PR total.
