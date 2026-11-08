# Feature Specification: Inspector Performance Web Page & Reliability Index Settings

**Feature Branch**: `064-f07-3-inspector-performance-page`
**Created**: 2026-11-08
**Status**: Draft
**Input**: TASK-F07-3 (`fase2-etapa1/tarefas/F07-tarefas.md`) — Web: "Inspector performance" page (ranking, "Not enough data" block, stale/recompute banners, a drawer with the eight metrics and their failures), a Dashboard-group menu item, a "Reliability index" section on the "Platform settings" page, and the two new rejection codes in the `StatusTransitionDialog`.

**Contract codes covered:** `03.11` and `03.12` (the AM/OP reliability ranking + per-inspector detail, both on one page) and acceptance criterion **`03.A1`** (the web half: saving the weights informs a recompute and, after the job, the page shows the new score). Lacunas `L-F07-01`, `L-F07-02`, `L-F07-03`, `L-F07-04`, `L-F07-05`, `L-F07-06`, `L-F07-10`, `L-F07-11`; reconciliation `R3` (per-field display timezone), `R4` (menu position + real `Sidebar.roles.test.tsx`), `R5` (no sub-screen `backTo`).

**Builds on (already merged into `develop` @ `c3d78505`):**
- TASK-F07-2 — the AM/OP routes `GET /v1/dashboard/inspector-performance` and `GET /v1/dashboard/inspector-performance/{inspectorId}` (in `packages/shared/src/api-types.ts`), the shared response schemas (`reliabilityRankingResponseSchema`, `inspectorReliabilityResponseSchema`, `reliabilityMetricResultSchema`), and the `reliabilityIndex` platform-settings key readable/writable through the generic F03 endpoints `GET/PUT /v1/platform-settings/reliabilityIndex`.
- TASK-F07-1 — the shared enums `ReliabilityMetricKey`, `RELIABILITY_METRIC_KEYS` (canonical order), `RELIABILITY_METRIC_LABELS`/`DESCRIPTIONS`, `ReliabilityScoreStatus`, and the `INSPECTOR_NO_SHOW`/`NOT_EXECUTED` rejection codes with `allowedRejectionCodesFrom(fromStatus)` and `reasonCodeLabel`.
- TASK-X01 — the Dashboard menu group in `Sidebar.tsx` with `collapseIfSingle`, the exported `NAV_ITEMS`/`filterNavItems`, and the real `Sidebar.roles.test.tsx` (mocks of `SidebarSubmenu`/`SidebarItem` removed).
- TASK-F03-4 — the `PlatformSettingsPage.tsx` with per-key sections via `usePlatformSetting(key)`.

**No backend, schema, migration, or `api-types.ts` change.** This is a pure web consumer of an already-merged contract.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AM/OP reads the reliability ranking (03.11) (Priority: P1)

An Admin Master or Operator opens "Inspector performance" from the Dashboard menu and sees a 30-day ranking of inspectors by reliability score (rank, name, score, services), a separate "Not enough data" block for inspectors below the minimum volume, a header subtitle describing the window and last update, a "Configure weights" link, and a fixed notice that only operations staff see this page.

**Why this priority**: This is the core deliverable (03.11) and the minimal viable screen. Without the ranking read there is nothing to show.

**Independent Test**: Mock `GET /v1/dashboard/inspector-performance` with the F07-1 worked example (Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0; Carla 9) and render the page as AM → five rows in that order with columns Rank/Inspector/Score/Services, scores shown with one decimal, plus a "Not enough data" block listing "Carla Nunes · 9 of 10 services".

**Acceptance Scenarios**:

