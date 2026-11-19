# Phase 1 Data Model: Locked time and per-inspector alert limits (web)

This feature persists nothing of its own. It **consumes** three already-merged contracts and derives
small, referentially-stable view models (root web §13.11 — memoize derived arrays/objects).

## Consumed contracts (IMPLEMENTED REALITY — no change)

### 1. Locked time — `GET /v1/dashboard/locked-time?from&to` → `lockedTimeResponseSchema`

| Field | Type | Notes |
|---|---|---|
| `from`, `to` | civil date string | echoed range |
| `generatedAt` | instant string | UTC ISO |
| `overall` | `{ confirmed:int, required:int, percent:number\|null }` | `percent` rounded 1 dp; `null` when `required === 0` |
| `byAgency[]` | `{ tenantId:uuid, agencyName:string, ...lockedRow }` | only groups that exist |
| `byRegion[]` | `{ regionId:uuid\|null, regionName:string, agencyName:string\|null, ...lockedRow }` | `regionId null` = "No region" (always last); `agencyName null` = global region **or** "No region" |

`lockedRow` = `{ confirmed:int, required:int, percent:number\|null }`.

Query (`lockedTimeQuerySchema`): `from`/`to` optional civil dates. The web always sends both,
`from = today`, `to = today + (period−1)`.

### 2. Inspector alert thresholds — `GET`/`PUT /v1/inspectors/{inspectorId}/alert-thresholds`

- **Response** `inspectorAlertThresholdsResponseSchema`:
  `{ inspectorId:uuid, platformDefaults:{delayMinutes:int, notStartedMinutes:int},
  override:{delayMinutes:int|null, notStartedMinutes:int|null},
  effective:{delayMinutes:int, notStartedMinutes:int} }`.
- **PUT body** `updateInspectorAlertThresholdsSchema` (**`.strict()`**, both keys required):
  `{ delayMinutes:int(5..240)|null, notStartedMinutes:int(5..240)|null }`. `null` = use the platform
  default for that field.

### 3. Live Day alerts platform setting — `GET`/`PUT /v1/platform-settings/liveDayAlerts`

- Value: `{ delayMinutes:int(5..240), notStartedMinutes:int(5..240) }`, defaults `{ 20, 30 }`.
- Read/written through the existing `usePlatformSetting('liveDayAlerts')` hook (last-write-wins, D18).

### 4. Live Day read (anchor only) — `GET /v1/dashboard/live-day` → `liveDayResponseSchema`

Used for `data.today` (the civil-today anchor for the locked-time range, L-F05-09) and already fetched
by `useLiveDay` on this screen. Not refetched by this feature.

## Derived view models (NEW — client-only, memoized)

### LockedTimeView

- `periodDays: 7 | 14 | 30` (default 14) — feature-local constant `LOCKED_TIME_PERIODS`.
- `range: { from, to }` = `{ data.today, addCivilDays(data.today, periodDays − 1) }`.
- `rangeLabel: string` = `"{formatShortDayLabel(from)} – {formatShortDayLabel(to)}"` (no timezone).
- `regionLabel(row): string` = `regionName` + suffix: ` · {agencyName}` when `agencyName`; ` · Platform`
  when `agencyName === null && regionId !== null`; empty when `regionId === null` ("No region").
- `sortedRows(rows, dir)`: stable sort on `percent` (nulls grouped), **then** append the
  `regionId === null` row last regardless of `dir`.
- `formatPercent(p): string` = `p === null ? "—" : p.toFixed(1) + "%"`.

### AlertThresholdsForm (local edit state)

- `delay: { useDefault: boolean, value: string }`, `notStarted: { useDefault: boolean, value: string }`.
- Initial: `useDefault = override.<field> === null`; `value = String(override.<field> ?? '')`.
- Validation per field: when `useDefault` → send `null`; else require an integer in `[5, 240]`
  (reject empty / decimal / out-of-range with "Enter a value between 5 and 240 minutes.").
- Submit payload: `{ delayMinutes, notStartedMinutes }` (each the integer or `null`) — matches the
  strict schema (both keys always present).
- Read-view suffix per field: `override.<field> === null ? "(platform default)" : "(custom)"`;
  displayed value = `effective.<field>`.

### LiveDayAlertsSettingsForm (local edit state)

- `{ delayMinutes: string, notStarted: string }` seeded from the setting value; same 5–240 validation
  and message; submit `{ delayMinutes:int, notStartedMinutes:int }` (no nulls here — platform default
  is always concrete).

## State & keys

- `['locked-time', from, to]` — `staleTime` 60 s, **no** `refetchInterval`.
- `['inspector-alert-thresholds', inspectorId]` — `enabled: isAmOp && drawerOpen`; `PUT` invalidates
  this key + `['live-day']`.
- `usePlatformSetting('liveDayAlerts')` — existing key/behavior.
- `?tab` (Live Day) and `?open` (inspector list) are URL state via `useSearchParams`, written with
  `replace`.

## Invariants

- No inspector GPS coordinate appears in any consumed contract or any view model (root §7.9 — nothing
  to guard here, but no coordinate field is read).
- All civil dates/labels go through the shared helpers in `PLATFORM_TIMEZONE`; no `new Date('YYYY-MM-DD')`,
  no browser timezone in logic.
- Derived arrays/objects are wrapped in `useMemo` keyed on the raw query data (root web §13.11).
