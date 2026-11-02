# Tasks: Service Type Duration + Route Weights (web)

**Feature**: `056-f04-5-service-type-duration-weights` | **Branch**: same
**Input**: plan.md, spec.md, research.md, data-model.md, contracts/consumed-contracts.md, quickstart.md
**TDD**: mandatory (red-green-refactor) per project constitution.

## Phase 1: Setup

- [ ] T001 Confirm the fresh worktree is built: `pnpm install`, `pnpm --filter backend exec prisma generate`, `pnpm --filter @properfy/shared build`, `pnpm --filter @properfy/frontend-standards build` (already done by setup subagent — verify green).

## Phase 2: Foundational (shared contract change — blocks everything)

**Blocking: the shared schema flip + api-types regen must land before web/backend typecheck can see the required field.**

- [ ] T002 [US1] Update `packages/shared/src/schemas/service-type.test.ts` (RED): `createServiceTypeSchema` without `defaultDurationMinutes` → invalid; `5` and `480` valid; `4`, `481`, `45.5`, `'45'`, `null` invalid; `updateServiceTypeSchema.defaultDurationMinutes` optional with the same bounds.
- [ ] T003 [US1] Remove `.default(SERVICE_TYPE_DURATION_DEFAULT_MINUTES)` from `createServiceTypeSchema.defaultDurationMinutes` in `packages/shared/src/schemas/service-type.ts` (GREEN); keep the `updateServiceTypeSchema` optional and the `SERVICE_TYPE_DURATION_DEFAULT_MINUTES` constant. Run `pnpm --filter @properfy/shared test`.
- [ ] T004 [US1] `pnpm --filter @properfy/shared build` then `pnpm generate:api`; commit the regenerated `packages/shared/openapi.json` and `packages/shared/src/api-types.ts` (never hand-edit).

## Phase 3: User Story 1 — Estimated duration mandatory (Priority: P1)

**Goal**: The API requires `defaultDurationMinutes` on create; the web drawer collects and validates it.

**Independent test**: create a type without duration → 400 on API, field error in the drawer; `60` → created; edit loads + updates the stored value.

### Backend (contract enforcement)

- [ ] T005 [US1] Update backend integration test `apps/backend/tests/integration/service-type/service-type.routes.test.ts` (RED): `POST /v1/service-types` as AM without `defaultDurationMinutes` → `400 VALIDATION_ERROR`, `details[0].path = ['defaultDurationMinutes']`; with `60` → `201`; `PATCH` without the field → `200`, duration unchanged.
- [ ] T006 [US1] Grep every backend caller that creates a type **via the route** (`grep -rn "post('/v1/service-types'" apps/backend/tests` plus seed/scripts) and add `defaultDurationMinutes` to each request body; leave direct-DB inserts untouched (DB `DEFAULT 45`). Fix `CreateServiceTypeInput` consumers so backend `typecheck` passes (field now required, no rule change).
- [ ] T007 [US1] Run `pnpm --filter backend typecheck && pnpm --filter backend lint` — GREEN.

### Web (drawer + save)

- [ ] T008 [P] [US1] Add `defaultDurationMinutes` to the web `ServiceType` (`number`) and `ServiceTypeFormData` (`string`) interfaces and `EMPTY_SERVICE_TYPE_FORM` (`''`) in `apps/web/src/features/service-types/types/index.ts`.
- [ ] T009 [US1] Update `apps/web/src/features/service-types/hooks/useServiceTypeSave.test.ts` (RED): payload includes `defaultDurationMinutes` (number) on create and update; `validate` covers empty / non-integer / out-of-range messages.
- [ ] T010 [US1] Implement duration validation + number conversion in `apps/web/src/features/service-types/hooks/useServiceTypeSave.ts`: empty → "Enter the duration in minutes"; non-integer → "Enter whole minutes"; out of 5–480 → "Enter a duration between 5 and 480 minutes"; send `defaultDurationMinutes: Number(...)` on POST and PATCH.
- [ ] T011 [US1] Update `apps/web/src/features/service-types/components/ServiceTypeFormDrawer.test.tsx` (RED): required field after Flow Type; the three validation messages; `60` → POST with `defaultDurationMinutes: 60`; edit loads `45`, change to `50` → dirty, PATCH with `50`; help text linked by `aria-describedby`; server `details` on the field → field error.
- [ ] T011a [US1] Add an optional `aria-describedby` passthrough prop to `apps/web/src/components/forms/NumberInput.tsx` (additive; existing callers unaffected). Update `NumberInput.test.tsx` to assert it is applied.
- [ ] T012 [US1] Add the required `FormField label="Estimated duration (min)"` (shared `NumberInput`) immediately after "Flow Type" in `apps/web/src/features/service-types/components/ServiceTypeFormDrawer.tsx`; wire the edit-load of the stored value and the `aria-describedby` help text (help `<p>` with an id). Run the two web tests — GREEN.

## Phase 4: User Story 2 — Route planning weights + preview (Priority: P2)

**Goal**: AM/OP edit the three `routeWeights` and preview their effect on a real inspector/day before saving.

**Independent test**: section shows 1/1/1 "Default"; set Waiting=0; pick inspector + date; Preview shows two columns, right flagged on order change; Save; reload shows 0.

### Weights section