1. **Given** the ranking endpoint resolves with a snapshot, **When** AM or OP opens `/inspector-performance`, **Then** the page shows a `PageHeader` titled "Inspector performance" with subtitle "Last 30 days · {windowFrom} – {windowTo} · Updated {computedAt}", a fixed `InfoBanner` "Only operations staff can see this page. Agencies never see scores or rankings.", a "Configure weights" link to `/platform-settings#reliability-index`, and a ranking table ordered by the server's `ranked` array.
2. **Given** the ranked list, **When** it renders, **Then** each row shows "Rank {position}", the inspector name, the score with exactly one decimal (`97.5`, `89.0`, `100.0`), a decorative `aria-hidden` bar, and the services volume; ties keep the server-provided competition positions (two rows "2", the next "4").
3. **Given** `notEnoughData` is non-empty, **When** the page renders, **Then** a "Not enough data" section shows "Inspectors with fewer than {minimumVolume} services in the last 30 days are not ranked." and one line per inspector: "{name} · {volume} of {minimumVolume} services" for `INSUFFICIENT_VOLUME`, or "{name} · No data for the weighted metrics" for `NO_WEIGHTED_DATA`.
4. **Given** `ranked` is empty but `notEnoughData` is not, **When** the page renders, **Then** the table area shows "No inspector has enough services to be ranked yet." and the "Not enough data" block still appears; **given** `notEnoughData` is empty, the block does not render.
5. **Given** the request is loading / errors / returns `snapshotDate null`, **When** the page renders, **Then** it shows, respectively, a `LoadingState` "Loading inspector performance", an `ErrorState` "We couldn't load inspector performance." with a "Try again" button that refetches, or an `EmptyState` "No scores yet" / "Scores are calculated every night. The first ranking appears after the next run."

---

### User Story 2 - AM/OP opens one inspector's metric detail (03.12) (Priority: P1)

An Admin Master or Operator clicks (or keyboard-activates, or deep-links) an inspector row and a drawer opens showing the score/position/volume header, the eight metrics in canonical order (value, per-metric detail, weight), per-metric expandable failure lists linking to the appointment, weighted-minutes tooltips, and a normalization footnote.

**Why this priority**: The drawer is the explainability half (03.12) required at the same time as the ranking; one page covers 03.11 and 03.12.

**Independent Test**: Render the page with the fixtures, click Ana's row → the URL gains `?inspector=<id>`, a drawer with `aria-label` "Ana Costa reliability details" opens, its `GET /v1/dashboard/inspector-performance/:id` mock resolves, and it shows "88.3", "Rank 4 of 5", "12 services · last 30 days", and eight metric rows.

**Acceptance Scenarios**:

1. **Given** a ranked inspector, **When** the row is clicked or focused and Enter/Space pressed, **Then** the drawer opens, the URL gains `?inspector=<id>`, and a direct load of `/inspector-performance?inspector=<id>` opens the drawer immediately; **when** closed via the "Close" button, Escape, or a backdrop click, the `?inspector=` param is removed and focus returns to the originating row.
2. **Given** the detail resolves `SCORED`, **When** the drawer renders, **Then** the header shows the one-decimal score, "Rank {position} of {rankedCount}", "{volume} services · last 30 days", and (when `inspectorStatus` is `INACTIVE`) an "Inactive" badge with no "Rank"; eight `MetricRow`s render in `RELIABILITY_METRIC_KEYS` order with the UI labels, descriptions, formatted values, and "Weight {n}" / "Not weighted".
3. **Given** a metric with a rate, **When** rendered, **Then** the value reads like "Punctuality · 83% · 10 of 12 services · Weight 1"; satisfaction reads "Tenant satisfaction · 4.25 / 5 · 4 ratings · Weight 1"; volume reads "Completed volume · 100% · 12 completed · median 9.5 · Weight 1" (with an override: "… · reference 20 (fixed)"; with pro-rata: "10 completed in 12 days · median 9.5 / 30 days"); a null metric reads its per-metric "No data" text (e.g. "Late notice given · No data · No late arrivals in this period"); a weight-0 metric shows "Not weighted" with a de-emphasised (text, not colour-only) style.
4. **Given** a metric with failures, **When** its "Show {failureCount} issues" button is activated (`aria-expanded`), **Then** up to 20 items "{serviceDate} · {detail}" appear, each with an "Open appointment" link to `/appointments/:id`; when `failureCount > 20` a "Showing the 20 most recent of {failureCount}" note shows; a metric with no failures shows no expand button; the weighted-minutes `Tooltip` "{weightedSuccess} of {weightedEligible} weighted minutes" is present on all metrics except SATISFACTION and VOLUME.
5. **Given** the detail status is `INSUFFICIENT_VOLUME`, `NO_WEIGHTED_DATA`, or `NOT_COMPUTED`, **When** the drawer renders, **Then** it shows, respectively, "Not enough data" + "{volume} of {minimumVolume} services needed to be ranked" with metrics listed; a "No weighted data" header with metrics; or "No score yet" / "This inspector will be scored after the next nightly run." with no metric rows. Satisfaction below the minimum reads "Tenant satisfaction · Not enough ratings · {eligibleCount} of {minimumRatings} needed".
6. **Given** the detail is loading or errors, **When** the drawer renders, **Then** it shows a skeleton, or "We couldn't load this inspector's metrics." with "Try again"; an `?inspector=` with an unknown id shows "We couldn't find this inspector." and the "Close" button. The drawer footer reads "Percentages are weighted by service duration and planned travel." and "Scores update every night at 4:15 am."

