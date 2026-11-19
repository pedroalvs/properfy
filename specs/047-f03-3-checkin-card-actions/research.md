# Research — PWA field-event actions (TASK-F03-3)

Phase 0. All NEEDS CLARIFICATION from the spec were resolved by reading the merged F03-1/F03-2 contracts on `develop` @ 75166fe6. No open questions remain.

## R1. Are the consumed contracts actually merged and shaped as the spec assumes?

**Decision**: Yes — consume them as-is; no backend change.
**Evidence** (worktree branched from `origin/develop` @ 75166fe6, which includes PR #1325 F03-2 and the F03-1 PR):
- `packages/shared/src/schemas/responses.ts:596` — inspector appointment detail has `geofence: { radiusMeters: number, mode: GeofenceMode }` **optional**.
- `packages/shared/src/schemas/responses.ts:983` — `startInspectionResponseSchema` carries the geofence block (`mode`, `effectiveMode`, `radiusMeters`, `fallbackReason`).
- `packages/shared/src/schemas/responses.ts:608` — detail has `lastFieldIssue: inspectorLastFieldIssueSchema.nullable().optional()`.
- `packages/shared/src/api-types.ts:10140` — generated `lastFieldIssue?` present (contract regenerated & committed).
- Routes `apps/backend/src/modules/inspector-execution/interfaces/inspector-execution.routes.ts:210,236` — `POST /v1/inspector/appointments/:appointmentId/cant-do` and `.../late-notice`.
**How the PWA consumes it**: the inspector detail is **not** read from the generated `api-types` directly — the PWA has an established pattern of a hand-written `InspectorAppointmentDetailResponse` type (`features/schedule/types/index.ts`) mapped by `mapInspectorAppointmentDetail` (`features/schedule/lib/adapters.ts`). The new fields are added to that type + adapter, with shapes mirroring the committed shared schemas. This is the existing convention, not contract drift (the server contract is unchanged).
**Alternatives considered**: Switching the detail to import `api-types` directly — rejected (a larger, out-of-scope refactor of the adapter layer; the task only needs to surface two new fields through the existing pattern).

## R2. Shared enums/labels for the two sheets

**Decision**: Use the shared `field-events` enums verbatim; do not redefine labels in the PWA.
**Evidence** (`packages/shared/src/enums/field-events.ts`):
- `FieldIssueReason` = 6 keys: `NO_ANSWER, KEY_FAILED, TENANT_REFUSED, UNSAFE, SITE_ISSUE, CANT_ATTEND`; `FIELD_ISSUE_REASON_LABELS` provides English labels; `FIELD_ISSUE_NOTE_REQUIRED_REASONS = ['SITE_ISSUE']`.
- `LateNoticeReason` = 4 keys: `TRAFFIC, PREVIOUS_JOB_OVERRAN, PERSONAL, OTHER`; `LATE_NOTICE_REASON_LABELS`; `LATE_NOTICE_MINUTES_OPTIONS = [10, 20, 30, 45, 60, 90]`.
**Rationale**: Single source of truth; matches the spec's "6 reasons / 4 reasons / these chips" exactly.

## R3. Request/response shapes for cant-do and late-notice

**Decision**: Build request bodies and read responses straight from the shared schemas.
**Evidence** (`packages/shared/src/schemas/field-events.ts`):
- `cantDoRequestSchema`: `{ reason: FieldIssueReason, note?: string(≤500), latitude?, longitude?, accuracy?, clientOccurredAt? }`; note **required** when reason ∈ `FIELD_ISSUE_NOTE_REQUIRED_REASONS`; lat/lng must be sent together.
- `cantDoResponseSchema`: `{ eventId, appointmentId, appointmentStatus: 'REJECTED', occurredAt, executionAbandoned }`.
- `lateNoticeRequestSchema`: `{ reason: LateNoticeReason, minutesLate: int 5–240, latitude?, longitude?, accuracy?, clientOccurredAt? }`.
- `lateNoticeResponseSchema`: `{ eventId, appointmentId, occurredAt, reason, minutesLate, referenceAt, referenceSource: 'PUBLISHED_PLAN' | 'WINDOW_START', estimatedArrivalAt }`.
**Consequence for the snackbar**: Use the server's `estimatedArrivalAt` (formatted to HH:mm in the agency/effective TZ) and `minutesLate` — do not recompute client-side. The minutes chips cap at 90, well within the server's 5–240 bound.

## R4. Geofence default radius and FLAG/BLOCK handling in the app

**Decision**: `GeoLocationCapture` warns only; never pre-blocks; default radius from the shared registry; BLOCK is server-enforced.
**Evidence**: `GeofenceMode` enum = `FLAG | BLOCK` (`enums/field-events.ts`); the start response exposes `effectiveMode`/`fallbackReason`, meaning the server already decided FLAG vs BLOCK and any fallback. The spec default = `PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults.geofenceRadiusMeters` (300). The current `GeoLocationCapture.tsx` hard-codes `DISTANCE_WARNING_THRESHOLD = 200` (`:12`) — to be removed.
**Rationale**: The 200 m (PWA) vs 500 m (old backend) split is the exact inconsistency F03 removes; the single server radius now rules. A client-side BLOCK pre-check would duplicate server logic and could diverge (clock/coords), so it is explicitly out.

## R5. Permanent vs transient queued-START failure classification (D21/L-F03-02)

**Decision**: `isPermanentQueueError(err)` ⇒ HTTP 4xx except `401/408/429`; a `422 GEOFENCE_OUT_OF_RADIUS` is permanent on the **first** response (no 3-attempt retry). On a permanent START failure: mark the item FAILED, remove the chained FINISH for the same `appointmentId`, `clearExecutionState(appointmentId)`, `refreshQueueSnapshot()`, invalidate `['inspector','schedule']`, and `showError` with the server message (append " Check in again when you're at the property." for geofence). 5xx/network → keep PENDING + `retryCount+1`; 401 → clear nothing (logout flow). FINISH permanent failure keeps today's behaviour.
**Rationale**: Five readers (`start`, `finish`, schedule, stuck worker, portal) treat an open execution as IN_PROGRESS; a permanently-rejected offline check-in would otherwise strand the job forever on "Check out".
**Alternatives considered**: Retrying 422 three times (current generic path) — rejected: a geofence/assignment rejection is deterministic; retrying wastes time and keeps the card stuck.

## R6. Why extract `useExecutionActions` and restructure the card

**Decision**: Extract the check-in / check-out-request (SYNC → PAST_TIME steps) / submit / retry logic out of `ExecutionPage` into `useExecutionActions(appointmentId)`; both the card and `ExecutionPage` use it. Restructure `AppointmentCard` from one `<button>` into `<article aria-labelledby>` with a navigation target + an action bar.
**Rationale**: (a) Button-in-button is invalid DOM and breaks screen readers; (b) the card and `ExecutionPage` must write the **same** `ExecutionState` — two independent writers is a correctness hazard the extraction removes. Documented as the task's `+0.25` card-restructure cost.
**Alternatives considered**: Keep the single-button card and open a modal — rejected: still can't host nested action buttons cleanly and duplicates execution state writes.

## R7. Timezone and "today" rule

**Decision**: Every date/"today" comparison uses `useEffectiveTimezone()` (inspector/platform TZ), never the device timezone, matching the existing `getGateState`. TZ-dependent Vitest tests pin `TZ` away from Sydney (`feedback_tz_dependent_test_must_pin_away`).
**Rationale**: Consistency with the rest of the PWA and the platform date rules (CLAUDE.md §9).

## R8. Testing gate

**Decision**: Vitest (RTL) is the gate; no Playwright spec added (A-D18, `project_pwa_e2e_suite_broken_vacuous`; X03 recovered the harness but this task adds no new E2E). Manual QA checklist Q1–Q11 on iOS sim + Android with the backend local. Gate commands: `pnpm --filter @properfy/shared build` then `pnpm --filter pwa typecheck && lint && test && check:ds && build`.
