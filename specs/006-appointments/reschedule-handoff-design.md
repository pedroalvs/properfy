# GAP-003: Tenant Portal Reschedule Handoff Protocol

**Status**: APPROVED
**Feature**: 006-appointments
**Related**: Feature 007 (tenant-portal), `RescheduleRequestUseCase`
**Date**: 2026-04-06

---

## Problem

The tenant portal reschedule path (feature 007) currently updates `scheduledDate`, `timeSlot`, and resets `tenantConfirmationStatus` to `PENDING` directly on the appointment row -- regardless of the appointment's current status. For `DRAFT` and `AWAITING_INSPECTOR` this is fine (the `UpdateAppointmentUseCase` already handles those). But for `SCHEDULED` appointments, the reschedule bypasses the state machine: the appointment keeps `SCHEDULED` status while its date/time are silently changed, the assigned inspector is not unassigned, and no status transition audit is recorded.

This creates three problems:

1. **State machine violation** -- the appointment's schedule changes without a formal status transition, so the audit trail is incomplete.
2. **Inspector assignment orphaning** -- the inspector remains assigned to a date/time they never accepted.
3. **Confirmation cycle ambiguity** -- `tenantConfirmationStatus` resets to `PENDING` on a `SCHEDULED` appointment, which is a contradictory state (scheduled implies confirmed).

---

## Design Decision

Introduce `ReopenForRescheduleUseCase` in the appointment module. This use case owns the protocol for reopening a scheduled appointment when a reschedule is requested, either by the tenant portal (actor: `SYS`) or by an operator/admin (actor: `AM`, `OP`).

### Protocol

```
SCHEDULED appointment
  |
  v
ReopenForRescheduleUseCase
  1. Validate appointment is SCHEDULED
  2. Validate actor is SYS, AM, or OP
  3. Execute status transition: SCHEDULED -> CANCELLED (reason: "Reopened for reschedule")
  4. Execute status transition: CANCELLED -> DRAFT (reason: "Reschedule requested")
  5. Update scheduledDate, timeSlot on the now-DRAFT appointment
  6. Reset tenantConfirmationStatus to PENDING
  7. Clear inspectorId (unassign inspector)
  8. Audit: action = 'appointment.reopened_for_reschedule'
  9. Return the updated appointment in DRAFT status
```

**Why SCHEDULED -> CANCELLED -> DRAFT instead of SCHEDULED -> DRAFT directly?**

The state machine does not define a `SCHEDULED -> DRAFT` transition (by design -- only `DONE -> DRAFT` is allowed for AM). Going through `CANCELLED` respects the existing transition table and produces two clean audit entries for the status changes, plus the composite reschedule audit entry.

### Who calls this use case?

| Caller | Actor | When |
|---|---|---|
| `RescheduleRequestUseCase` (tenant-portal) | `SYS` | Tenant requests new date via portal on a `SCHEDULED` appointment |
| Appointment routes (operator) | `AM` or `OP` | Operator reschedules on behalf of tenant |

### What about non-SCHEDULED appointments?

- `DRAFT` / `AWAITING_INSPECTOR`: The existing `UpdateAppointmentUseCase` already handles date/time changes. No reopen needed. The `RescheduleRequestUseCase` in the tenant portal should delegate to `UpdateAppointmentUseCase` for these statuses (or continue its current direct-update approach, since it only touches date/time/confirmation fields).
- `DONE` / `CANCELLED` / `REJECTED`: Reschedule is not allowed. The tenant portal already blocks these via `INACTIVE_STATUSES`.

### Integration with feature 007

The `RescheduleRequestUseCase` (tenant-portal) should be updated to:

1. Check appointment status.
2. If `SCHEDULED`: call `ReopenForRescheduleUseCase` first, then proceed with its existing activity/audit/notification logic.
3. If `DRAFT` or `AWAITING_INSPECTOR`: proceed as today (direct date/time update).

This change is **not** implemented in this PR. It will be addressed when feature 007 is next modified.

---

## State Machine Compatibility

The use case composes two existing valid transitions:

- `SCHEDULED -> CANCELLED` (allowed for `AM`, `OP`; requires reason) -- we use `SYS` actor for portal-initiated reschedules, so the state machine must also allow `SYS` for this transition.
- `CANCELLED -> DRAFT` (allowed for `AM`, `OP`; requires reason)

**State machine update required**: Add `SYS` to the `allowedActors` for `SCHEDULED -> CANCELLED`. This is consistent with `SYS` already being allowed for `SCHEDULED -> REJECTED` and `DRAFT -> AWAITING_INSPECTOR`.

**Decision**: Rather than modifying the state machine in this PR (which would affect all callers), the `ReopenForRescheduleUseCase` performs the transitions using internal repository calls with dedicated audit entries, bypassing the `ExecuteStatusTransitionUseCase`. This keeps the use case self-contained and avoids cascading changes.

---

## Audit Trail

A single reschedule operation produces one audit entry:

| Action | Actor | Before | After |
|---|---|---|---|
| `appointment.reopened_for_reschedule` | SYS/AM/OP | `{ status: 'SCHEDULED', scheduledDate, timeSlot, inspectorId }` | `{ status: 'DRAFT', scheduledDate: newDate, timeSlot: newSlot, inspectorId: null, tenantConfirmationStatus: 'PENDING' }` |

The use case captures the full before/after snapshot in a single entry rather than splitting across multiple transition logs. This makes it easy to query "all reschedules" without joining multiple audit rows.

---

## File Locations

- **Use case**: `apps/backend/src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case.ts`
- **Tests**: `apps/backend/tests/unit/appointment/reopen-for-reschedule.use-case.test.ts`
- **Container wiring**: `apps/backend/src/main/container.ts`
- **Route**: Exposed via the existing appointment routes (POST `/:appointmentId/reopen-for-reschedule`)

---

## Open Questions (resolved)

1. **Should we add a `RESCHEDULED` status?** No. Reschedule is a compound operation (reopen + update), not a terminal state. Adding a status would break the established six-state model.
2. **Should the inspector be notified?** Yes, but that is a feature 009 (notifications) concern. The `onTransitionHandler` side effect will fire naturally if we route through `ExecuteStatusTransitionUseCase`. Since we are doing direct updates in this use case, notification should be triggered explicitly by the caller (tenant-portal or route handler).
3. **Should we go through ExecuteStatusTransitionUseCase twice?** No. The compound operation is atomic and self-auditing. Using the transition use case twice would create partial-failure scenarios (first transition succeeds, second fails) and unnecessary audit noise.