---

### User Story 3 - AM/OP configures the reliability weights (03.A1) (Priority: P1)

An Admin Master or Operator opens "Platform settings", finds the "Reliability index" section, edits the eight weights, the minimum volume, the optional fixed volume reference, and the minimum ratings, and saves; the page confirms the scores are being recalculated.

**Why this priority**: `03.A1` is the single named acceptance criterion; the settings section is the web entry point that triggers the recompute that F07-2 performs.

**Independent Test**: Render `ReliabilityIndexSection` with `GET /v1/platform-settings/reliabilityIndex` mocked → eleven fields populate; change a weight and save → a `PUT /v1/platform-settings/reliabilityIndex` with the full object is sent, a success snackbar "Reliability settings saved. Scores are being recalculated." shows, and `['reliability']` queries are invalidated.

**Acceptance Scenarios**:

1. **Given** the section loads, **When** it renders, **Then** the eight "Weight" inputs (0–10, labelled per metric), "Minimum services to be ranked" (1–200), "Fixed volume reference (optional)" (empty or 1–1000), and "Minimum ratings for satisfaction" (1–50) show the stored values; the section anchor is `id="reliability-index"`.
2. **Given** invalid input, **When** the operator tries to save, **Then** client validation blocks it: a weight of 11 → "Enter a whole number from 0 to 10"; all weights 0 → "Set at least one weight above 0"; minimum volume 0 → "Enter a whole number from 1 to 200"; override 1001 → "Enter a whole number from 1 to 1000, or leave it empty"; minimum ratings 0 or 51 → "Enter a whole number from 1 to 50". An empty override field is sent as `null`.
3. **Given** a valid change, **When** the operator saves, **Then** the full object is `PUT`; on 200 the success snackbar shows and `['reliability']` is invalidated; on 422/400 the server `details` map to the fields or a banner. The "Save" button is disabled with no change and while submitting.
4. **Given** both AM and OP, **When** either opens the section, **Then** both see and can edit it and both can save (the `PUT` RBAC is the F03 rule; the link is never hidden) — `L-F07-11`.
5. **Given** the weights saved, **When** the page is reopened or `['reliability']` refetches, **Then** the ranking updates only after the backend recompute; the 03.A1 end-to-end check (QA) is Ana 88.3 → 87.3 with `PUNCTUALITY: 3`.

---

### User Story 4 - The transition dialog offers origin-scoped rejection reasons (Priority: P1)

An operator rejecting a `SCHEDULED` appointment can pick "Inspector didn't attend"; an admin rejecting a `DONE` appointment can pick "Inspection was not actually carried out"; neither code appears from the wrong origin, and each shows a one-line note about the reliability score when chosen.

**Why this priority**: `L-F07-01`/`L-F07-04` — the web surface that lets operations record the two facts the reliability index penalises. Without it the codes exist but are unreachable in the UI.

**Independent Test**: Render `StatusTransitionDialog` for `SCHEDULED → REJECTED` as OP → options include "Inspector didn't attend" and exclude "Inspection was not actually carried out"; selecting it shows "This counts against the inspector's reliability score." and submits `rejectionReasonCode 'INSPECTOR_NO_SHOW'`.

