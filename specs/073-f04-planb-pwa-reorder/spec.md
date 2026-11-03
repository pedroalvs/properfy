# Feature Specification: F04 Plan B PR-B — PWA reorder via server preview

**Feature Branch**: `073-f04-planb-pwa-reorder`
**Created**: 2026-11-03
**Status**: Draft
**Input**: User description: "F04 Plan B PWA reorder via server preview"

## Context

Mapbox's Terms of Service forbid persisting Matrix/Directions results. The F04 route
engine is migrating off any stored routing data in a strict A → B → C rollout
(L-F04-03, resolved as Plan B on 2026-11-02):

- **PR-A (merged, `develop` @ `71b862d2`, the Pillar track):** the backend stopped
  persisting routing results and now recomputes `geometry` and `routingInput` on demand
  into the same response fields (non-breaking). It added
  `POST /v1/inspector/day-plans/:date/order/preview` — a strictly read-only endpoint
  that recomputes the travel **matrix** on demand, evaluates a candidate stop order over
  it, and returns ETAs/violations with `etaSource: 'MATRIX'`; it persists nothing and is
  rate-limited to 30/min per inspector. `routingInput` and `dayPlanRoutingInputSchema`
  remain in the contract until PR-C.
- **PR-B (this task, the PWA track):** the PWA's route **reorder** stops reading
  `plan.routingInput` and stops recomputing the order locally. It calls the PR-A preview
  endpoint instead, so the raw matrix never has to reach the client.
- **PR-C (later, the Pillar track):** removes `routingInput` from the contract and drops
  the nullable routing columns. **Out of scope here.**

This task is **PWA-only**. It must not change the shared contract (`packages/shared`),
the backend, or `api-types.ts`. The route **map** keeps reading `plan.geometry` and is
not touched. The only shared/root edits are the one-line CLAUDE.md updates.

**Multi-tenant scope.** `DayPlan`/`DayPlanStop` are platform-scoped (no `tenant_id`, D10
exception to CLAUDE.md §7.1) because the inspector is cross-tenant. The preview endpoint
is INSP-only and is always scoped to the caller's own `inspectorId` server-side; the PWA
sends no tenant predicate and cannot address another inspector's plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reorder with server-computed times (Priority: P1)

An inspector opens today's Route, drags a stop (or uses the up/down arrows) to a new
position, and sees the finish time, the difference versus the suggested order, the
driving total and any window warnings update — all computed by the server over an
on-demand matrix, with no raw matrix ever sent to the device.

**Why this priority**: This is the whole point of PR-B. Without it the reorder screen
either keeps reading the forbidden raw matrix (ToS violation) or shows nothing.

**Independent Test**: With the preview endpoint stubbed, reorder a stop and assert the
summary shows the server's finish/delta/driving and the per-stop ETAs come from the
preview response, with no dependence on `plan.routingInput`.

**Acceptance Scenarios**:

1. **Given** a published plan with ≥ 2 not-started stops, **When** the inspector moves a
   stop, **Then** after a 400 ms debounce the app calls
   `POST /v1/inspector/day-plans/:date/order/preview` with the new reorderable order and
   `basedOnVersion = plan.version`, and the summary renders the returned `finishEta`
   (prefixed "~"), the "+N min vs. suggested" delta, and `totals.driveS` as driving.
2. **Given** a preview response with `violations`, **When** it resolves, **Then** each
   violated stop shows "Stop {n} would arrive after its window {range}" (n = position in
   the full displayed order), and **Save stays enabled** (DB3).
3. **Given** the inspector keeps dragging quickly, **When** several moves happen inside
   400 ms, **Then** only the latest order is previewed (earlier in-flight requests are
   superseded, never rendered out of order).
4. **Given** the preview is in flight, **When** the inspector reads the summary, **Then**
   a non-blocking "Updating route times…" state shows and the stale numbers are not
   presented as final.

---

### User Story 2 - Save the reordered route (Priority: P1)

The inspector saves the new order; the server writes it as the manual order and returns
the final Directions ETAs.

**Why this priority**: Saving is unchanged by Plan B and must not regress; a preview that
cannot be saved is useless.

**Independent Test**: Stub `PUT …/order` 200 and assert the save flow, snackbar and cache
update behave exactly as before PR-B.

**Acceptance Scenarios**:

1. **Given** a dirty draft, **When** the inspector taps "Save order", **Then** the app
   sends `PUT /v1/inspector/day-plans/:date/order` with `{ appointmentIds, basedOnVersion }`
   (reorderable ids only), replaces the cache with the response, clears the draft and
   shows "Route saved. Finish {hh:mm}." — identical to current behaviour.
