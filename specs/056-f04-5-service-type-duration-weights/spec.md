# Feature Specification: Service Type Duration + Route Weights (web)

**Feature Branch**: `056-f04-5-service-type-duration-weights`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F04-5 — "Shared + backend + web admin: mandatory service-type duration and route weights (with preview)" (`fase2-etapa1/tarefas/F04-tarefas.md` §TASK-F04-5). Contract codes **B5** (service-type estimated duration) and **01.14** (route planning weights + preview), limit rule **L-F04-14**.

## Context & Dependencies

This closes the F04 "day route" chain on the web admin side. All dependencies are merged into `develop`:

- **TASK-F04-1** — `ServiceType.defaultDurationMinutes` exists in the backend/DB (NOT NULL, 5–480, `DEFAULT 45`) and in `createServiceTypeSchema`/`updateServiceTypeSchema` as a **transitional** `.default(45)`.
- **TASK-F04-2 + F04-2b (#1333)** — `routeWeights` platform setting registered (`PLATFORM_SETTINGS_REGISTRY.routeWeights`); `POST /v1/day-plans/preview` (AM/OP, 10/min, body `previewRouteWeightsRequestSchema`, response `routeWeightsPreviewResponseSchema = { current, proposed }`) is live.
- **TASK-F03-4** — the "Platform settings" page (AM/OP route `/platform-settings`, generic `usePlatformSetting(key)` hook, `FieldEventsSettingsSection` as the section model) exists.

This task is the **web consumer** of those contracts, plus the one shared/backend change that flips the service-type duration from "transitional default" to "required".

## Clarifications

### Session 2026-11-02

- **Q: The task doc (edge case 4) expects the preview to show "No base address: route starts at the first window" when the inspector has no base, deriving it from an `origin.source = NONE` field. Does the merged `POST /v1/day-plans/preview` response expose origin/source?** → **No.** The merged `routeWeightsPreviewSchema` (`packages/shared/src/schemas/day-plan.ts`) carries only `weights`, `etaSource`, `approximate`, `departureAt`, `finishEta`, `totals {driveS, waitS, lateS}`, `feasible`, and `stops[]` (`appointmentId`, `sequence`, `appointmentCode`, `suburb`, `windowStart`, `windowEnd`, `timezone`, `eta`, `lateS`). Origin is resolved server-side (geocoded base → none) and never surfaced. **Decision (premise):** the no-base banner is dropped; it is not derivable from the contract and inventing a field is out of scope. The preview still works for a base-less inspector (origin = none). Recorded as [ASSUMPTION-1].

- **Q: The shared `SelectInput` primitive is static-options only; the preview needs a server-searched inspector picker (L-F04-14).** → **Build a feature-local searchable combobox** (`InspectorSelect` + `useInspectorSearch`) modeled on the existing `AgencySelect` / `useAgencySearch` pattern (debounced 300 ms server search), never by modifying the shared `SelectInput`. Recorded as [ASSUMPTION-2].

- **Q: In what timezone are the preview totals line (`finishEta`, `departureAt`) formatted, given the preview response has no plan-level timezone?** → The user's **effective timezone** (`useEffectiveTimezone()`), consistent with the `~` approximate marker on the finish time; per-stop `eta`/windows use each stop's own `stop.timezone`. Recorded as [ASSUMPTION-3].

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Estimated duration is mandatory on a service type (Priority: P1)

An Admin Master creates or edits a service type. Because the day-route planner needs a per-stop service duration to schedule the day, the "Estimated duration (min)" field is now required: the form will not submit without a valid whole number from 5 to 480, and the API rejects a create without it.

**Why this priority**: The route planner (F04-1/F04-2) already reads `defaultDurationMinutes`; until the web form collects it, every new service type silently inherits the transitional `45`. Making it required removes that silent default and is the contract-freezing change (backend + shared + web deploy together).

**Independent Test**: Open the service-type drawer as AM, try to save with the duration empty / out of range / fractional, see the field error; enter `60`, save, confirm `POST /v1/service-types` carries `defaultDurationMinutes: 60`; open an existing type, confirm the stored value loads, change it, confirm `PATCH` carries the new value.

**Acceptance Scenarios**:

1. **Given** the "New Service Type" drawer, **When** the operator submits with "Estimated duration (min)" empty, **Then** the form shows "Enter the duration in minutes" and no request is sent.
2. **Given** the drawer, **When** the operator enters `4`, **Then** the field shows "Enter a duration between 5 and 480 minutes"; `481` shows the same; `45.5` shows "Enter whole minutes".
3. **Given** the drawer with code/name/flow/duration=`60` filled, **When** the operator saves, **Then** `POST /v1/service-types` is sent with `defaultDurationMinutes: 60` and the type is created.
4. **Given** the edit drawer for a type whose stored duration is `45`, **When** it opens, **Then** the field shows `45`; changing it to `50` marks the form dirty and saving sends `PATCH …` with `defaultDurationMinutes: 50`.
5. **Given** the server rejects the create with a `details` entry on `defaultDurationMinutes`, **When** the response returns, **Then** the error is shown on the duration field.
6. **Given** an API client (bundle, script, integration) that calls `POST /v1/service-types` without `defaultDurationMinutes`, **When** it posts, **Then** the API returns `400 VALIDATION_ERROR` with `details[0].field = 'defaultDurationMinutes'` (previously it returned `201` with `45`).

### User Story 2 - Route planning weights, with a before-you-save preview (Priority: P2)

An Admin Master or Operator opens "Platform settings" and finds a new "Route planning" section with three weights (driving time, waiting for windows, starting near the base). They can preview the effect of the weights on a real inspector's day before saving, seeing the saved order side by side with the order the form's weights would produce.

**Why this priority**: The weights steer every inspector's suggested day order. A preview lets AM/OP see the consequence (does the order actually change?) before committing a platform-wide change.

**Independent Test**: Load `/platform-settings` as AM; the "Route planning" section shows three weights at `1/1/1` with a "Default" badge; set "Waiting for windows" to `0`; pick an inspector and a date; click "Preview"; see two columns ("Saved weights" vs "Weights in this form") where the right column is highlighted "Order changes with these weights" when the order differs; save; reload; confirm `0` persisted.

**Acceptance Scenarios**:

1. **Given** the "Route planning" section, **When** it loads with no stored row, **Then** the three weights show `1 / 1 / 1` with a "Default" badge.
2. **Given** a weight field, **When** the operator enters `-1`, `10.5`, or `0.15`, **Then** the field shows "Enter a number from 0 to 10 with at most one decimal place"; **When** all three are `0`, **Then** the group shows "At least one weight must be greater than 0".
3. **Given** valid weights, **When** the operator clicks "Save changes", **Then** `PUT /v1/platform-settings/routeWeights` is sent with `{ value: { travel, windowWait, baseProximity } }` and a snackbar reads "Route weights saved. They apply to the next route calculation.".
4. **Given** unsaved edits, **When** the operator clicks "Discard changes", **Then** the fields return to the loaded values.
5. **Given** the preview block with no inspector selected, **When** rendered, **Then** "Preview" is disabled; the date defaults to tomorrow in the user's effective timezone.
6. **Given** an inspector and date selected, **When** the operator clicks "Preview", **Then** `POST /v1/day-plans/preview` is sent with the inspector, date, and the **form's** weights (even if unsaved); the result renders two columns "Saved weights" / "Weights in this form", each listing stops as "1. INS-0042 · Surry Hills · 9:00 am – 11:00 am · ETA 9:05 am" (times render 12h am/pm via the shared helpers) and totals "Drive 1 h 10 min · Waiting 15 min · Finish ~1:40 pm".
7. **Given** a preview whose two columns differ in order, **When** rendered, **Then** the right column is flagged "Order changes with these weights".
8. **Given** a preview with `approximate: true`, **When** rendered, **Then** a badge "Approximate (straight-line estimate)" is shown; a stop with `lateS > 0` shows a chip "Late by 25 min".
9. **Given** an inspector with no inspections on the chosen day, **When** previewed, **Then** "This inspector has no inspections on this day." is shown.
10. **Given** the preview is rate-limited, **When** a `429` returns, **Then** "Too many previews. Try again in a minute." is shown; any other error shows an `ErrorState` with "Retry".
11. **Given** the inspector picker (L-F04-14), **When** the operator types "jan", **Then** after a 300 ms debounce `GET /v1/inspectors?status=ACTIVE&search=jan&pageSize=20` is sent; the list shows only the returned inspectors; an empty result shows "No inspectors found"; no request uses `pageSize=100`.
12. **Given** the date field (L-F04-14), **When** rendered, **Then** `min` is today and `max` is today+14 in the user's effective timezone; a `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` from the server shows "Pick a day between today and 14 days ahead" on the date field.

### Edge Cases

- A legacy service type (backfilled) already has a duration; the edit drawer shows it.
- A stale web bundle creating a type without the field → `400` until reload (rare, AM-only; stale-chunk retry resolves).
- Stored weights invalid in the DB → the platform-setting read returns the defaults with `isDefault`/`valid=false`, and the section shows the defaults.
- Preview with Mapbox unavailable → `approximate` badge.
- More than 100 active inspectors (L-F04-14) → the server search finds any of them; nothing is silently truncated.
- Date outside today..today+14 (L-F04-14) → the `DateInput` marks it invalid; if it still reaches the server (tz change, URL tamper), `422` with the message on the field.
- **[ASSUMPTION-1]** Inspector with no base address → the preview still renders (origin resolved server-side); the "No base address" banner from the task doc's edge case 4 is **not** shown because the merged response exposes no origin/source field.

## Requirements *(mandatory)*

### Functional Requirements

**Shared + backend (contract change):**

- **FR-001**: `createServiceTypeSchema.defaultDurationMinutes` MUST be required — remove the transitional `.default(SERVICE_TYPE_DURATION_DEFAULT_MINUTES)`. `updateServiceTypeSchema.defaultDurationMinutes` stays `.optional()` (same 5–480 integer bounds).
- **FR-002**: `packages/shared/src/schemas/service-type.test.ts` MUST assert: `createServiceTypeSchema` without `defaultDurationMinutes` → **invalid**; `5` and `480` valid; `4`, `481`, `45.5`, `'45'`, `null` invalid; `updateServiceTypeSchema` optional with the same bounds.
- **FR-003**: `openapi.json` + `packages/shared/src/api-types.ts` MUST be regenerated (`pnpm generate:api`) so `defaultDurationMinutes` is `required` on the create body; both committed.
- **FR-004**: `CreateServiceTypeInput.defaultDurationMinutes` becomes required (type-level); the backend use case and any route-level creation path compile without change of rule.
- **FR-005**: Backend integration test `service-type.routes.test.ts` MUST assert: `POST /v1/service-types` as AM without the field → `400 VALIDATION_ERROR`, `details[0].field = 'defaultDurationMinutes'` (the shared error-handler maps Zod issues to `{ field, message }`; `fastify-type-provider-zod` validates the body before the handler); with `60` → `201`; `PATCH` without the field → `200`, duration unchanged. Every existing integration test that creates a type **via the route** MUST send the field; tests inserting directly into the DB are unchanged (DB `DEFAULT 45`).

**Web — service type drawer:**

- **FR-010**: `ServiceTypeFormData` MUST gain `defaultDurationMinutes: string` (input value); `EMPTY_SERVICE_TYPE_FORM.defaultDurationMinutes = ''`; the web `ServiceType` type MUST gain `defaultDurationMinutes: number` (already in the API response).
- **FR-011**: The drawer MUST render a required `FormField label="Estimated duration (min)"` with the shared `NumberInput` (the established numeric primitive; `TextInput` does not accept `type="number"`), placed immediately after "Flow Type".
- **FR-011a**: `NumberInput` MUST gain an **optional** `aria-describedby` passthrough prop (additive, no behavior change for existing callers) so the duration help text and weight errors can be associated with their inputs.
- **FR-012**: Help text "Time the inspector spends at each stop. Used to plan the day route." MUST be rendered with an id and linked to the input via `aria-describedby`.
- **FR-013**: Validation MUST produce: empty → "Enter the duration in minutes"; non-integer → "Enter whole minutes"; out of 5–480 → "Enter a duration between 5 and 480 minutes". Server `details` on the field → field error.
- **FR-014**: The save payload (`useServiceTypeSave`) MUST convert the string to a number and include `defaultDurationMinutes` on both `POST` (create) and `PATCH` (update); the edit path MUST load the stored value from the detail.

**Web — Route planning section:**

- **FR-020**: A `RouteWeightsSettingsSection` MUST render on `/platform-settings` using `usePlatformSetting('routeWeights')`, after "Field events" (section order by registry/`section`).
- **FR-021**: Three weight fields (Driving time, Waiting for windows, Starting near the base), each numeric 0–10 step 0.1, inside a `fieldset`/`legend "Route weights"`, with the help texts and the introduction paragraph from the task doc.
- **FR-022**: Client validation: a weight < 0, > 10, or with > 1 decimal place → "Enter a number from 0 to 10 with at most one decimal place" (on the field); all three `0` → "At least one weight must be greater than 0" (on the group). Save disabled while invalid or not dirty.
- **FR-023**: "Save changes" → `PUT /v1/platform-settings/routeWeights` `{ value: { travel, windowWait, baseProximity } }`, snackbar "Route weights saved. They apply to the next route calculation."; "Discard changes" restores; "Last changed by {name} on {dd/MM/yyyy HH:mm}" and the "Default" badge mirror the Field-events section.

**Web — preview:**

- **FR-030**: A `RouteWeightsPreview` component + `useRouteWeightsPreview` (`useMutation` on `POST /v1/day-plans/preview`) MUST let AM/OP preview the **form's** weights against a chosen inspector + date, showing two columns: "Saved weights" (`response.current`) and "Weights in this form" (`response.proposed`).
- **FR-031**: Each column lists stops as `"{sequence}. {appointmentCode} · {suburb} · {windowStart}–{windowEnd} · ETA {eta in stop.timezone}"` inside an `<ol>`, and a totals line "Drive {driveS} · Waiting {waitS} · Finish ~{finishEta}" formatted in the effective timezone [ASSUMPTION-3]. A stop with `lateS > 0` shows "Late by {n} min". A top-level `approximate` shows "Approximate (straight-line estimate)".
- **FR-032**: When `current.stops` and `proposed.stops` differ in appointment order, the "Weights in this form" column is flagged "Order changes with these weights".
- **FR-033**: States: "Preview" disabled with no inspector; loading skeleton; empty — because both columns share one inspector/day stop set, when `stops` is empty the two-column result is replaced by a single message "This inspector has no inspections on this day."; `429` → "Too many previews. Try again in a minute."; other error → `ErrorState` with "Retry". Focus moves to the result heading after a successful preview. Fixed note "Preview uses estimated travel times and doesn't change any route.".
- **FR-034** [ASSUMPTION-2]: The inspector selector is a feature-local searchable combobox (`InspectorSelect` + `useInspectorSearch`) that queries `GET /v1/inspectors?status=ACTIVE&search={text}&pageSize=20` debounced 300 ms; empty result → "No inspectors found"; never `pageSize=100`; the shared `SelectInput` is not modified.
- **FR-035**: The date uses `DateInput` with `min` = today and `max` = today+14 in the effective timezone (`useEffectiveTimezone` + `todayInTzDateString` + `addCivilDays`); default = tomorrow; a `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` shows the server message on the field. The date is always the effective timezone, never the browser's.

**General:**

- **FR-040**: No `as any`; all request/response types come from the generated `api-types`/shared.
- **FR-041**: The `PlatformSettingsPage` renders "Field events" then "Route planning"; the page's dirty-guard back behaviour covers both sections.

### Key Entities

- No new entities. Reads/writes: `ServiceType` (create/update body + detail), `routeWeights` platform setting (`GET/PUT /v1/platform-settings/routeWeights`), day-plan preview (`POST /v1/day-plans/preview`, `{ current, proposed }`), inspector list (`GET /v1/inspectors`).
- **Multi-tenant note**: this web layer reads two platform-scoped surfaces — the `routeWeights` `PlatformSetting` and the `day_plan` preview — both of which carry **no `tenant_id`** and are role-scoped (AM/OP) by the backend. Service types are platform configuration. No tenant predicate is introduced on the web.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (acceptance criterion 1 / **B5**): An AM cannot save a service type without a valid "Estimated duration (min)" (5–480, integer), on create and on edit; the API rejects a create without it.
- **SC-002** (acceptance criterion 2 / **01.14**): AM/OP can save the three route weights and see their effect in the preview before saving.
- **SC-003** (**L-F04-14**): the inspector picker searches server-side (never a `pageSize=100` truncation) and the preview date is constrained to today..today+14 in the effective timezone.
- **SC-004**: `pnpm generate:api` output is committed and CI contract-freshness passes; no `as any`.
- **SC-005**: new/changed unit tests (shared schema, drawer, save hook, section, preview, page) and two Playwright E2E specs (`route-weights.spec.ts`, `service-type-duration.spec.ts`) pass; backend full suite (incl. integration) passes.

## Out of Scope

- A duration column in the service-type table.
- The OP "live day" plans screen (F05).
- Any change to existing dashboard screens (D12).
- The preview "No base address" banner (task doc edge case 4) — not derivable from the merged contract [ASSUMPTION-1].
- Re-implementing the preview backend (shipped by F04-2b #1333).

## Assumptions

- **[ASSUMPTION-1]**: The `POST /v1/day-plans/preview` response exposes no origin/source field, so the inspector-without-base banner is dropped. The preview still renders for a base-less inspector.
- **[ASSUMPTION-2]**: The searchable inspector selector is built feature-locally (mirroring `AgencySelect`), not by extending the shared `SelectInput`.
- **[ASSUMPTION-3]**: Preview totals (`finishEta`, `departureAt`) are formatted in the user's effective timezone; per-stop `eta`/windows use `stop.timezone`.
- Backend and web deploy together (the API starts requiring the field); rollback = revert the whole PR (restores `.default(45)`); no data to clean.