**Acceptance Scenarios**:

1. **Given** `targetStatus === 'REJECTED'`, **When** the dialog builds its options, **Then** it uses `allowedRejectionCodesFrom(currentStatus)` with `reasonCodeLabel` labels: `SCHEDULED` offers `INSPECTOR_NO_SHOW` (not `NOT_EXECUTED`); `DONE` offers `NOT_EXECUTED` (not `INSPECTOR_NO_SHOW`); `DRAFT`/`AWAITING_INSPECTOR`/`REJECTED` offer neither.
2. **Given** `INSPECTOR_NO_SHOW` is selected, **When** it renders, **Then** the hint "This counts against the inspector's reliability score." appears; **given** `NOT_EXECUTED` is selected, the hint "Only this reason counts against the inspector's reliability score." appears.
3. **Given** the server rejects the code with `422 REJECTION_CODE_NOT_ALLOWED`, **When** the submit returns, **Then** the dialog stays open and shows the server message.

---

### User Story 5 - Stale and pending-recompute states are visible (Priority: P2)

When the nightly job has not refreshed the scores, or weights were saved but not yet recomputed, the page and drawer show a warning so operations knows the numbers may be behind.

**Why this priority**: Operability of a silent nightly job (`L-F07-02`, `L-F07-10`). The core read value exists without it, so it is P2.

**Independent Test**: Render with `isStale true`, `snapshotDate '2026-12-01'`, clock `2026-12-02 09:00` Sydney → a warning "Scores haven't been updated since 1 Dec 2026. The nightly job didn't finish; operations has been notified." shows; with the clock at `04:30` the banner is suppressed.

**Acceptance Scenarios**:

1. **Given** `isStale` and the Sydney wall-clock is at or after 05:00, **When** the page or drawer renders, **Then** a warning `role="status"` banner "Scores haven't been updated since {snapshotDate}. The nightly job didn't finish; operations has been notified." shows; before 05:00 it is suppressed; `isStale false` shows nothing.
2. **Given** `settingsUpdatedAt > computedAt` and less than 15 minutes have passed since `settingsUpdatedAt`, **When** the page or drawer renders, **Then** "Weights were changed at {time}. Scores will update within a few minutes." shows; after 15 minutes "Weights were changed at {time} but scores haven't been recalculated yet. Operations has been notified." shows; `computedAt ≥ settingsUpdatedAt` shows nothing.
3. **Given** both conditions hold, **When** rendered, **Then** both banners appear; **and** there is no polling — banners change only on reload or query invalidation.

---

### User Story 6 - Only AM/OP reach the page and the menu item (Priority: P1)

The "Inspector performance" item appears in the Dashboard menu group only for AM and OP, in the canonical X01 order; the route is guarded so CL and INSP cannot open it.

**Why this priority**: `D4` visibility is a hard privacy rule — agencies and inspectors must never see scores or rankings — so the guard is correctness, not polish.

**Independent Test**: In the real `Sidebar.roles.test.tsx`, open the Dashboard flyout as AM and OP → a `menuitem` "Inspector performance" with `href="/inspector-performance"` exists; as CL_ADMIN/CL_USER/INSP it does not; navigating to `/inspector-performance` as CL_ADMIN redirects to `/dashboard` (the shared `AuthGuard` behaviour — redirect + info toast, verified against the real `AuthGuard`, not `NoPermissionState`).

**Acceptance Scenarios**:

1. **Given** AM or OP, **When** the Dashboard flyout opens, **Then** a "Inspector performance" `menuitem` links to `/inspector-performance`, positioned after "Workload" and (when present) before "Goals & rewards", compared by label not index; **given** CL_ADMIN, CL_USER, or INSP, the item is absent (INSP keeps the simple "Dashboard" item).
2. **Given** the current location is `/inspector-performance`, **When** the sidebar renders, **Then** the Dashboard group shows active.
3. **Given** a CL_ADMIN navigates to `/inspector-performance`, **When** the route renders, **Then** the `AuthGuard roles={[AM, OP]}` redirects to `/dashboard` (its shared behaviour: `<Navigate to="/dashboard" replace />` + an info toast); `filterNavItems(NAV_ITEMS, 'OP')` contains the child and `filterNavItems(NAV_ITEMS, 'CL_ADMIN')` does not.

