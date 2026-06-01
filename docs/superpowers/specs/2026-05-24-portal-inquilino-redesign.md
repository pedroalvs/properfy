# Design Spec: Portal Inquilino — Redesign Completo (v2)

**Date**: 2026-05-24
**Branch**: `patch/portal-inquilino`
**Status**: v2 — incorporates human decisions on 3 BLOCKERs + 7 MAJORs from `critica-spec-2` (Crítico round 1/2). Ready for round 2/2.
**Replaces**: `specs/007-tenant-portal/spec.md` — frontend layer ONLY. Backend US3 (confirm), US4 (reschedule), US5 (contact), US6 (unavailable) all remain intact. Reschedule (US4) **continues to coexist** as a secondary CTA.
**Preserves**: All existing backend use-cases (confirm, reschedule, unavailable, contact, token, activities). The frontend is fully replaced (UI shell + components); backend receives targeted additions (new endpoints, schema fields, enum value).

---

## 0. v2 — Changes vs v1 (summary)

This v2 reformulation incorporates the human's product decisions (recorded in `historico-5`) for the 3 BLOCKERs the Crítico raised in round 1/2, plus answers to all 7 MAJORs:

- **B1 (join-group semantics)**: now explicitly defined — inherits scheduledDate/timeSlot/assignedInspectorId from the ACCEPTED group; transitions appointment AWAITING_INSPECTOR → SCHEDULED via state-machine 006 with SYS actor; sets `tenantConfirmationStatus = CONFIRMED`; marks token as used (no global revoke).
- **B2 (token/concurrency)**: explicit — join-group blocked after 7 PM cutoff (same as confirm/reschedule), token marked as used after success, new error `PORTAL_GROUP_UNAVAILABLE` for race conditions, retry valid while `used_at IS NULL`.
- **B3 (reschedule free coexists)**: `RescheduleForm.tsx` is **NOT removed**. "Change time" (join-group) is a primary CTA on the date pill; "Propose new date" (free reschedule per 007 US4) remains as a secondary CTA.
- **Cap 10 vs 30**: portal lists groups with `confirmedCount < 10`; the underlying service-group hard cap stays at 30 (admin/marketplace decision 2026-05-06). The 10 is a portal-specific UX floor — not a domain invariant.
- **NEW scope**: Web admin appointment detail must show a portal activity history (consumes existing `GET /v1/appointments/:id/portal-activities`). Frontend-only addition.
- **M1/M2/M3/M6/MINOR**: see §4.3, §5.4, §6 for resolutions.

**v2.1 patch (Crítico round 2/2 ressalvas):**
- MAJOR: previous-group side-effects on join-group (decrement `confirmed_count`, notify previous inspector/operator) — added in §5.2 step 4 + SC-16.
- MAJOR: `PORTAL_TOKEN_ALREADY_USED` added explicitly to the public errors list in §5.2.
- MINOR: canonical date/time format `DD/MM/YYYY` + `hh:mm A` documented in §3.1 + SC-15.

---

## 1. Context

The current Portal Inquilino (Feature 007) is fully implemented at the backend and has a functional but fragmented frontend: separate card sections for ConfirmSection, RescheduleForm, and UnavailableSection, each independently visible and independently submitted.

This redesign replaces the frontend with a single unified form that mirrors the design reference (Hauseful-style layout, adapted to Properfy brand). It also introduces:

- **Weekly availability capture** when the tenant declines (stored as `availableSlotsJson` in restrictions).
- **Join-group flow** ("Change time") that moves an appointment into an existing service group where an inspector is already assigned and capacity (< 10 confirmed) exists in nearby properties.
- **Reschedule free flow** ("Propose new date") — preserved from 007 US4 as a secondary CTA.

Additionally, the `tenantNote` field (already persisted) must be surfaced in the admin map view bulk-actions panel, **and** every portal activity must be visible in the admin appointment detail history/timeline.

---

## 2. Design Reference

Mockups provided by Pedro on 2026-05-24 show:

