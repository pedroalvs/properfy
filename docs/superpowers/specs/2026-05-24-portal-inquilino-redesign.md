# Design Spec: Portal Inquilino — Redesign Completo

**Date**: 2026-05-24
**Branch**: `patch/portal-inquilino`
**Status**: APPROVED — ready for implementation planning
**Replaces**: `specs/007-tenant-portal/spec.md` (sections US3, US4, US6 and frontend layer)
**Preserves**: All existing backend use-cases (confirm, reschedule, unavailable, contact, token, activities). Only the frontend is fully replaced; backend receives targeted additions.

---

## 1. Context

The current Portal Inquilino (Feature 007) is fully implemented at the backend and has a functional but fragmented frontend: separate card sections for ConfirmSection, RescheduleForm, and UnavailableSection, each independently visible and independently submitted.

This redesign replaces the frontend with a single unified form that mirrors the design reference provided (Hauseful-style layout, adapted to Properfy brand). It also introduces two new backend capabilities:

- **Weekly availability capture** when the tenant declines (stored as `availableSlotsJson` in restrictions)
- **Join-group flow** ("Change time") that moves an appointment into an existing service group where an inspector is already assigned and capacity exists

Additionally, the `tenantNote` field (already persisted) must be surfaced in the admin map view bulk-actions panel.

---

## 2. Design Reference

Mockups provided by Pedro on 2026-05-24 show:

- Properfy logo (coral, `/apps/web/public/images/Properfy_logo_red.png`) centered at top
- "Inspection Confirmation" heading
- "Booked for:" label with the scheduled date+time in a highlighted pill box
- "Change time" text link immediately below the date pill
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
- Weekly availability picker appears below (new addition not in reference mockup)
- Submit remains disabled until observation + ≥1 availability slot filled

---

## 3. Unified Form — Full Specification

### 3.1 Page structure

```
[Properfy logo — coral, centered]
[Inspection Confirmation — h1]

[Booked for:]
[  08/05/2026  02:00 PM – 05:00 PM  ]   ← highlighted date pill
         [Change time]                   ← text link

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
- On success: replace the form with a confirmation card ("Attendance Confirmed" — existing ConfirmSection success state)
- tenantNote from Observation textarea

### 3.4 No flow → `POST /v1/tenant-portal/:token/unavailable`

- Payload:
  ```json
  {
    "tenantNote": "string (required, min 1 char)",
    "restrictions": {
      "availableSlotsJson": [
        { "dayOfWeek": "MON", "start": "09:00", "end": "12:00" },
        { "dayOfWeek": "WED", "start": "14:00", "end": "17:00" }
      ]
    }
  }
  ```
- `tenantNote` validation: required on frontend; backend accepts it as-is (existing field, already optional — frontend enforces requirement)
- `availableSlotsJson`: new field added to `portalRestrictionsSchema` and `AppointmentRestriction` model
- On success: replace form with unavailability card ("Unavailability Reported" — existing UnavailableSection success state, adapted)

### 3.5 Change time flow → new endpoints (§5)

- Clicking "Change time" hides the date pill and renders `AvailableGroupsList` inline below the heading area
- The list shows service groups meeting the criteria (§5.1)
- Tenant selects a group → sees the group's date/time in a preview
- Clicking Submit (now labeled "Confirm time change") calls `POST /v1/tenant-portal/:token/join-group`
- On success: date pill updates to the new group's date/time, form resets to "nothing selected"
- tenantNote from Observation goes in the join-group payload

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

### 4.3 Display order

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
1. Group status: inspector has accepted (`serviceGroupStatus = ACCEPTED` or equivalent — architect to verify exact field)
2. Confirmed appointment count < 10
3. At least one appointment in the group has a property within 2km of the token's appointment property (PostGIS `ST_DWithin` or Haversine fallback)
4. Group's `scheduledDate` >= today + 1

**Response when no groups found**: `{ "groups": [] }` (not an error — UI shows "no available times nearby, please contact your agency")

### 5.2 POST join-group

```
POST /v1/tenant-portal/:token/join-group

Auth: portal token
Body:
{
  "groupId": "uuid",
  "tenantNote": "string (optional)"
}

Response 200:
{
  "scheduledDate": "2026-05-30",
  "timeWindow": "09:00-12:00",
  "tenantConfirmationStatus": "CONFIRMED"
}

Errors:
  PORTAL_ACTION_BLOCKED       — token expired/read-only
  PORTAL_GROUP_NOT_FOUND      — group doesn't meet criteria
  PORTAL_GROUP_FULL           — group now has ≥10 appointments (race)
  PORTAL_APPOINTMENT_INACTIVE — appointment in terminal status