### Edge Cases

- **Very long inspector name**: truncated with a `title` in the table; shown in full in the drawer.
- **Inspector deactivated between snapshot and view**: drops from the ranking (the API filters `ACTIVE` at read time).
- **`?inspector=` with an invalid or unknown id**: the drawer shows "We couldn't find this inspector." and "Close"; a non-uuid id yields the detail endpoint's 400 → the same not-found drawer copy.
- **Weights saved while the page is open**: the list changes only once the job finishes; invalidation refetches and may still return the old snapshot, now with the "Weights were changed at …" banner. No polling.
- **The 04:15 job failed**: yesterday's ranking shows with the stale banner from 05:00; it clears when `ensure-today` reruns and the page reloads.
- **Failure link to a deleted appointment or a deactivated agency**: the existing `/appointments/:id` detail page shows its own not-found state.
- **Dialog open on an appointment whose status changed in another tab**: the server returns `422 REJECTION_CODE_NOT_ALLOWED` and the dialog shows the message without closing.
- **`minimumVolume` on the snapshot differs from the current setting** (changed today before the recompute): the "Not enough data" copy and drawer use the value from the response (what produced that ranking), not the current setting.

## Requirements *(mandatory)*

### Functional Requirements

**Page (03.11)**

- **FR-001**: The route `/inspector-performance` MUST be registered with `Loadable(lazyRetry(() => import(...)))` and guarded by `<AuthGuard roles={[UserRole.AM, UserRole.OP]}>`.
- **FR-002**: `useReliabilityRanking` MUST call `GET /v1/dashboard/inspector-performance` with query key `['reliability','ranking']`, throwing on error (page shows `ErrorState`), and typed solely from `@properfy/shared` (`api-types.ts`) with no `as any`.
- **FR-003**: The page MUST render, by state: `LoadingState` "Loading inspector performance"; `ErrorState` "We couldn't load inspector performance." with "Try again" refetching; `EmptyState` "No scores yet" / "Scores are calculated every night. The first ranking appears after the next run." when `snapshotDate` is null; otherwise the ranking.
- **FR-004**: The ranking MUST use `DataTable` (no pagination; no clickable sort — the order is the server ranking) with columns "Rank" (value `aria-label` "Rank {n}"), "Inspector", "Score" (one decimal + decorative `aria-hidden` bar), "Services" (`hideOnMobile`). Because `DataTable` rows are not natively keyboard-focusable (its a11y model expects a focusable control inside a cell), the row's actionable affordance MUST be a focusable control rendered in the "Inspector" cell with `aria-label` "Open {name} details" (keyboard + screen reader), while `onRowClick` opens the drawer for pointer users. A visually-hidden label "Inspectors ranked by reliability score" MUST name the table region (`DataTable` has no `caption` prop, so the label is rendered by the feature).
- **FR-005**: The "Not enough data" block MUST render only when `notEnoughData` is non-empty, with the text "Inspectors with fewer than {minimumVolume} services in the last 30 days are not ranked." and one line per inspector — "{name} · {volume} of {minimumVolume} services" (`INSUFFICIENT_VOLUME`) or "{name} · No data for the weighted metrics" (`NO_WEIGHTED_DATA`) — each opening the drawer. When `ranked` is empty, the table area reads "No inspector has enough services to be ranked yet.".
- **FR-006**: The `PageHeader` subtitle MUST read "Last 30 days · {windowFrom} – {windowTo} · Updated {computedAt}" where civil dates (`windowFrom`/`windowTo`) render as `D MMM YYYY` (e.g. "1 Nov 2026") via a deterministic feature formatter — a fixed month-abbreviation array, never `toLocaleDateString` defaults (ICU/Node drift; the shared `formatCivilDate` yields `dd/mm/yyyy`, which does not match the required copy), with the range collapsing shared trailing parts to "1 Nov – 30 Nov 2026" — and `computedAt` renders via `formatInstantDateTime(value, PLATFORM_TIMEZONE)` from `@properfy/shared`; a secondary "Configure weights" action links to `/platform-settings#reliability-index`, visible to AM and OP; a fixed `InfoBanner` (`variant="info"`) reads "Only operations staff can see this page. Agencies never see scores or rankings.".

