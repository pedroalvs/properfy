# Phase 0 Research: Service Type Duration + Route Weights (web)

All items below were resolved against the merged `origin/develop @ 2fb00e3d`. No `NEEDS CLARIFICATION` remains.

## R1 — Does the merged preview response expose origin/base source?

- **Decision**: No. Drop the "No base address" banner (task doc edge case 4).
- **Rationale**: `routeWeightsPreviewSchema` (`packages/shared/src/schemas/day-plan.ts`) is `{ weights, etaSource:'MATRIX', approximate, departureAt, finishEta, totals{driveS,waitS,lateS}, feasible, stops[] }`. `stops[]` = `{ appointmentId, sequence, appointmentCode, suburb, windowStart, windowEnd, timezone, eta, lateS }`. There is **no** `origin`/`source` field. F04-2b resolves origin server-side (geocoded base → none) and never surfaces it. The response schema strips extra keys, so no field can be "added" by the client.
- **Alternatives considered**: (a) call `GET /v1/inspectors/:id` to check `baseLat/baseLng` and infer no-base — rejected: adds a request, duplicates server logic, and the preview is already correct without a base; (b) ask backend to add `origin` to the preview — rejected: out of scope (F04-2b is merged and frozen), and the banner is non-essential.

## R2 — Searchable inspector picker vs shared `SelectInput`

- **Decision**: Build feature-local `InspectorSelect` + `useInspectorSearch`, mirroring `AgencySelect` + `useAgencySearch`.
- **Rationale**: Shared `SelectInput` takes a static `options: SelectOption[]` with no text input and no async source. `AgencySelect`/`useAgencySearch` already implement the exact pattern we need (WAI-ARIA combobox, 300 ms debounce, server `search` param, "type to search" / empty-result handling, referential-stable results). L-F04-14 requires `GET /v1/inspectors?status=ACTIVE&search={text}&pageSize=20` (note: `pageSize=20`, not 100 as `useAgencySearch` uses). Modifying the shared `SelectInput` would widen a primitive for one caller.
- **Alternatives considered**: extend shared `SelectInput` with an async mode — rejected per Constitution V (minimal impact) and memory "SelectInput option scope bugs".

## R3 — Timezone for preview totals (finishEta/departureAt)

- **Decision**: Format `finishEta`/`departureAt` in the user's **effective timezone** (`useEffectiveTimezone()`); per-stop `eta` and window strings use each stop's own `stop.timezone`.
- **Rationale**: The preview response has no plan-level timezone; stops carry their own. The totals line is a summary display (prefixed `~`), so the viewer's effective tz is the least surprising. The date picker and range are also effective-tz (L-F04-14), keeping one tz for the operator's controls.
- **Alternatives considered**: use the first stop's tz for the totals — rejected: stops may span agencies; effective tz is the operator's consistent frame.

## R4 — Default preview date and range (L-F04-14)

- **Decision**: default date = **tomorrow** in effective tz (`todayInTzDateString(effectiveTz)` + 1 via `addCivilDays`); `DateInput min=today`, `max=today+14`.
- **Rationale**: Task doc test 5 fixes the default to tomorrow; L-F04-14 fixes the range to today..today+14; the server enforces the range with `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE`. `DateInput` already supports `min`/`max` (marks invalid, does not clamp) — `apps/web/src/components/forms/DateInput.tsx`.

## R5 — Two-column mapping (saved vs form)

- **Decision**: "Saved weights" column = `response.current`; "Weights in this form" column = `response.proposed`. The request always sends the **form's** weights as `weights`; the backend computes `current` from the stored platform setting and `proposed` from the request body.
- **Rationale**: F04-2b `PreviewRouteWeightsUseCase` computes `current` (saved `routeWeights` via `IPlatformSettingsReader`) vs `proposed` (request weights). So the client sends whatever is in the form (saved or not) and reads both back. "Order changes with these weights" compares the two `stops[]` appointment-id sequences.

## R6 — Service-type contract change blast radius (backend)

- **Decision**: Remove `.default(SERVICE_TYPE_DURATION_DEFAULT_MINUTES)` from `createServiceTypeSchema.defaultDurationMinutes` only; keep `updateServiceTypeSchema` `.optional()`. `CreateServiceTypeInput` becomes required (inferred). Grep every backend caller of `POST /v1/service-types` (integration tests, seed, scripts) and add the field where a route-level create omits it; direct DB inserts rely on `DEFAULT 45` and are untouched.
- **Rationale**: The route validates the body with the shared schema (`service-type.routes.ts`), so removing the default makes the API reject a create without the field. Risk flagged in the task doc: any client (stale bundle, script, integration) creating a type without the field now gets `400`.
- **Alternatives considered**: keep the default and validate only in the web form — rejected: the task's whole point (contract code B5) is to make the API require it, closing the silent-45 gap.

## R7 — api-types regeneration

- **Decision**: After the shared schema change, run `pnpm generate:api` (generate:openapi → `openapi.json`, generate:types → `api-types.ts`) and commit both. Never hand-edit.
- **Rationale**: CI `contract-freshness` fails on a stale committed contract (root CLAUDE.md §2); shared discipline rule (api-types SEMPRE regenerar).