```

**Side effects (same pattern as existing mutations):**
- Moves appointment into the selected group
- Sets `tenantConfirmationStatus = CONFIRMED`
- Records `GROUP_JOIN` activity in `tenant_portal_activities`
- Writes audit `tenant_portal.group_joined` with `actorType = ANONYMOUS`
- Marks token as used
- Fire-and-forget notification to operator

**New TenantPortalAction enum value:** `GROUP_JOIN`

**Note:** Whether a dedicated `JOIN_GROUP` use-case delegates to an existing `AddToGroupUseCase` or calls the group repository directly is an architect decision. The portal contract above is the fixed surface.

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

Add to `TenantPortalAction` Prisma enum and shared TypeScript enum.

---

## 7. tenantNote in Admin Bulk Actions (Map View)

**Context:** The admin portal has a map view where appointments can be selected (bulk actions panel). The `tenantNote` field is already persisted on the appointment but not displayed there.

**Change:** In the bulk-actions side panel (web admin, appointment selected on map), add a read-only "Tenant note" row when `appointment.tenantNote` is non-null and non-empty.

**Scope:** Frontend-only change in the admin appointment bulk-actions component. No backend change.

**Location to find:** `apps/web/src/features/appointments/` — architect to locate the exact map bulk-actions component.

---

## 8. Components to Create / Modify

| File | Action |
|---|---|
| `apps/web/src/features/tenant-portal/pages/PortalPage.tsx` | Replace — full redesign |
| `apps/web/src/features/tenant-portal/components/ConfirmSection.tsx` | Remove (collapsed into PortalPage form) |
| `apps/web/src/features/tenant-portal/components/UnavailableSection.tsx` | Remove (collapsed) |
| `apps/web/src/features/tenant-portal/components/RescheduleForm.tsx` | Remove (replaced by change-time flow) |
| `apps/web/src/features/tenant-portal/components/WeeklyAvailabilityPicker.tsx` | **Create** |
| `apps/web/src/features/tenant-portal/components/AvailableGroupsList.tsx` | **Create** |
| `apps/web/src/features/tenant-portal/components/InspectionConfirmationForm.tsx` | **Create** (the unified form) |
| `apps/web/src/features/tenant-portal/hooks/usePortalData.ts` | Extend — add `useAvailableGroups`, `useJoinGroup` hooks |
| `apps/web/src/features/tenant-portal/types/index.ts` | Extend — add `AvailableSlot`, `AvailableGroup` types |
| `packages/shared/src/schemas/tenant-portal.ts` | Extend — add `availableSlotsJson` to restrictions |
| `apps/backend/prisma/schema.prisma` | Extend — `available_slots_json` column + `GROUP_JOIN` enum value |
| `apps/backend/src/modules/tenant-portal/domain/tenant-portal.errors.ts` | Add `PortalGroupNotFoundError`, `PortalGroupFullError` |
| `apps/backend/src/modules/tenant-portal/application/use-cases/get-available-groups.use-case.ts` | **Create** |
| `apps/backend/src/modules/tenant-portal/application/use-cases/join-group.use-case.ts` | **Create** |
| `apps/backend/src/modules/tenant-portal/interfaces/tenant-portal.routes.ts` | Add 2 new routes |
| Admin map bulk-actions component (location TBD) | Extend — show `tenantNote` |

---

## 9. What Is NOT Changing

- Token generation, token middleware, token expiry, rate limiting — untouched
- `POST /confirm` use-case and backend — untouched
- `POST /unavailable` use-case — receives `availableSlotsJson` passthrough; no logic change beyond persisting the new column
- `PATCH /contact` use-case — untouched
- `GET /portal-activities` — untouched
- AppointmentInfoCard, ContactForm, PortalLayout, PortalErrorState, error views (Expired/Invalid/Cancelled) — untouched
- All 175 unit + 8 integration tests — must remain green

---

## 10. Success Criteria

- **SC-01**: Tenant opens portal → sees single unified form with logo, date pill, details, Yes/No toggle. No separate section cards.
- **SC-02**: Selecting "Yes" → observation optional → Submit enabled → `POST /confirm` fires → confirmation card shown.
- **SC-03**: Selecting "No" → amber warning appears → observation required → WeeklyAvailabilityPicker appears → Submit disabled until observation + ≥1 slot → `POST /unavailable` fires with `tenantNote` + `availableSlotsJson`.
- **SC-04**: Clicking "Change time" → `GET /available-groups` called → list renders inline → tenant selects group → "Confirm time change" submits → appointment joins group → date pill updates.
- **SC-05**: "Change time" with no groups → "No available times nearby" message → no error state.
- **SC-06**: `availableSlotsJson` persisted in `appointment_restrictions` and visible in `GET /v1/appointments/:id/portal-activities` (via `new_values_json`).
- **SC-07**: `tenantNote` visible in admin map view bulk-actions panel when non-empty.
- **SC-08**: All existing portal tests (175 unit + 8 integration) still pass after schema additions.
- **SC-09**: `GROUP_JOIN` activity recorded with IP + user agent in `tenant_portal_activities`.
- **SC-10**: Token marked `used_at` after `join-group` mutation (replay detection).