**Drawer (03.12)**

- **FR-007**: Clicking a row or activating its "Open {name} details" control MUST open a `DrawerPanel` (`size 'narrow'`) with `aria-label` "{name} reliability details", set `?inspector=<id>`, and fetch the detail; `DrawerPanel` moves focus into the drawer on open and closes on "Close"/Escape/backdrop; closing MUST remove `?inspector=` and the feature MUST restore focus to the originating row control (`DrawerPanel` does not restore it); a direct load with `?inspector=<id>` opens the drawer with no originating control (nothing to restore).
- **FR-008**: `useInspectorReliability(id)` MUST call `GET /v1/dashboard/inspector-performance/{inspectorId}` with query key `['reliability','inspector', id]`, `enabled` only when `id` is set.
- **FR-009**: The drawer header MUST show the one-decimal score (or "Not enough data" / "No score yet" by status), "Rank {position} of {rankedCount}" (omitted for `INACTIVE`/unranked), "{volume} services · last 30 days", and an "Inactive" badge when `inspectorStatus === 'INACTIVE'`.
- **FR-010**: Eight `MetricRow`s MUST render in `RELIABILITY_METRIC_KEYS` order with the feature's UI labels/descriptions (see Assumptions), a formatted value with a decorative bar whose value is also shown as text (never colour-only), and "Weight {n}" or "Not weighted" with a de-emphasised style for weight 0.
- **FR-011**: Metric value formatting MUST follow: percentage = `Math.round(rate × 100)`; "{successCount} of {eligibleCount} {unit}"; SATISFACTION = "{averageRating to 2 dp} / 5 · {eligibleCount} ratings" or "Not enough ratings · {eligibleCount} of {minimumRatings} needed" when `rate` is null with ratings; VOLUME = "{percentage}% · {completedCount} completed · median {volumeReference}" (override → "reference {volumeReference} (fixed)"; pro-rata `activeDays < windowDays` → "{completedCount} completed in {activeDays} days · median {volumeReference} / 30 days"); a null metric uses its per-metric "No data" text.
- **FR-012**: Each metric (except SATISFACTION and VOLUME) MUST show a `Tooltip` "{weightedSuccess} of {weightedEligible} weighted minutes" on its value; when `failureCount > 0` a "Show {failureCount} issues" button (`aria-expanded`) MUST expand a list of "{serviceDate} · {detail}" rows each with an "Open appointment" link to `/appointments/:id` (same tab), and a "Showing the 20 most recent of {failureCount}" note when `failureCount > 20`; no button when there are no failures.
- **FR-013**: The drawer footer MUST read "Percentages are weighted by service duration and planned travel." and "Scores update every night at 4:15 am."; loading shows a skeleton, error shows "We couldn't load this inspector's metrics." + "Try again", and an unknown id shows "We couldn't find this inspector." + "Close".

**Reliability index settings section (03.A1)**

- **FR-014**: `ReliabilityIndexSection` MUST load `GET /v1/platform-settings/reliabilityIndex` into eleven fields (eight weights, minimum volume, optional override, minimum ratings) and be embedded in `PlatformSettingsPage.tsx` with anchor `id="reliability-index"`, visible and editable for AM and OP (`L-F07-11`).
- **FR-015**: Client validation MUST block invalid saves with the exact messages: weight out of 0–10 → "Enter a whole number from 0 to 10"; all weights 0 → "Set at least one weight above 0"; minimum volume out of 1–200 → "Enter a whole number from 1 to 200"; override out of 1–1000 → "Enter a whole number from 1 to 1000, or leave it empty" (empty sent as `null`); minimum ratings out of 1–50 → "Enter a whole number from 1 to 50".
- **FR-016**: Saving MUST `PUT` the full object; on 200 show the snackbar "Reliability settings saved. Scores are being recalculated." and invalidate `['reliability']`; on 422/400 map the server `details` to fields or show "We couldn't save these settings. Try again."; "Save" is disabled with no change and while submitting.

