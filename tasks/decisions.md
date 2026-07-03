# Architecture Decisions

## 2026-07-03 - PWA schedule uses fixed monthly screen payload

1. PWA schedule load uses `GET /v1/inspector/schedule/month` instead of one request per day.
2. The backend owns the screen window: today through today + 30 days, with `days`, `appointments`, and `overdueAppointments` in one response.
3. Appointment detail stays lazy-loaded via `GET /v1/inspector/appointments/:appointmentId` only after the inspector opens a card.

## 2026-05-06 - Appointments Map-First, appointmentCode & Operational Cleanup

1. `appointmentCode` = existing `appointmentNumber` formatted via `AppointmentCodeFormatter` (e.g. `INS-0042`). UUID remains internal PK; `appointmentCode` is the user-facing identifier in all portals.
2. Appointments module lands on map (`/appointments`); list is secondary via visible button (`/appointments/list`).
3. Appointment detail opens in new browser tab (`window.open`, `target="_blank"`), not inline drawer.
4. Service group creation is map-first with lasso/polygon selection from appointments map using `@mapbox/mapbox-gl-draw`.
5. Max 30 appointments per group (up from 25). Enforced in shared Zod schema, backend validator, and frontend UI (blocking message).
6. Daily 19:00 cleanup rejects unconfirmed appointments for the next day's visit. Eligible: `SCHEDULED` or `AWAITING_INSPECTOR` with `tenantConfirmationStatus != CONFIRMED` and `scheduledDate = tomorrow`. Rejected appointments are removed from their service group; groups are cancelled only if empty after removal.
7. Tenant portal gains free-text note field (`tenant_note` on appointment, max 2000 chars). Available on confirm, reschedule, and unavailability actions. Operators see indicator icon on REJECTED appointments with notes in list, and full note in detail.
8. Map filter panel has Appointments/Groups modes with rich filters: search, status multi-select, service type, contact, branch, date range, time slot, confirmation status, and "show grouped" toggle.
9. Groups filter shows user-facing labels: Awaiting Host (`DRAFT`), Awaiting Inspector (`PUBLISHED`), Accepted (`ACCEPTED`), Canceled (`CANCELLED`).
10. `appointmentCode` search: backend detects `PREFIX-NNNN` pattern via `AppointmentCodeFormatter.parse()` and adds `OR appointment_number = N` to query.
11. Backend filter enhancements: `timeSlot`, `contactSearch`, `hasTenantNote` for appointments; `search`, `branchId`, `contactSearch` for service groups.
12. PWA shows `appointmentCode` on `AppointmentCard` and detail page header.
13. Point-in-polygon for lasso selection uses custom ray casting (no `@turf` dependency).
14. `RejectionReasonCode.TENANT_NO_RESPONSE` added to shared enums for the cleanup job.
15. Cleanup worker registered as pg-boss cron: `0 9 * * *` UTC (19:00 AEST).