- Properfy logo (coral, `/apps/web/public/images/Properfy_logo_red.png`) centered at top
- "Inspection Confirmation" heading
- "Booked for:" label with the scheduled date+time in a highlighted pill box
- "Change time" text link immediately below the date pill (primary CTA)
- **"Propose new date" text link** below "Change time" (secondary CTA, opens the existing RescheduleForm in a modal/expanded card — preserves 007 US4)
- Two-paragraph description text contextualizing the form
- **Details section**: 2×2 grid — Agency / Property Manager / Code / Name
- **Options section**: "Do you confirm the inspection?" + Yes/No segmented toggle
- "Observation" textarea (always visible)
- Submit button (gray/disabled by default)
- "powered by properfy" footer

**State: No selected** (second mockup):
- "No" chip highlighted (filled, blue in reference — use Properfy `primary` color)
- Amber/yellow warning banner: "Please add a comment describing the reason to reject the inspection"
- Observation textarea highlighted/required
- Weekly availability picker appears below
- Submit remains disabled until observation + ≥1 availability slot filled

---

## 3. Unified Form — Full Specification

### 3.1 Page structure

**Canonical visual format** (resolves Crítico round 2/2 MINOR):
- **Date**: `DD/MM/YYYY` (Australian convention, matches existing portal formatter in `apps/web/src/features/tenant-portal/components/AppointmentInfoCard.tsx`).
- **Time window**: `hh:mm A – hh:mm A` (12-hour with AM/PM, e.g. `02:00 PM – 05:00 PM`).
- **Timezone**: tenant timezone read from portal-data payload (the appointment's tenant `timezone` field), applied client-side via `Intl.DateTimeFormat` or the existing formatter helper.

```
[Properfy logo — coral, centered]
[Inspection Confirmation — h1]

[Booked for:]
[  08/05/2026  02:00 PM – 05:00 PM  ]   ← highlighted date pill (tenant timezone, format above)
         [Change time]                   ← primary CTA — join-group flow
         [Propose new date]              ← secondary CTA — free reschedule (007 US4)

[Description paragraph]
"This is the confirmation form for an upcoming home inspection scheduled
for the property you're in, at {property.street}, {property.suburb}
{property.state} {property.postcode}. Please check the date, time
and other information before confirming it."

── Details ────────────────────────────────
AGENCY                   PROPERTY MANAGER
{agency.name}            {agency.contactName or agency.name}
CODE                     NAME
{property.propertyCode}  {contact.tenantName}

── Options ────────────────────────────────
Do you confirm the inspection?
[ Yes ]  [ No ]   ← segmented toggle, nothing selected initially

Observation
[ textarea — optional when Yes, required when No ]

[when No selected]:
  ⚠ amber banner: "Please add a comment describing the reason to reject the inspection"
  WeeklyAvailabilityPicker (required — see §4)

[      Submit      ]  ← disabled until requirements met

powered by 🅿 properfy
```

### 3.2 Submit enable rules

| State | Observation | Availability | Submit |
|---|---|---|---|
| Nothing selected | any | any | ❌ disabled |
| Yes selected | any | — | ✅ enabled |
| No selected | empty | any | ❌ disabled |
| No selected | filled | 0 slots | ❌ disabled |
| No selected | filled | ≥1 slot | ✅ enabled |

### 3.3 Yes flow → `POST /v1/tenant-portal/:token/confirm`

- Payload: `{ tenantNote?: string }` (restrictions omitted — no restrictions UI in this design)
- On success: replace the form with a confirmation card ("Attendance Confirmed" — existing ConfirmSection success state, reused inside `InspectionConfirmationForm`)
- tenantNote from Observation textarea

### 3.4 No flow → `POST /v1/tenant-portal/:token/unavailable`

- Payload:
  ```json
  {
    "tenantNote": "string (required on frontend, min 1 char)",
    "restrictions": {
      "isHome": false,
      "unavailableDaysJson": null,
      "unavailableHoursJson": null,
      "notes": null,
      "availableSlotsJson": [
        { "dayOfWeek": "MON", "start": "09:00", "end": "12:00" },
        { "dayOfWeek": "WED", "start": "14:00", "end": "17:00" }
      ]
    }
  }
  ```
- `tenantNote` validation: frontend enforces required for No flow; backend field is already optional and accepts any string ≤ 2000 chars
- `availableSlotsJson`: new field added to `portalRestrictionsSchema` and `AppointmentRestriction` model
- Backward compatibility: existing fields (`isHome`, `unavailableDaysJson`, `unavailableHoursJson`, `notes`) remain in schema. The new portal sends explicit nulls; legacy callers (none in current product, but defensive) still work.
- On success: replace form with unavailability card ("Unavailability Reported" — existing UnavailableSection success state, adapted)
- **Activity recording (M6 resolution)**: `report-unavailability.use-case.ts` must include `availableSlotsJson` in the `new_values_json` snapshot of the `UNAVAILABLE_REPORTED` activity row. This is the only logic change to the use-case beyond persisting the new column.

### 3.5 Change time flow → new endpoints (§5)

- Clicking "Change time" hides the date pill in-place and renders `AvailableGroupsList` inline below the heading area.
- **Cancel/back behaviour (M2 resolution)**: the change-time panel renders with a "← Back" text link in the top-left that restores the date pill and discards any group selection. **No token consumption occurs until the tenant clicks Submit on "Confirm time change"**. Until then, the tenant can freely abandon.
- The list shows service groups meeting the criteria (§5.1).
- Tenant selects a group → preview card shows the group's date + time window in tenant timezone.
- Clicking Submit (now labeled "Confirm time change") calls `POST /v1/tenant-portal/:token/join-group`.
- On success: token marked as used; the date pill updates to the new group's date/time; the form replaces itself with a confirmation card ("Inspection rescheduled with inspector {Name} for {date} {window}").
- **Loading/timeout/error UX (M1 resolution)**:
  - GET available-groups: skeleton loader (3 placeholder rows) while pending; on timeout > 8s, show inline retry button "Trouble loading available times — retry"; on error response, show toast with the error message and the retry button.
  - POST join-group: button shows spinner + "Confirming..." text; disabled during request; on success, replace form with success card; on `PORTAL_GROUP_UNAVAILABLE` or `PORTAL_GROUP_FULL`, show inline error "This time is no longer available — please pick another" and refresh the list; on `PORTAL_ACTION_BLOCKED` (cutoff), show "Time changes are not available after 7 PM the day before the inspection — please contact your agency"; on any other error, generic toast + retry.

### 3.6 Propose new date flow → existing `POST /v1/tenant-portal/:token/reschedule` (US4, untouched)

- Clicking "Propose new date" expands the existing `RescheduleForm.tsx` component (slightly restyled to match the new design system but functionally identical).
- All 007 US4 rules apply: ROUTINE service type only, ≤30 days from original, no past dates, no execution in progress.
- This CTA is **secondary** by design — it is offered when join-group is too restrictive (no nearby groups, or different service type).

---

## 4. WeeklyAvailabilityPicker Component

New component: `apps/web/src/features/tenant-portal/components/WeeklyAvailabilityPicker.tsx`

### 4.1 Visual design

```
  Mon    Tue    Wed    Thu    Fri    Sat    Sun
 [✓ ]  [   ]  [✓ ]  [   ]  [✓ ]  [   ]  [   ]

  Mon  ──  09:00  to  12:00
  Wed  ──  14:00  to  17:00
  Fri  ──  09:00  to  17:00
```

- 7 day chips in a horizontal strip (toggle)
- Selecting a chip appends a time-range row below
- Deselecting a chip removes its row
- Time inputs: `<select>` dropdowns in 30-min increments (06:00 → 22:00)
- Default when chip selected: start = 09:00, end = 17:00
- Validation: `start < end` on each row

### 4.2 Props

```typescript
interface WeeklyAvailabilityPickerProps {
  value: AvailableSlot[];
  onChange: (slots: AvailableSlot[]) => void;
  disabled?: boolean;
}

interface AvailableSlot {
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}
```

### 4.3 Mobile responsiveness (M3 resolution)

- **Day chips strip** (mobile < 480 px): chips wrap to 2 rows of 4-3 instead of horizontal scroll; tap target ≥ 44 px (iOS HIG); chips render as `flex-wrap` with `gap-2`.
- **Time range row** (mobile < 480 px): label + selects stack vertically; selects become full-width.
- **Submit button** (mobile): sticky to bottom of viewport with 16 px padding so it remains accessible while typing in the textarea.
- **Details grid 2×2** (mobile < 480 px): collapses to a single column (4 stacked rows) labeled by uppercase eyebrow text + value.
- **Date pill**: shrinks to two-line layout on narrow viewports (date on top, window below).

### 4.4 Display order

Days rendered in week order: MON → TUE → WED → THU → FRI → SAT → SUN.

---

## 5. New Backend: Change Time (Join Group)

### 5.1 GET available groups

```
GET /v1/tenant-portal/:token/available-groups

Auth: portal token (no JWT)
Response 200:
{
  "groups": [
    {
      "id": "uuid",
      "scheduledDate": "2026-05-30",
      "timeWindow": "09:00-12:00",
      "suburb": "Parramatta",
      "inspectorName": "John D.",
      "confirmedCount": 7,
      "capacityMax": 10
    }
  ]
}
```

**Filter criteria (all must be true):**
1. Group status: `ACCEPTED` (inspector has accepted, `service_groups.status = 'ACCEPTED'`).
2. Same tenant + same service type as the token's appointment (so the inspector is operationally eligible for the same kind of work, and tenant scope is preserved).
3. `confirmedCount < 10` (portal-specific UX cap; the underlying service-group hard cap remains 30 for admin/marketplace — see decision 2026-05-06 item 5).
4. At least one appointment in the group has a property within **2 km** of the token's appointment property (PostGIS `ST_DWithin` against `properties.geo_point::geography`; if the index is unavailable, fall back to Haversine SQL — architect implementation decision).
5. Group's `scheduledDate >= today + 1` (no same-day joins).
6. Cutoff: if the token is in read-only mode (post 7 PM cutoff) the response is `{ "groups": [] }` (tenant should see "Time changes are not available after 7 PM the day before the inspection" rendered by the frontend).

**Response when no groups found**: `{ "groups": [] }` (not an error — UI shows "no available times nearby, please contact your agency or use Propose new date").

**`capacityMax`**: always 10 on the portal response (portal UX cap); the field is informational so the UI can show "7/10 confirmed".

### 5.2 POST join-group

```
POST /v1/tenant-portal/:token/join-group

Auth: portal token (not read-only)
Body:
{
  "groupId": "uuid",
  "tenantNote": "string (optional, ≤ 2000 chars)"
}

Response 200:
{
  "scheduledDate": "2026-05-30",
  "timeWindow": "09:00-12:00",
  "tenantConfirmationStatus": "CONFIRMED",
  "appointmentStatus": "SCHEDULED",
  "inspector": { "id": "uuid", "name": "John D." }
}

Errors:
  PORTAL_ACTION_BLOCKED       — token expired or read-only (post cutoff)
  PORTAL_TOKEN_ALREADY_USED   — token's used_at is not NULL (single-shot replay protection)
  PORTAL_GROUP_NOT_FOUND      — groupId does not exist or does not meet filter criteria
  PORTAL_GROUP_FULL           — group reached 10 confirmed during request (race)
  PORTAL_GROUP_UNAVAILABLE    — group transitioned to CANCELLED/REJECTED, or inspector was unassigned mid-request
  PORTAL_APPOINTMENT_INACTIVE — appointment in CANCELLED/DONE/REJECTED terminal status
```

**Side effects (in order, single transaction where possible):**

1. **Validate token**: token is ACTIVE (not expired/revoked/used). If `usedAt IS NOT NULL`, fail with `PORTAL_TOKEN_ALREADY_USED`.
2. **Validate cutoff**: if read-only (post 7 PM), fail with `PORTAL_ACTION_BLOCKED`.
3. **Validate group**: load group with row-level lock; verify `status = 'ACCEPTED'`, same tenant + serviceType, `confirmedCount < 10`. Otherwise fail with `PORTAL_GROUP_NOT_FOUND`, `PORTAL_GROUP_FULL`, or `PORTAL_GROUP_UNAVAILABLE` (cancelled/rejected).
4. **Detach appointment from current group** (if any — `previousGroupId`):
   - Set `appointment.service_group_id = NULL`.
   - **Decrement** `service_groups.confirmed_count` of the previous group by 1 (atomic SQL update).
   - Audit `appointment.detached_from_group` with `metadata = { previousGroupId, reason: 'tenant_portal_join_other_group' }`.
   - If the previous group's `status = 'ACCEPTED'` AND the appointment was already `SCHEDULED` (i.e. the previous inspector had already accepted this work), **fire-and-forget notification** to the previous group's `assignedInspector` and the operator: "Appointment {code} left your service group {previousGroupId} via tenant portal (joined another group)". Match the existing notification pattern in `report-unavailability.use-case.ts`.
   - If the previous group transitions to empty (`confirmed_count = 0`) after detach, the group is NOT auto-cancelled by this flow — that decision remains with the operator (consistent with how the 19:00 cleanup job handles empty groups: empty groups are cancelled only by an explicit operator/system action, not by individual detachments).
5. **Inherit scheduledDate, timeSlot, assignedInspectorId** from the new group: update appointment fields to match the group's.
6. **Transition appointment status to SCHEDULED via state-machine 006**: call `ExecuteStatusTransitionUseCase` with `actorType = SYSTEM` (system-triggered by portal join), `reason = "Tenant joined service group ${groupId} via portal"`. The transition validates `AWAITING_INSPECTOR → SCHEDULED` (rule SYS/OP). If the appointment is already SCHEDULED (already in a group), the state machine returns idempotent success.
7. **Link appointment to new group**: set `appointment.service_group_id = newGroupId`; bump `service_groups.confirmed_count` by 1.
8. **Set `tenantConfirmationStatus = CONFIRMED`**.
9. **Set `tenantNote`** if provided.
10. **Record `GROUP_JOIN` activity** in `tenant_portal_activities` with previous_values = previous group/scheduledDate/timeSlot/status, new_values = new group/scheduledDate/timeSlot/status. IP + UA recorded.
11. **Write audit `tenant_portal.group_joined`** with `actorType = ANONYMOUS`, `entityType = Appointment`, `entityId = appointmentId`, `tenantId`, before/after, `metadata = { groupId, previousGroupId, urgentMode: false }`.
12. **Mark token as used** (`used_at = now()`) — single-shot semantics; subsequent calls return `PORTAL_TOKEN_ALREADY_USED`.
13. **Fire-and-forget notification** to operator AND to the inspector ("New appointment joined your service group {groupId} via portal").

### 5.3 FR-072 Amendment (B1 resolution)

Feature 007 FR-072 currently reads: "System MUST NOT mutate `appointment.status` from this feature."

**This spec amends FR-072 with an explicit exception:**

> FR-072 (amended for 007.1): The portal MUST NOT mutate `appointment.status` for **confirm**, **reschedule**, **unavailable**, **contact update**, or any read action. The **join-group** action is the only exception — it MUST trigger an `AWAITING_INSPECTOR → SCHEDULED` transition via `ExecuteStatusTransitionUseCase` (state-machine 006) with `actorType = SYSTEM` because joining an accepted group implies the appointment is now scheduled with an inspector. The transition continues to validate via the canonical state machine; it is not a direct SQL mutation. If the appointment is already `SCHEDULED`, the call is idempotent.

This amendment is recorded so future readers do not mistake the join-group transition for a violation of FR-072.

### 5.4 Token & concurrency contract (B2 resolution)

- **Cutoff**: join-group respects the 7 PM day-before cutoff identically to confirm/reschedule. After cutoff, the token is read-only and `PORTAL_ACTION_BLOCKED` is returned.
- **Token consumption**: success → `used_at` is set. Failure (any error) → `used_at` remains NULL, token can be retried with a fresh request. The cancel/back UI flow (§3.5) does not call the endpoint, so it does not consume the token.
- **Token revocation**: NOT applied by join-group. (Only reschedule revokes all tokens, because reschedule changes the date and the operator must mint a new link. Join-group reuses the same appointment id and the link is single-shot anyway.)
- **Race conditions**:
  - Group is filled by another tenant during the request → `PORTAL_GROUP_FULL`.
  - Group was cancelled/rejected during the request → `PORTAL_GROUP_UNAVAILABLE`.
  - Token was already used (concurrent request) → `PORTAL_TOKEN_ALREADY_USED`.

**Idempotency-Key**: NOT required (single-shot token already enforces at-most-once execution).

### 5.5 Capacity Reconciliation (capacity 10 vs 30)

- **Portal UX cap (10)**: enforced only at the portal listing query and at the join-group race-check. It is a UX choice to avoid showing the tenant overcrowded slots near their limit. It is **not a domain invariant**.
- **Service-group hard cap (30)**: remains as documented in `tasks/decisions.md` item 5 (2026-05-06) — enforced by `ServiceGroupValidator`, `prisma-service-group.repository.ts`, and shared Zod. Admin can keep adding appointments up to 30 via existing flows.
- **Implication**: when a group reaches `confirmedCount = 10` it disappears from the portal listing but is still operable by admin/marketplace up to 30.

### 5.6 New TenantPortalAction enum value

`GROUP_JOIN` added to:
- `apps/backend/prisma/schema.prisma` `enum TenantPortalAction { ... GROUP_JOIN }`
- `packages/shared/src/enums/misc.ts` `TenantPortalAction.GROUP_JOIN = 'GROUP_JOIN'`
- Update test `packages/shared/src/enums/misc.test.ts` length assertion: 5 → 6.

---

## 6. Schema Changes

### 6.1 `availableSlotsJson` in restrictions

Add to `AppointmentRestriction` Prisma model:
```prisma
available_slots_json Json? // Array<{dayOfWeek, start, end}>
```

Add to shared Zod schema `portalRestrictionsSchema`:
```typescript
availableSlotsJson: z.array(z.object({
  dayOfWeek: z.enum(['MON','TUE','WED','THU','FRI','SAT','SUN']),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
})).nullable().optional()
```

New Prisma migration required (additive, non-breaking).

### 6.2 `GROUP_JOIN` in enum

Add to `TenantPortalAction` Prisma enum and shared TypeScript enum (see §5.6).

### 6.3 Audit action key

New audit action: `tenant_portal.group_joined` (no schema change; audit_logs uses free-form action string).

---

## 7. Web Admin — New scope (Appointment Portal Activity History)

**Context (decision 2026-05-24)**: All tenant-portal activities must be visible in the admin appointment detail page so operators can see what happened on the portal.

### 7.1 Frontend-only addition

- New component: `apps/web/src/features/appointments/components/AppointmentPortalActivityHistory.tsx`.
- Consumes existing endpoint: `GET /v1/appointments/:id/portal-activities` (no backend change).
- Renders a vertical timeline (most recent first) where each row shows:
  - **Icon + action type** (CONFIRM / RESCHEDULE / UNAVAILABLE_REPORTED / CONTACT_UPDATED / GROUP_JOIN / VIEW)
  - **Timestamp** (tenant timezone with admin's display offset hint)
  - **Relevant data** rendered from `new_values_json`:
    - CONFIRM: `tenantNote` if present
    - RESCHEDULE: new date + window, `tenantNote`
    - UNAVAILABLE_REPORTED: `tenantNote`, `availableSlotsJson` summary (e.g. "Available: Mon 09–12, Wed 14–17, Fri 09–17")
    - CONTACT_UPDATED: changed fields summary
    - GROUP_JOIN: new group id (linked), new date+window, `tenantNote`
    - VIEW: just the timestamp + IP (collapsible — not in the main flow)
  - **Optional IP + UA** in a collapsible "Technical details"
- Empty state: "No portal activity yet."
- Loading state: 3 skeleton rows.
- Error state: inline retry button.

### 7.2 Integration

- Place in the existing appointment detail tab structure (`apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx` or sibling).
- Architect to choose: new tab "Tenant Portal" OR a card section in the existing overview tab.

### 7.3 RBAC

Reuse existing RBAC on `GET /v1/appointments/:id/portal-activities` (AM cross-tenant, OP/CL_ADMIN/CL_USER own tenant — already enforced).

---

## 8. `tenantNote` in Admin Bulk Actions (Map View)

**Context:** The admin portal has a map view where appointments can be selected (bulk actions panel). The `tenantNote` field is already persisted on the appointment but not displayed there.

**Change:** In the bulk-actions side panel (web admin, appointment selected on map), add a read-only "Tenant note" row when `appointment.tenantNote` is non-null and non-empty.

**Scope:** Frontend-only change in the admin appointment bulk-actions component. No backend change.

**Location to find:** `apps/web/src/features/appointments/` — architect to locate the exact map bulk-actions component (likely under `components/AppointmentBulkActionsPanel.tsx` or similar).

---

## 9. Components to Create / Modify

| File | Action |
|---|---|
| `apps/web/src/features/tenant-portal/pages/PortalPage.tsx` | Replace — full redesign |
| `apps/web/src/features/tenant-portal/components/ConfirmSection.tsx` | Remove (collapsed into PortalPage form — Yes flow) |
| `apps/web/src/features/tenant-portal/components/UnavailableSection.tsx` | Remove (collapsed — No flow) |
| `apps/web/src/features/tenant-portal/components/RescheduleForm.tsx` | **Keep** — preserved as secondary "Propose new date" CTA (B3 decision) |
| `apps/web/src/features/tenant-portal/components/WeeklyAvailabilityPicker.tsx` | **Create** |
| `apps/web/src/features/tenant-portal/components/AvailableGroupsList.tsx` | **Create** |
| `apps/web/src/features/tenant-portal/components/InspectionConfirmationForm.tsx` | **Create** (the unified form) |
| `apps/web/src/features/tenant-portal/hooks/usePortalData.ts` | Extend — add `useAvailableGroups`, `useJoinGroup` hooks |
| `apps/web/src/features/tenant-portal/types/index.ts` | Extend — add `AvailableSlot`, `AvailableGroup` types |
| `apps/web/src/features/appointments/components/AppointmentPortalActivityHistory.tsx` | **Create** (web admin history — §7) |
| `apps/web/src/features/appointments/...BulkActionsPanel.tsx` | Extend — show `tenantNote` (§8) |
| `packages/shared/src/schemas/tenant-portal.ts` | Extend — add `availableSlotsJson`; add `joinGroupRequestSchema`, `availableGroupsResponseSchema` |
| `packages/shared/src/enums/misc.ts` | Extend — add `TenantPortalAction.GROUP_JOIN` |
| `apps/backend/prisma/schema.prisma` | Extend — `available_slots_json` column + `GROUP_JOIN` enum value |
| `apps/backend/src/modules/tenant-portal/domain/tenant-portal.errors.ts` | Add `PortalGroupNotFoundError`, `PortalGroupFullError`, `PortalGroupUnavailableError` |
| `apps/backend/src/modules/tenant-portal/application/use-cases/get-available-groups.use-case.ts` | **Create** |
| `apps/backend/src/modules/tenant-portal/application/use-cases/join-group.use-case.ts` | **Create** |
| `apps/backend/src/modules/tenant-portal/application/use-cases/report-unavailability.use-case.ts` | Extend — include `availableSlotsJson` in activity `new_values_json` (M6) |
| `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts` | Add 2 new routes |

---

## 10. What Is NOT Changing

- Token generation, token middleware, token expiry, rate limiting — untouched
- `POST /confirm` use-case and backend — untouched (frontend invocation changes only)
- `POST /unavailable` use-case — receives `availableSlotsJson` passthrough + records it in activity `new_values_json` (M6)
- `POST /reschedule` use-case (007 US4) — untouched; frontend still uses it via "Propose new date" CTA
- `PATCH /contact` use-case — untouched
- `GET /portal-activities` — untouched (frontend admin consumes for §7 — same shape)
- `GET /portal-data` — untouched
- AppointmentInfoCard, ContactForm, PortalLayout, PortalErrorState, error views (Expired/Invalid/Cancelled) — untouched
- `RescheduleForm.tsx` — kept, may receive minor restyling to match new design system (no logic change)
- All 175 unit + 8 integration tests — must remain green

---

## 11. Open Architect Decisions (for plan phase)

- **2 km radius implementation**: PostGIS `ST_DWithin` (preferred, requires geo_point::geography on properties) vs Haversine SQL fallback. Architect to verify Feature 003/016 geo support.
- **`getAvailableGroupsUseCase` wiring**: delegate to `FindAddableGroupsForAppointmentsUseCase` (existing) vs new dedicated repository query. The existing one has different invariants (DRAFT/PUBLISHED only, exact date/timeSlot match) so likely a new dedicated query is cleaner — but the architect should review for code reuse opportunities.
- **`joinGroupUseCase` wiring**: similarly, the existing `AddAppointmentsToGroupUseCase` validator (`canAddToGroup`) rejects ACCEPTED groups and mismatched date/timeSlot. The architect MUST decide between:
  - (a) Branching the canonical validator with a `mode = 'portal-join'` flag that relaxes rules.
  - (b) Creating a new portal-specific use-case that calls the state-machine transition + repo directly, without going through `canAddToGroup`.
  - Recommended: (b) — keeps the canonical admin add-to-group flow untouched and isolates portal semantics. Document why in the plan.
- **Inspector notification**: pg-boss job vs synchronous notification handler. Match the existing pattern in `report-unavailability.use-case.ts`.
- **History tab placement (§7.2)**: new tab vs card in overview tab.

---

## 12. Success Criteria

- **SC-01**: Tenant opens portal → sees single unified form with logo, date pill, details, Yes/No toggle. Both "Change time" and "Propose new date" CTAs visible.
- **SC-02**: Selecting "Yes" → observation optional → Submit enabled → `POST /confirm` fires → confirmation card shown.
- **SC-03**: Selecting "No" → amber warning appears → observation required → WeeklyAvailabilityPicker appears → Submit disabled until observation + ≥1 slot → `POST /unavailable` fires with `tenantNote` + `availableSlotsJson`.
- **SC-04**: Clicking "Change time" → `GET /available-groups` called with loading skeleton → list renders inline → tenant selects group → preview shown → tenant clicks "Confirm time change" → `POST /join-group` fires → success card replaces form, showing new date + inspector name. Tenant can click "← Back" before Submit to cancel without consuming the token.
- **SC-05**: "Change time" with no groups → "No available times nearby — use Propose new date or contact your agency" message → no error state.
- **SC-06**: After post 7 PM cutoff, "Change time" returns empty groups list and the inline error explains the cutoff; "Propose new date" is also blocked with the same explanation.
- **SC-07**: Clicking "Propose new date" → existing `RescheduleForm.tsx` opens → 007 US4 flow runs unchanged.
- **SC-08**: After successful join-group → appointment status = `SCHEDULED`, `scheduledDate` and `timeSlot` match new group, `tenantConfirmationStatus = CONFIRMED`, token marked as used.
- **SC-09**: `availableSlotsJson` persisted in `appointment_restrictions` and visible in `GET /v1/appointments/:id/portal-activities` (via `new_values_json` of the `UNAVAILABLE_REPORTED` row).
- **SC-10**: `tenantNote` visible in admin map view bulk-actions panel when non-empty.
- **SC-11**: `GROUP_JOIN` activity recorded with IP + user agent in `tenant_portal_activities`; audit `tenant_portal.group_joined` written with `actorType = ANONYMOUS`.
- **SC-12**: Web admin appointment detail page shows a portal activity history with all action types (VIEW, CONFIRM, RESCHEDULE, CONTACT_UPDATED, UNAVAILABLE_REPORTED, GROUP_JOIN) rendered with timestamp + relevant data summary.
- **SC-13**: All existing portal tests (175 unit + 8 integration) still pass after schema additions; new unit tests cover join-group success, race conditions (PORTAL_GROUP_FULL, PORTAL_GROUP_UNAVAILABLE), cutoff, and the AWAITING_INSPECTOR → SCHEDULED transition via state-machine 006.
- **SC-14**: Mobile responsive — at viewport ≤ 480 px, the day chips wrap, the time range row stacks, the details grid collapses to single column, the Submit button stays accessible.
- **SC-15**: Date pill and timeWindow render in tenant timezone (from `tenants.timezone` field via portal-data payload), in the canonical format `DD/MM/YYYY` + `hh:mm A – hh:mm A` (§3.1).
- **SC-16**: When a join-group succeeds and the appointment was previously in another `ACCEPTED` group, the previous group's `confirmed_count` is decremented by 1 and a notification is dispatched to the previous group's assigned inspector and operator (fire-and-forget).

---

## 13. Out of Scope (deferred to future iterations)

- Configurability of the 2 km radius per tenant/region (currently hard-coded — can be revisited when a tenant complains).
- Configurability of the 10-confirmed-count portal floor (currently hard-coded — can be revisited when operational data exists).
- Inspector-side veto: if the inspector wants to reject the additional appointment from a portal-driven join, they currently have no UI — they receive a notification only. A future iteration can add a "reject this addition" flow (out of scope here).
- Free-text "reason for time change" surfaced separately from `tenantNote` (currently merged).