**Status transition dialog (L-F07-01, L-F07-04)**

- **FR-017**: `StatusTransitionDialog` MUST, for `targetStatus === 'REJECTED'`, build its reason options from `allowedRejectionCodesFrom(currentStatus)` with `reasonCodeLabel` labels (replacing the fixed `REJECTION_OPTIONS`), continuing to honour the F03 `SYSTEM_ONLY_REJECTION_CODES` filter.
- **FR-018**: Selecting `INSPECTOR_NO_SHOW` MUST show "This counts against the inspector's reliability score."; selecting `NOT_EXECUTED` MUST show "Only this reason counts against the inspector's reliability score."; a `422 REJECTION_CODE_NOT_ALLOWED` server response MUST keep the dialog open and show the server message.

**Navigation & freshness**

- **FR-019**: `Sidebar.tsx` MUST add a Dashboard submenu child `{ icon: 'mdi-podium', label: 'Inspector performance', to: '/inspector-performance', roles: [AM, OP] }` after "Workload" and before "Goals & rewards" (canonical X01 order, compared by label); the page is a first-level Dashboard child with no `BackButton`/`backTo` (`R5`).
- **FR-020**: A shared `FreshnessBanners` component MUST render, above the content on both the page and the drawer: the stale banner (`isStale` and Sydney wall-clock ≥ 05:00) and the recompute banner (`settingsUpdatedAt > computedAt`, with the <15 min vs ≥15 min variants), both as `role="status"` warnings, with no polling.

**Accessibility & quality**

- **FR-021**: The page MUST meet WCAG 2.1 AA: a keyboard-actionable control in each ranking row, visible focus, the drawer moving focus in on open and restoring it to the trigger on close (`DrawerPanel` + feature-owned restore) with an `aria-label`, `aria-hidden` bars with text values beside them, de-emphasised ("Not weighted") text conveyed by text not colour alone and contrast ≥ 4.5:1, and settings fields with `<label>` and errors tied by `aria-describedby`.
- **FR-022**: The change MUST add no `tenant_id`-bearing entity, no backend route, no schema/migration, and no `api-types.ts` regeneration; all types come from `@properfy/shared`; web lint stays at zero warnings.
- **FR-023**: `apps/web/CLAUDE.md` MUST be updated in this PR to document the new page in the Dashboard group, the `?inspector=` deep link, and the "Reliability index" settings section.

### Key Entities *(consumed, not created)*

- **ReliabilityRankingResponse** — `snapshotDate`, `windowFrom`, `windowTo`, `computedAt` (all nullable), `isStale`, `settingsUpdatedAt`, `minimumVolume`, `volumeReference`, `volumeReferenceSource`, `ranked[]` (`position`, `inspectorId`, `inspectorName`, `score`, `volume`, `completedCount`), `notEnoughData[]` (`inspectorId`, `inspectorName`, `volume`, `status`).
- **InspectorReliabilityResponse** — inspector identity + `inspectorStatus`, `status` (SCORED/INSUFFICIENT_VOLUME/NO_WEIGHTED_DATA/NOT_COMPUTED), snapshot metadata, `score`, `position`, `rankedCount`, `volume`, `completedCount`, `minimumVolume`, `minimumRatings`, `volumeReference`, `volumeReferenceSource`, and `metrics[]` (each `ReliabilityMetricResult` extended with `weight`).
- **reliabilityIndex platform setting** — eight weights (0–10), `minimumVolume` (1–200), `volumeReferenceOverride` (null or 1–1000), `minimumRatings` (1–50).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (03.11)**: With the worked-example fixture, an AM/OP user sees the 30-day ranking (rank, name, one-decimal score, services) in server order, plus the "Not enough data" block, with no console error.
- **SC-002 (03.12)**: Opening any ranked inspector shows the eight metrics in canonical order with values, weights, weighted-minutes tooltips, and expandable failure lists linking to `/appointments/:id`; the drawer is reachable by click, keyboard, and deep link.
- **SC-003 (03.A1)**: Saving the `reliabilityIndex` weights `PUT`s the full object and confirms the recalculation; a browser QA against a local backend shows Ana's score change from 88.3 to 87.3 after setting `PUNCTUALITY: 3` and the nightly job runs.
- **SC-004 (privacy / D4)**: Only AM and OP see the menu item and can open the route; CL_ADMIN, CL_USER, and INSP cannot (menu absent, route → redirect to `/dashboard` via the shared `AuthGuard`).
- **SC-005 (operability)**: Stale and pending-recompute states appear as non-blocking warnings under the documented clock conditions; the ranking stays visible.
- **SC-006 (reason codes)**: The transition dialog offers `INSPECTOR_NO_SHOW` only from `SCHEDULED` and `NOT_EXECUTED` only from `DONE`, each with its reliability note, and surfaces a `422 REJECTION_CODE_NOT_ALLOWED` without closing.
- **SC-007 (PR hygiene)**: `pnpm --filter web typecheck lint test` pass; `git diff --stat origin/develop... | tail -1` is under 150 files; no `api-types.ts` / schema / migration change.