2. **Given** a 409 `DAY_PLAN_VERSION_CONFLICT` / `DAY_PLAN_STALE`, a 422
   `DAY_PLAN_ORDER_MISMATCH` / `DAY_PLAN_DATE_IN_PAST` / `DAY_PLAN_ALREADY_STARTED`, a 429
   or a network error on save, **When** it returns, **Then** the same alerts and cache
   refetch as today occur. Save is not changed by this task.

---

### User Story 3 - Preview unavailable, degrade gracefully (Priority: P2)

When the preview cannot run — offline, rate-limited, a provider error, or the server
rejects it because the day has already started — the reorder controls still work and the
app degrades honestly instead of showing wrong numbers.

**Why this priority**: The preview is a network call now; it can fail in ways the old
synchronous local recompute never could. Honest degradation protects correctness.

**Independent Test**: Stub the preview with 429 / network error / 422
`DAY_PLAN_ALREADY_STARTED` and assert the controls stay usable, no stale/guessed numbers
are shown as final, and Save follows its existing offline/enabled rules.

**Acceptance Scenarios**:

1. **Given** the device is offline, **When** the inspector reorders, **Then** the order
   still changes locally, the times/delta show an "unavailable offline" state (no guessed
   numbers), and Save is disabled with "Connect to save your order." (unchanged).
2. **Given** the preview returns 429, **When** it fails, **Then** the app keeps the last
   good preview if the order is unchanged, otherwise shows "Route times are updating…
   try again in a moment" and never blocks the controls.
3. **Given** the preview returns 422 `DAY_PLAN_ALREADY_STARTED` (the day started and the
   server will not preview), **When** it fails, **Then** the app shows the live times are
   unavailable for a started day and does not present a delta; the list stays usable and
   Save still follows its normal rules (PUT may still accept a tail reorder). See
   Assumptions for the premise and the flagged preview/save asymmetry.

---

### Edge Cases

- **Order equals the suggested order**: the delta is 0 ("Same finish time as suggested")
  without a second preview call for the suggested order.
- **Saved manual order, not dirty**: the summary still shows the delta versus suggested
  (the cost of the saved order) — computed from a preview of the saved order and a
  preview of the suggested order, both MATRIX, so the comparison uses one source.
- **A stop leaves the reorderable set mid-edit** (check-in on this device / another
  device / OP, or CANT_DO): handled entirely by the existing `useReorderDraft` drift
  rules (SET_DISCARDED / frozen / STALE). The preview is keyed on the live order, so it
  re-runs for the new set; a superseded in-flight preview is ignored.
- **Plan after next-day purge / no routing** (`routingInput` null and `geometry` null):
  `canReorder` is false; no preview is attempted. (After PR-B, `canReorder` no longer
  depends on `routingInput` — see FR-012.)
- **Rapid version bump while a preview is in flight**: the result is discarded unless it
  matches the current `(version, order)`.
- **Timezone**: per-stop ETAs from the preview are formatted in each stop's timezone with
  "~" (approximate, MATRIX), exactly as the local recompute rendered them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The route reorder MUST obtain finish time, "+N min vs. suggested" delta,
  driving total, per-stop ETAs and window violations from
  `POST /v1/inspector/day-plans/:date/order/preview`, not from a local recompute.
- **FR-002**: The PWA MUST stop reading `plan.routingInput` and MUST stop calling
  `toOptimizerInput` / `buildLegOverrides` / `evaluateSequence` for the reorder. The
  local `evaluateDraft` path and its `routingInput`-based helpers are removed from the
  reorder flow.
- **FR-003**: Preview calls for the actively-edited draft order MUST be debounced 400 ms
  on the client; only the latest order is rendered (no out-of-order results).
- **FR-004**: The preview request body MUST be `{ appointmentIds: <reorderable ids in the
  draft order>, basedOnVersion: plan.version }` and MUST include only reorderable ids,
  matching the server's live reorderable set.
- **FR-005**: The "+N min vs. suggested" delta MUST compare the draft order's finish
  against the aligned suggested order's finish, both from the preview endpoint (same
  MATRIX source). The suggested-order preview MUST be cached per `plan.version` so a move
  costs at most one additional (debounced) preview call. When the draft order equals the
  aligned suggested order, the delta is 0 with no extra call.
- **FR-006**: Window violations MUST come from the preview response and MUST render as
  "Stop {n} would arrive after its window {range}" with `n` = the stop's 1-based position
  in the full displayed order (locked prefix + reorderable draft). Violations MUST never
  block Save (DB3).
- **FR-007**: The save flow (`PUT …/order`), its optimistic-version handling, conflict /
  STALE / mismatch / past / already-started / rate-limit / network branches, the reset
  flow (`POST …/recalculate`), and the unsaved-changes prompt MUST be unchanged.
- **FR-008**: The route **map** MUST keep reading `plan.geometry`; `RouteMapView` and the
  map hooks/libs MUST NOT change behaviour. *(Invariant — verified by the T018 grep gate and the
  PWA-only scope, not by a positive implementation task.)*