- [ ] T013 [US2] Create `apps/web/src/features/platform-settings/components/RouteWeightsSettingsSection.test.tsx` (RED): loads `routeWeights` → three fields 1/1/1 + "Default"; `-1`/`10.5`/`0.15` → "Enter a number from 0 to 10 with at most one decimal place"; `0/0/0` → "At least one weight must be greater than 0" (group); save → `PUT /v1/platform-settings/routeWeights` with `{ value: {travel,windowWait,baseProximity} }` + snackbar "Route weights saved. They apply to the next route calculation."; "Discard changes" restores.
- [ ] T014 [US2] Implement `RouteWeightsSettingsSection.tsx` using `usePlatformSetting('routeWeights')`, modeled on `FieldEventsSettingsSection` (fieldset/legend "Route weights", three numeric 0–10 step-0.1 fields with the task-doc help texts + intro paragraph, Save/Discard, "Last changed by", "Default" badge, focus first server-rejected field) — GREEN.

### Inspector search + preview hook

- [ ] T015 [P] [US2] Create `apps/web/src/features/platform-settings/hooks/useInspectorSearch.ts` (debounced 300 ms server search `GET /v1/inspectors?status=ACTIVE&search={text}&pageSize=20`), mirroring `useAgencySearch`; returns `{ id, name }[]`, total, isSearching, setSearch, reset.
- [ ] T016 [P] [US2] Create `apps/web/src/features/platform-settings/components/InspectorSelect.tsx` (searchable WAI-ARIA combobox over `useInspectorSearch`), mirroring `AgencySelect`; "No inspectors found" on empty; never `pageSize=100`.
- [ ] T017 [US2] Create `apps/web/src/features/platform-settings/hooks/useRouteWeightsPreview.ts` (`useMutation` on `POST /v1/day-plans/preview`), returning `{ current, proposed }`, surfacing `429` and `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE`.

### Preview component

- [ ] T018 [US2] Create `apps/web/src/features/platform-settings/components/RouteWeightsPreview.test.tsx` (RED) covering: Preview disabled with no inspector; default date = tomorrow (effective tz); click → `POST /v1/day-plans/preview` with the **form** weights; two columns "Saved weights"/"Weights in this form" listing "1. INS-0042 · Surry Hills · 09:00–11:00 · ETA 09:05" + totals "Drive 1 h 10 min · Waiting 15 min · Finish ~13:40"; order diff → right column "Order changes with these weights"; `approximate` → "Approximate (straight-line estimate)"; `lateS>0` → "Late by 25 min"; no stops → "This inspector has no inspections on this day."; `429` → "Too many previews. Try again in a minute."; other error → `ErrorState` "Retry"; fixed note; search "jan" → debounced `GET …search=jan&pageSize=20`, empty → "No inspectors found"; `DateInput` min=today max=today+14 (effective tz); `422` → "Pick a day between today and 14 days ahead" on the date field.
- [ ] T019 [US2] Implement `RouteWeightsPreview.tsx`: `InspectorSelect` + `DateInput` (min today / max today+14 via `useEffectiveTimezone`+`todayInTzDateString`+`addCivilDays`, default tomorrow) + "Preview" button; `useRouteWeightsPreview`; two-column `<ol>` render with the duration/ETA formatters; loading skeleton / empty / error states; order-change flag; `aria` (fieldset/legend, result `<ol>`, focus to result heading after preview); the fixed note — GREEN.

### Page wiring

- [ ] T020 [US2] Update `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.test.tsx` (RED): the page renders "Field events" then "Route planning".
- [ ] T021 [US2] Render `<RouteWeightsSettingsSection>` (with `<RouteWeightsPreview>` inside or beneath it) after `<FieldEventsSettingsSection>` in `PlatformSettingsPage.tsx`, lifting its dirty state into the page's back-guard — GREEN.

## Phase 5: E2E + Polish

- [ ] T022 [P] [US1] Add `apps/web/tests/e2e/service-type-duration.spec.ts` (API stubbed): AM creates a type with 60 min and edits it to 50.
- [ ] T023 [P] [US2] Add `apps/web/tests/e2e/route-weights.spec.ts` (API stubbed): AM changes "Waiting for windows" to 0, previews (order changes), saves, reloads, sees 0.
- [ ] T024 Update CLAUDE.md files that this PR changes (root §13.11 + `apps/web/CLAUDE.md`, and `packages/shared/CLAUDE.md` if it documents the service-type default): record the F04-5 entry (duration now required, "Route planning" section + preview consumer, `InspectorSelect`/`useInspectorSearch`, ASSUMPTION-1 no-base banner dropped) and remove any "transitional `.default(45)` until F04-5" clause.
- [ ] T025 Full scoped verification inside the worktree: `pnpm --filter @properfy/shared test && build`; `pnpm --filter backend typecheck && lint && test` (+ `test:integration:db`); `pnpm --filter web typecheck && lint && test`; the two E2E specs. No `as any`; api-types committed.

## Dependencies

- Phase 2 (T002–T004) blocks everything (the required field + regenerated api-types).
- US1 backend (T005–T007) and US1 web (T008–T012) can proceed after Phase 2; T008 is parallel-safe.
- US2 (T013–T021): T015/T016 parallel; T017 before T019; T018 before T019; T020 before T021.
- E2E (T022/T023) after their stories; T024/T025 last.

## Parallel opportunities

- T008 (types) ∥ T005 (backend test) after Phase 2.
- T015 (`useInspectorSearch`) ∥ T016 (`InspectorSelect`) ∥ T013 (weights section test).
- T022 ∥ T023 (independent E2E specs).

## MVP

User Story 1 alone (required duration end-to-end) is a shippable increment; User Story 2 adds the weights + preview.
