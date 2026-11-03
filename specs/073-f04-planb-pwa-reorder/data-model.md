# Phase 1 Data Model — F04 Plan B PR-B

No new persisted entities and no new shared types. This task consumes existing shared
contracts and introduces one client-only view model.

## Consumed (existing, unchanged — `@properfy/shared`)

- **PreviewDayPlanOrderRequest** = `{ appointmentIds: string[], basedOnVersion: number }`
  (alias of `SaveDayPlanOrderRequest`). Sent to `POST /v1/inspector/day-plans/:date/order/preview`.
- **PreviewDayPlanOrderResponse** = `{ etaSource: 'MATRIX', approximate, approximateReason,
  departureAt, finishEta, totals: { driveS, waitS, serviceS, lateS, distanceM },
  feasible, violations: { appointmentId, lateS }[], stops: { appointmentId, sequence, eta,
  travelS, waitS, lateS }[] }`.
- **DayPlanResponse** — still carries `routingInput` and `geometry` (retained until PR-C). The
  reorder path stops reading `routingInput`; the map keeps reading `geometry`.

## Client-only view model (new, `lib/reorder-preview.ts`)

- **ReorderPreviewView**:
  - `status: 'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE'`
    - `UNAVAILABLE` carries a `reason: 'OFFLINE' | 'STARTED' | 'RATE_LIMIT' | 'ERROR'`.
  - `approximate: boolean` — true when the server degraded to the straight-line stub
    (`approximate: true` on a 200, e.g. Mapbox rate-limit/provider error, for the draft
    or the suggested baseline). The numbers still render, flagged as estimates (matching
    the GET path's `plan.approximate` banner), never as authoritative MATRIX times.
  - `finishMs: number | null` (from `finishEta`)
  - `deltaMin: number | null` (draft finish − suggested finish, both MATRIX; `null` when either
    is unavailable or the started-day/offline case hides it)
  - `driveS: number` (from `totals.driveS`)
  - `etaByAppointmentId: Record<string, number>` (epoch ms from each `stops[].eta`)
  - `violations: { appointmentId: string; lateS: number }[]` (from the response)

## Mapping rules

- `finishEta`/`stops[].eta` are ISO instants → epoch ms; rendered in each stop's timezone with
  a leading "~" (MATRIX is approximate), exactly as the old local ETAs were.
- `deltaMin` uses `Math.round` on the minute difference; 0 renders "Same finish time as suggested".
- Window violation message: `Stop {n} would arrive after its window {range}` where `n` is the
  1-based position in the full displayed order (locked prefix length + index in reorderable order).
- A `distanceM` is intentionally not shown for the reorder draft (the matrix only tracks time),
  matching current behaviour.