- **FR-009**: While a preview is in flight, the UI MUST show a non-blocking updating
  state and MUST NOT present stale numbers as final.
- **FR-010**: When the preview cannot run (offline, 429, provider error, or 422
  `DAY_PLAN_ALREADY_STARTED`), the reorder controls MUST stay usable, no guessed numbers
  MUST be shown as final, and Save MUST follow its existing enable/disable rules.
- **FR-011**: Screen-reader announcements MUST announce the new position immediately on a
  move, and MUST announce the finish/delta when the preview resolves (a second polite
  update), since those numbers are no longer known synchronously.
- **FR-012**: `canReorder` MUST be derived from the live reorderable set (≥ 2 not-started
  stops) and MUST NOT depend on `plan.routingInput`. Stops without coordinates still
  count toward the set (they are reorderable; the preview omits their travel), preserving
  current behaviour.
- **FR-013**: The PWA E2E `BASELINE_STUBS` MUST stub the new preview endpoint if any
  E2E spec navigates through the reorder screen, so the hermetic suite stays green.
- **FR-014**: The bundle budget MUST be re-measured: removing the `route-planning`
  subpath import from the reorder path should not grow the entry chunk; record the before
  /after gzip sizes in the PR (the subpath export created for PR #1334 may become unused
  — if so it is left in place for the map/other consumers unless proven dead).

### Key Entities *(include if feature involves data)*

- **PreviewDayPlanOrderResponse** (existing shared type, unchanged): `etaSource`
  ('MATRIX'), `approximate`, `approximateReason`, `departureAt`, `finishEta`, `totals`
  (`driveS`, `waitS`, `serviceS`, `lateS`, `distanceM`), `feasible`, `violations`
  (`appointmentId`, `lateS`), `stops` (`appointmentId`, `sequence`, `eta`, `travelS`,
  `waitS`, `lateS`).
- **PreviewDayPlanOrderRequest** (existing, = `SaveDayPlanOrderRequest`):
  `appointmentIds`, `basedOnVersion`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The PWA reorder flow makes zero reads of `plan.routingInput` and zero calls
  to `evaluateSequence` / `toOptimizerInput` / `buildLegOverrides` (grep-verifiable in
  `apps/pwa/src/features/day-plan`).
- **SC-002**: Reordering a stop results in exactly one preview request for the new order
  after the 400 ms debounce (plus at most one cached suggested-order request per version).
- **SC-003**: All existing day-plan PWA tests pass after being adapted to the async
  preview, and new tests cover the debounce, superseded-result, degraded (offline / 429 /
  already-started) and delta-vs-suggested paths.
- **SC-004**: `pnpm --filter @properfy/shared build && pnpm --filter pwa lint && pnpm
  --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm
  --filter pwa check:ds` are green; PWA E2E (Chromium + WebKit) green; ≤ 150 files.

## Contract acceptance codes (verbatim)

- **01.A2**: reordering (drag or arrows) recalculates immediately, and shows the finish
  difference ("+N min vs. suggested") and the driving total; saving writes `manual` and
  returns the final times. *(After Plan B the recompute is a server preview, not local;
  the observable behaviour is unchanged except the ETAs are MATRIX "~" until Save returns
  Directions times.)*
- **DB3**: a window overflow shows "Stop n would arrive after its window …" and never
  blocks Save.

## Assumptions / Premises

- **P1 (delta source, resolves the single-order gap in L-F04-03's plan note):** The plan
  note says the preview yields "+N min vs. suggested", but the shipped endpoint evaluates
  one order and returns no delta. Premise (plan's recommendation — keep the exact same
  comparison the local recompute made): compute the delta client-side from two preview
  evaluations (draft order and aligned suggested order), both MATRIX, the suggested one
  cached per `plan.version`. No contract change.
- **P2 (started-day asymmetry, flagged to the coordinator):** PR-A's preview rejects with
  422 `DAY_PLAN_ALREADY_STARTED` once any stop is executed on *today*, but `PUT …/order`
  still accepts a not-started-tail reorder. The old local recompute had no gap. Premise
  (minimal divergence, no backend change): keep the tail reorder controls and Save
  working; when the preview 422s, show that live times are unavailable for a started day
  and hide the delta. The preview/save asymmetry is reported to the coordinator as a
  cross-PR issue (the Pillar owns the backend); it is not fixed here.
- **P3 (bundle):** removing the reorder's `route-planning` import is expected to shrink or
  not grow the entry chunk; the subpath export added in PR #1334 is left in place if any
  other consumer still needs it, and only removed if proven dead.
- Timezone handling and the civil-date / instant split are unchanged (D14); tests that
  depend on timezone pin `TZ` away from Sydney.
- The device-local execution state (F03 IndexedDB) continues to drive "started on this
  device", unchanged.
