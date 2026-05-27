# Quickstart — Dashboard Alerts (027)

How to verify the feature works locally end-to-end after implementation.

---

## Prerequisites

- `pnpm install` from repo root.
- Local PostgreSQL running (via the standard `docker compose up db` or whatever the local dev convention is).
- Migrations applied: `pnpm --filter backend prisma migrate dev`.
- Seed data with at least:
  - 4 inspectors active and eligible for at least one tenant.
  - 20 appointments split across statuses (DRAFT, AWAITING_INSPECTOR, SCHEDULED, DONE, REJECTED, CANCELLED).
  - At least 15 SCHEDULED appointments with `scheduled_date = tomorrow` and `tenant_confirmation_status = CONFIRMED` for one inspector (to exercise the yellow threshold).
  - At least 18 SCHEDULED + CONFIRMED for another inspector tomorrow (to exercise the red threshold).
  - Mix of "this week" and "outside this week" `scheduled_date` values.

---

## 1. Run the backend

```bash
pnpm --filter backend dev
```

Wait for `Server listening on http://localhost:3000`.

---

## 2. Hit the endpoint as AM

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@properfy.local","password":"<your seed password>"}' \
  | jq -r '.data.accessToken')

curl -s http://localhost:3000/v1/dashboard/stats \
  -H "authorization: Bearer $TOKEN" \
  | jq '.data'
```

Expected response shape (abridged):

```json
{
  "appointmentsByStatus": {
    "draft": 3,
    "awaitingInspector": 4,
    "scheduled": 12,
    "doneThisMonth": 7,
    "doneThisWeek": 2,
    "scheduledThisWeek": 8,
    "rejectedTotal": 5
  },
  "inspectorBreakdowns": {
    "tomorrowByInspector": [
      { "inspectorId": "...", "inspectorName": "Alice", "count": 19, "alertLevel": "red" },
      { "inspectorId": "...", "inspectorName": "Bob",   "count": 16, "alertLevel": "yellow" },
      { "inspectorId": "...", "inspectorName": "Carol", "count": 8,  "alertLevel": null }
    ],
    "scheduledThisWeekByInspector": [/* ... alertLevel: null on all rows */],
    "confirmedThisWeekByInspector": [/* ... alertLevel: null on all rows */]
  }
}
```

Manual checks:
- `appointmentsByStatus.doneThisWeek` should equal the count of DONE appointments with `updated_at` within Monday 00:00 and Sunday 23:59:59.999 of the current week, computed in **server-local time** (same convention as the existing `doneThisMonth`).
- `appointmentsByStatus.rejectedTotal` should equal `SELECT COUNT(*) FROM appointments WHERE status='REJECTED' AND deleted_at IS NULL` (tenant-scoped for CL_*, unscoped for AM/OP).
- `inspectorBreakdowns.tomorrowByInspector[*].alertLevel` should be `'red'` when count >= 18, `'yellow'` when 15 <= count < 18, `null` otherwise.
- Lists sorted by `count DESC`, with `inspectorName ASC` as tiebreaker.
- No row in any list has a null/empty `inspectorName` (the repository filters `inspector_id IS NOT NULL` and joins names via a single `inspector.findMany`).

---

## 3. Hit the endpoint as CL_ADMIN

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"client-admin@properfy.local","password":"<your seed password>"}' \
  | jq -r '.data.accessToken')

curl -s http://localhost:3000/v1/dashboard/stats \
  -H "authorization: Bearer $TOKEN" \
  | jq '.data.inspectorBreakdowns'
```

Expected: `null` (and the scalars are scoped to the tenant).

---

## 4. Run the web app

```bash
pnpm --filter web dev
```

Open `http://localhost:5173`. Sign in as AM.

Manual visual checks on the dashboard page:
- **Row 1** (status): 4 cards — Draft, Awaiting Inspector, Scheduled, Rejected Total.
- **Row 2** (temporal): 3 cards — Done This Week, Done This Month, Scheduled This Week.
- A section label separates the rows (small, uppercase, secondary color).
- Below the existing layout, 3 inspector cards appear side-by-side on `lg:` viewports.
- The "Tomorrow" card shows each inspector with a colored dot:
  - Red dot + red count for count >= 18.
  - Yellow dot + yellow (warning) count for 15..17.
  - Gray dot + default count for < 15.
- The "Tomorrow" card footer shows the legend "yellow >= 15 - red >= 18 inspections/day".
- The "Scheduled This Week" and "Confirmed This Week" cards show inspectors without colored dots (gray only).
- Sign out, sign in as CL_ADMIN. Inspector cards are NOT rendered. The scalars row still works.

---

## 5. Run tests

```bash
pnpm --filter shared test
pnpm --filter backend test
pnpm --filter web test
```

All green expected. Coverage on `apps/backend/src/modules/dashboard/` and `apps/web/src/features/dashboard/` should stay >=80%.

---

## 6. Lint, typecheck, build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

All green expected.

---

## Known acceptable edge cases

- A DONE appointment whose `updated_at` is bumped by an unrelated write (e.g. a financial-entry update) after the DONE transition may appear in `doneThisWeek` for the wrong week. Consistent with the existing `doneThisMonth` behaviour; accepted trade-off per research §D4.
- `tomorrowLabel` displayed in the section header uses the BROWSER's local date (web client computes it), while the backend `tomorrowByInspector` query uses the SERVER's local date. In production both are configured to the same region, so they agree in practice. If a user opens the dashboard from a remote timezone near midnight, the label may say one day while the count reflects another. This is a known limitation; introduce a tenant-timezone column in a future PR if it becomes a customer complaint.

## Performance verification (T-027-1203)

Required before merge for the AM/OP path:

1. Seed staging with >= 200 appointments across roles + >= 10 inspectors with eligibility for at least one tenant.
2. Hit `GET /v1/dashboard/stats` as AM 10 times. Record p50/p95.
3. Acceptance: p95 < 500ms. If the threshold fails, do NOT block this PR — capture the EXPLAIN ANALYZE output and open `T-027-1204` follow-up for index tuning.
