# Feature Specification: Activity density layer on the appointment map (web)

**Feature Branch**: `050-f09-2-density-map-layer`
**Created**: 2026-11-02
**Status**: Draft
**Input**: TASK-F09-2 (`fase2-etapa1/tarefas/F09-tarefas.md`) — web consumer of the `GET /v1/map/execution-density` endpoint delivered by TASK-F09-1 (PR #1326, in `develop`). Contract D.1–D.4 (codes D.A1, D.A2, D.A3).

## Overview

On the `/map` screen (Appointments mode only), an **"Activity density"** toggle turns on a Mapbox heatmap of inspector check-ins, aggregated into ~100 m cells by the backend. The layer has its **own period selector** (default: last 30 days), independent of the pin "Date Range" window. It respects the agency and inspector filters that already exist in the map filter panel (AM/OP). Numbered legend and a textual summary are shown. The layer sits **below** the lasso (`mapbox-gl-draw`) layers and is re-applied after `style.load`.

This is a **web-only** feature. It adds no backend route, schema, or `api-types` change — it consumes the already-merged F09-1 contract through the typed `openapi-fetch` client. No existing dashboard is modified.

## Clarifications

### Session 2026-11-02

`/speckit.clarify` ran a full taxonomy scan. All categories resolved as Clear — the source task file (`F09-tarefas.md`) freezes every state, text string, edge case, and acceptance test (decisions L-F09-01..09, all accepted). No critical ambiguities required a product decision. The only pending plan item, Q6 (contract wording, no implementation impact), is recorded under Assumptions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator views platform-wide check-in density (Priority: P1)

An AM or OP opens `/map` in Appointments mode and clicks **"Activity density"**. A small panel appears with a period selector defaulting to **Last 30 days**. A heatmap of inspector check-ins for that period is drawn over the map, aggregated into ~100 m cells. The operator can switch the period (7/30/90 days or a Custom range), and can narrow the layer to one agency and/or one inspector using the existing map filters. A numbered legend and a text summary (`N check-ins · M areas`) explain what is shown.

**Why this priority**: This is the core contract deliverable (D — density map). AM/OP are the operational audience and the only roles that can filter by agency and inspector.

**Independent Test**: Turn on the toggle as AM; confirm a request to `/v1/map/execution-density?fromDate=<today-29>&toDate=<today>` fires and a heatmap renders; switch to Last 7 days and confirm a new request with the shorter range; apply an agency filter and confirm `tenantId` is sent and the heatmap changes.

**Acceptance Scenarios**:

1. **Given** an AM in Appointments mode, **When** they enable "Activity density", **Then** the panel shows the period tablist with "Last 30 days" selected and the layer requests the last 30 Sydney civil days (inclusive, ending today).
2. **Given** the layer is on, **When** the operator selects "Last 7 days", **Then** a new request uses the 7-day range and the heatmap re-renders without moving the camera.
3. **Given** the layer is on, **When** the operator picks an agency in the map filter panel, **Then** the density request carries that `tenantId` and the heatmap updates to that agency's check-ins.
4. **Given** the layer is on, **When** the operator changes the pin "Date Range", **Then** no density request fires (the layer window is independent).
5. **Given** AM chooses "Custom" with an invalid range (end before start, > 366 days, or a future end date), **Then** an inline `role="alert"` message is shown and the layer period does not change.

### User Story 2 - Agency user views only their own agency's density, privacy-preserving (Priority: P1)

A CL_ADMIN or CL_USER opens `/map` and turns on "Activity density". They see only their own agency's check-ins, aggregated. The period selector offers only the fixed presets **Last 7 / 30 / 90 days** (no Custom), because the backend only accepts those presets for agency accounts (prevents window-difference de-anonymization). Cells with fewer than 3 check-ins are hidden by the backend; the panel explains this. The agency account cannot filter by inspector, and the control never sends `tenantId`/`inspectorId`.

**Why this priority**: D.A3 — agency isolation and privacy by construction. Equally critical to US1.

**Independent Test**: As CL_ADMIN, enable the layer; confirm the tablist has exactly 3 presets and no "Custom"; confirm the request carries neither `tenantId` nor `inspectorId`; confirm the privacy line `Areas with fewer than 3 check-ins are hidden for privacy.` appears when the response `minCellCount` is 3.

**Acceptance Scenarios**:

1. **Given** a CL account, **When** they open the panel, **Then** the period tablist shows only `Last 7 days`, `Last 30 days`, `Last 90 days` and no `Custom` tab or date range.
2. **Given** a CL account with `tenantId`/`inspectorId` somehow populated in props, **When** the hook is called, **Then** it receives neither parameter and the scope line reads `Your agency's inspections only. Other map filters don't apply.`
3. **Given** a CL response with `minCellCount: 3`, **When** the summary renders, **Then** a line `Areas with fewer than 3 check-ins are hidden for privacy.` is shown (the number comes from the response, not an imported constant).
4. **Given** a CL response with `cells: []` but `totalExecutions > 0` and `minCellCount: 3`, **Then** the panel shows `No area has 3 or more check-ins in this period. Try a longer period.` and hides the legend.
5. **Given** the Sydney day has rolled over and a refetch returns 400 `PERIOD_NOT_A_PRESET`, **Then** the control re-anchors the preset to the new "today" and retries exactly once; if that also fails, the error state is shown without a further automatic retry.

### User Story 3 - Layer coexists with the lasso and survives style reloads (Priority: P2)

The density heatmap must render beneath the lasso selection polygon and must survive a Mapbox style reload (`style.load`), re-ordering itself below the `gl-draw-*` layers after the draw control re-adds them.

**Why this priority**: Correctness of map layering; without it the heatmap can obscure the lasso or vanish after a style change. Lower than P1 because it is a robustness property rather than the primary user value.

**Independent Test**: With the layer on and the lasso active, confirm the polygon and vertices stay above the heatmap; simulate a `style.load` + `styledata` and confirm the heatmap is re-created and moved below the first `gl-draw-*` layer exactly once (idempotent, no loop).

**Acceptance Scenarios**:

1. **Given** the layer and the lasso are both on, **When** the user draws a polygon, **Then** the polygon renders above the heatmap.
2. **Given** a style reload occurs, **When** the draw control re-adds its layers on top, **Then** the heatmap is moved back below the first `gl-draw-*` layer exactly once and does not re-trigger indefinitely.
3. **Given** the map is destroyed on mode switch, **When** the component unmounts, **Then** cleanup runs inside try/catch and throws no exception.

### Edge Cases

- **No executions in period**: layer is empty and the summary shows `No check-ins in this period.`; legend hidden.
- **Executions without usable coordinates**: excluded from the map; counted as `{k} check-ins without a location`.
- **Abandoned executions (F03)**: already excluded by the backend; nothing to do in web.
- **CL with few executions**: k=3 can empty the layer; panel shows the "try a longer period" message.
- **Inspector filter for CL**: not present in the UI; the control discards any value before the hook, so the backend 403 is never reached from the UI.
- **Period too large / future (Custom, AM/OP)**: client blocks > 366 days and future end dates; server rejects identically (400) as defence.
- **`truncated: true`**: an extra line `Showing the 5,000 busiest areas.`; the layer shows the 5,000 highest-count cells.
- **Lasso active**: drawing does not affect the layer; the polygon stays on top.
- **Mapbox token missing**: `MapContainer` already shows its error and `mapInstance` is `null`; `DensityLayer` does nothing and the panel still works (shows the summary).
- **Agency changed with the panel open (AM/OP)**: a new request fires; previous data stays until the response (`keepPreviousData`). If the response fails, the layer empties (does not keep the previous agency) and shows the error.
- **Day rollover in Sydney with the panel open**: the period does not advance on its own; the user sees yesterday's period until they act or re-toggle. For CL the next refetch gets 400 `PERIOD_NOT_A_PRESET`, and the control re-anchors and retries once.
- **All cells same count (e.g. CL all at 3)**: all render at the maximum tone; the legend `1 … 3` plus the relative-scale sentence explain it.
- **Error after a successful response**: the layer empties (`cells: []`, still `visible`), the legend is hidden, no stale `{n} check-ins` number remains, and a `Retry` button is shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an "Activity density" toggle button in the `/map` toolbar (upper-right, to the left of the lasso button), present **only** in Appointments mode, with `aria-pressed` and `aria-controls`.
- **FR-002**: When enabled, the system MUST show a panel (`role="region"`, `aria-labelledby` the title) containing the layer's own period selector, a scope line, a legend, and a text summary.
- **FR-003**: The layer period selector MUST default to **Last 30 days** (30 Sydney civil days ending today, inclusive) and MUST be independent of the pin "Date Range".
- **FR-004**: For AM/OP, the period selector MUST offer `Last 7 days`, `Last 30 days`, `Last 90 days`, and `Custom`. For CL_ADMIN/CL_USER, it MUST offer only the three presets and no `Custom`.
- **FR-005**: The `Custom` range (AM/OP only) MUST be validated on the client before applying — end on/after start, ≤ 366 days, end not in the future, both dates chosen — with inline `role="alert"` messages; only a valid range reaches the request.
- **FR-006**: The layer MUST send the agency (`tenantId`) and inspector (`inspectorId`) filters from the map filter panel **for AM/OP only**; for CL the control MUST send neither.
- **FR-007**: The request MUST omit empty-string parameters (never send `tenantId=''` or `inspectorId=''`).
- **FR-008**: The data layer MUST be a Mapbox `heatmap` layer sourced from the aggregated cells, with weight normalized to the current response's `maxCount` (relative scale).
- **FR-009**: The heatmap MUST render below the lasso (`gl-draw-*`) layers via `beforeId`, and MUST re-apply after `style.load` and re-order below `gl-draw-*` on `styledata` idempotently (no infinite loop).
- **FR-010**: All Mapbox paint color strings MUST use comma-form HSL (`hsla(199, 54%, 28%, …)`); space-form HSL (which breaks the map, PR #1302) MUST NOT appear in paint.
- **FR-011**: The legend MUST show numbered labels (`1` on the left, `{maxCount}` on the right via `toLocaleString('en-AU')`; a single `1` when `maxCount === 1`) and the sentence `Colour is relative to the busiest area in this view.`
- **FR-012**: The summary (`aria-live="polite"`) MUST show one of: `Loading activity…`; `{n} check-ins · {m} areas` (`n` = `totalExecutions`, `m` = `cellCount` from the response); `No check-ins in this period.`; plus optional extra lines `{k} check-ins without a location` and `Showing the 5,000 busiest areas.`
- **FR-013**: When the response `minCellCount > 1` (CL), the panel MUST show `Areas with fewer than {minCellCount} check-ins are hidden for privacy.`; and when `cells` is empty with `totalExecutions > 0`, `No area has {minCellCount} or more check-ins in this period. Try a longer period.`
- **FR-014**: The scope line MUST state what does not apply: AM/OP → `All agencies` / `Filtered by agency` / `Filtered by inspector` / `Filtered by agency and inspector`, each followed by `Other map filters (status, branch, service, dates) don't apply.`; CL → `Your agency's inspections only. Other map filters don't apply.`
- **FR-015**: On error (after any previous success), the hook MUST return the empty state (`cells: []`, counts `0`, `truncated: false`, `minCellCount: 1`), never stale `data`/placeholder; the panel MUST show `Couldn't load activity density.` + a `Retry` button, hide the legend, and show no stale numbers.
- **FR-016**: For CL, a 400 with `error.details.reason === 'PERIOD_NOT_A_PRESET'` MUST cause the control to re-anchor the current preset to the new Sydney "today" and retry exactly once before showing the error state.
- **FR-017**: "Today" MUST be computed with `todayInTzDateString(PLATFORM_TIMEZONE)` (Sydney-only by design, matching the backend) and evaluated only when the layer is enabled, when a preset/Custom is applied, and on re-anchoring — never in render, with no timer.
- **FR-018**: The layer MUST NOT move the camera when enabled or when the period changes.
- **FR-019**: Enabling/disabling the layer and the period MUST NOT be persisted (no storage/URL/deep-link). The density layer MUST exist only in Appointments mode; it MUST NOT be mounted in Groups mode.
- **FR-020**: The `AppointmentMapPage.tsx` change MUST be ≤ ~12 lines (import + JSX wiring in the toolbar, appointments mode only); all logic lives in the control, hook, and lib.
- **FR-021**: Keyboard: `Tab` reaches the toggle; `Enter`/`Space` toggles; arrow keys move between period tabs (`FilterSegmented` behavior); `Escape` inside the panel closes the panel and returns focus to the toggle **without** turning the layer off. A `×` button (`aria-label="Close activity density panel"`) closes only the panel.
- **FR-022**: The feature MUST consume `GET /v1/map/execution-density` only through the typed `api.GET` client — no `as any`/`as never`.
- **FR-023**: The query MUST use key `['map', 'execution-density', fromDate, toDate, tenantId ?? null, inspectorId ?? null]`, `staleTime: 5 * 60_000`, `placeholderData: keepPreviousData`, and `enabled: enabled && !!fromDate && !!toDate`.

### Key Entities

- **DensityCell** (view model): `{ lat: number; lng: number; count: number }` — a cell center and its check-in count, as returned by the endpoint.
- **Layer period state**: `{ enabled: boolean; preset: '7d' | '30d' | '90d' | 'custom'; range: { fromDate: string; toDate: string } }` — `range` changes only on enable, preset/Custom apply, or re-anchor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the layer enabled, the density request uses the layer's own period; the default is the last 30 Sydney civil days; changing the pin "Date Range" produces zero density requests.
- **SC-002**: Changing the agency or inspector in the map filter panel (AM/OP) changes the density request parameters and the rendered heatmap.
- **SC-003**: A CL account sees only the three presets, never sends `tenantId`/`inspectorId`, and recovers from a Sydney day rollover with exactly one automatic retry.
- **SC-004**: The heatmap always renders below the lasso polygon and is restored (with the latest cells, below `gl-draw-*`) after a style reload, with no infinite `styledata` loop.
- **SC-005**: No Mapbox paint color uses space-form HSL (guarded by a test), so the map never fails to load for this reason.

### Contract acceptance criteria (for homologation — codes verbatim)

- **D.A1**: With the layer enabled, the request uses the layer's own period selector; default = last 30 Sydney days (tests P1, C2, C3); changing the pin "Date Range" does not change the layer (test E2).
- **D.A2**: Changing the agency or inspector in the map filter panel changes the request and the layer (tests C5, E3; AM smoke).
- **D.A3**: A CL never sends `tenantId`/`inspectorId` (test C6) and only receives its own agency (guaranteed and proven in TASK-F09-1: U4/U5/D2/D3); a browser smoke with two CLs from different agencies shows different heatmaps.
- **Privacy CL (L-F09-01)**: CL sees only the 7/30/90-day presets (test C4a) and the control recovers from the day rollover (test C4b).
- **Legend and states (L-F09-03/04/05/07/08)**: privacy and summary text come from the response (tests H8, C9, C11a); numbered legend with the relative sentence (test C9b); period does not change by itself (tests P9, C17); scope line in all four cases (test C7); error empties the layer (tests H6, C13).

## Assumptions

Pending plan decisions are assumed per the plan's recommendation and recorded as premises:

- **Q6 (decisoes.md, PENDING)**: contract wording only ("D over the 01 map"); does not affect this implementation. Assumed: no implementation impact.
- **L-F09-01 (CL presets-only + re-anchor)**: assumed accepted (it is, per `_decisoes-lacunas.md`). CL period selector offers only 7/30/90-day presets; on `PERIOD_NOT_A_PRESET` the control re-anchors and retries once.
- **L-F09-03**: web does not import `MIN_CELL_COUNT_CL`; it reads `minCellCount` (default 1) and `cellCount` from the response.
- **L-F09-04**: relative scale; legend shows numbers `1` and `{maxCount}` plus the "relative to the busiest area" sentence; no absolute scale, no per-cell tooltip.
- **L-F09-05**: "today" evaluated on enable/preset-apply/Custom-apply/re-anchor; period lives in state, never derived in render; no timer.
- **L-F09-06**: Sydney-only by design (`PLATFORM_TIMEZONE`), deliberately diverging from F00's `resolveWindowTimezone(tenant.timezone)` for pins; today the effect is nil (all agencies in `Australia/Sydney`).
- **L-F09-07**: scope line always states what does not apply (four AM/OP variants, one CL variant).
- **L-F09-08**: error empties the layer (`isError ? EMPTY : data`), the layer receives `cells: []` (empty collection, source not removed), summary shows only the error + `Retry`, legend hidden.
- **L-F00-03**: the F09 preset ("Last N days" = N civil days ending today, retrospective, exact) differs on purpose from F00's pin window ("Today + N days"); the two counts and their helpers must not be unified.
- **Multi-tenant note (§7.1)**: the density endpoint **is** tenant-scoped (unlike the platform-scoped Phase 2 inspector entities). The web control enforces agency isolation by discarding `tenantId`/`inspectorId` for CL; the backend is the authority (TASK-F09-1). No new platform-scoped entity is introduced here.
- **F00 coordination**: `FilterDateRange` already exposes `min`/`max` props in `develop` (F00 merged), so TASK-F09-2 P7 is a no-op — this feature only consumes the existing `max` prop. `AppointmentMapPage.tsx` is shared with F00; the wiring is kept to ≤ ~12 lines to avoid growth/conflict.
- **Existing dashboards untouched**: `/analytics`, `RegionHeatmap`, and `charts/theme.ts` are not modified; the new layer defines its own HSL-comma ramp of the same tone (`rgb(33,86,110)` = `hsl(199,54%,28%)`) without importing from `features/analytics`.