## Assumptions

- **Premise — UI metric copy lives in the web feature.** The shared `RELIABILITY_METRIC_LABELS`/`DESCRIPTIONS` shipped by F07-1 are terse (e.g. `GEOFENCE → "Geofence"`, `NO_STUCK → "Completion"`, `VOLUME → "Volume"`, `DONE_REJECTED → "Valid completion"`), while the TASK-F07-3 UI table and drawer tests require richer copy ("On-site check-ins", "Finished within 6 hours", "Tenant satisfaction", "Completed volume", "Accepted work", "Late notice given"). The shared enum's own comment states "TASK-F07-3 finalises the exact UI copy." Therefore this feature defines its display labels, descriptions, "No data" texts, and per-metric units locally (e.g. `lib/format-metric.ts`), matching the TASK-F07-3 UI table verbatim, **without** mutating the shared enum (which F08 also consumes). The shared enum remains the canonical key list and order.
- **Premise — consumer-only contract.** All routes, schemas, and the `reliabilityIndex` key are already on `develop` (F07-1/F07-2); this feature regenerates no `api-types.ts` and touches no backend. If a fixture fails `schema.parse`, the fixture is wrong, not the contract.
- **Multi-tenant exception (root `CLAUDE.md` §7.1).** This feature creates no entity, but the data it renders (reliability snapshots) is platform-scoped and has **no `tenant_id`** because inspectors are cross-tenant; isolation is by RBAC — only AM/OP read the page/routes, and CL_ADMIN/CL_USER/INSP are denied before any read (enforced in F07-2 and re-asserted here by the `AuthGuard` and the menu `roles`).
- **Display timezone (R3/N13).** Civil dates (`snapshotDate`, `serviceDate`, `windowFrom`/`windowTo`) are rendered without any timezone conversion — as `D MMM YYYY` by the feature's deterministic formatter for the subtitle/banner copy, or `dd/mm/yyyy` via the shared `formatCivilDate` where that format is acceptable (e.g. failure rows). Instants (`computedAt`, `settingsUpdatedAt`) render with `formatInstantDateTime(value, PLATFORM_TIMEZONE)` imported from `@properfy/shared` (the web `@/lib/format-date` wrapper defaults to the user's timezone, which must not be used here); `users.timezone` is never used in a rule.
- **No open product decision applies.** The pending decisions Q2/Q4/Q6/Q12 belong to F02/F03/F06/F08; all F07 decisions (D1–D12, P1–P11, L1–L12, R1–R7) are closed in `fase2-etapa1/tarefas/F07-tarefas.md`. The "Level" column is out of scope (F08 web).
- **Testing environment.** Web tests use RTL + `createMemoryRouter`; `localStorage` is avoided (unreliable in jsdom); `findBy` is used carefully around state transitions; a controllable clock is injected for the freshness banners; tests that depend on Sydney wall-clock pin `TZ` away from Sydney.
