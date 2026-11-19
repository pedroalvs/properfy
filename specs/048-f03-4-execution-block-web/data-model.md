# Phase 1 Data Model — F03-4 (web view-models)

This feature **creates no entities**. It consumes types generated into `packages/shared/src/api-types.ts` and the Zod-inferred types in `packages/shared`. The shapes below are the consumed contracts and the small view-model derivations the web performs.

## Consumed contract types (from `@properfy/shared`)

### InspectorIssue (`inspectorIssueSchema`)
```
{
  reason: string                         // reason code; humanize via formatReasonCodeLabel
  note: string | null
  inspectorId?: string | null            // L-F03-09; may be absent on cached payloads
  inspectorName: string | null
  occurredAt: string                     // UTC instant
}
```
Present (nullable) on `appointmentResponseSchema.inspectorIssue` → carried on `GET /v1/appointments/:id` and each `GET /v1/appointments` item (so `AppointmentDetail` and `AppointmentMapItem`). Persists after re-offer.

### ExecutionSummary (`executionSummarySchema`)
```
{
  id, inspectorName: string | null
  startedAt: string, finishedAt: string | null, abandonedAt: string | null
  startClientAt: string | null, finishClientAt: string | null
  startDistanceMeters: number | null, finishDistanceMeters: number | null
  startAccuracyMeters: number | null, finishAccuracyMeters: number | null
  outOfRadius: boolean, outOfWindow: boolean, finishOutOfRadius: boolean
  geofenceRadiusMeters: number | null    // NULL only for pre-F03 rows
  startLatitude?, startLongitude?, finishLatitude?, finishLongitude?  // AM/OP only — NEVER read by this feature
}
```

### FieldEventItem (`fieldEventItemSchema`)
```
{ id, type: string, reason: string, note: string | null, minutesLate: number | null,
  inspectorName: string | null, occurredAt: string, clientOccurredAt: string | null,
  accuracyMeters: number | null, latitude?, longitude? }   // lat/lng NEVER read
```

### AppointmentFieldActivityResponse (`appointmentFieldActivityResponseSchema`)
```
{ execution: ExecutionSummary | null, events: FieldEventItem[] }   // events descending by occurredAt (backend-ordered)
```

### PlatformSetting (`platformSettingResponseSchema` / list)
```
{ key: string, section: string, value: Record<string,unknown>, defaults: Record<string,unknown>,
  isDefault: boolean, updatedAt: string | null, updatedBy: { id, name } | null }
```
`fieldEvents` value = `{ geofenceRadiusMeters, geofenceMode: 'FLAG'|'BLOCK', checkInWindowToleranceMinutes, completionReminderEnabled, completionReminderMinutesAfterWindowEnd }` (see `fieldEventsSettingSchema`, defaults 300/FLAG/15/true/30).
`PUT /v1/platform-settings/:key` body = `{ value: <complete key object> }`.

### Portal data (`portalDataResponseSchema`)
`appointment.canChangeTime?: boolean` — absent ⇒ treated as `true`.

## Web-local derivations (no new persisted shape)

| Derivation | Rule |
|---|---|
| `currentInspectorSuffix` | `issue.inspectorId && issue.inspectorId === appointment.inspectorId` → " (current inspector)" |
| `reporterLabel` | `issue.inspectorName ?? 'Inspector'` + currentInspectorSuffix |
| `distanceLabel(d, a)` | `d == null` → "Property has no coordinates"; else `` `${d} m` `` + (`a != null` → ` (accuracy ±${a} m)`) |
| `deviceTimeNote(serverAt, clientAt)` | shown only when both present and `abs(diff) > 2 min` → "Device time {HH:mm} (synced later)" |
| flag chips | `outOfRadius` → "Outside geofence ({geofenceRadiusMeters} m)"; `outOfWindow` → "Outside time window"; `finishOutOfRadius` → "Checked out outside geofence"; `abandonedAt` → "Abandoned" |
| `canChangeTime` | `appointment.canChangeTime ?? true` |
| Field-events block empty | `execution == null && events.length === 0` → "No field activity yet." |

## Platform settings form model (client validation)

| Field | Control | Range / rule | Error message |
|---|---|---|---|
| `geofenceRadiusMeters` | number (m) | int 50–5000 | "Enter a radius between 50 and 5000 m" |
| `geofenceMode` | radio FLAG/BLOCK | enum | — (BLOCK shows fallback help) |
| `checkInWindowToleranceMinutes` | number (min) | int 0–240 | "Enter 0 to 240 minutes" |
| `completionReminderEnabled` | switch | boolean | — |
| `completionReminderMinutesAfterWindowEnd` | number (min) | int 0–720, disabled when switch off | "Enter 0 to 720 minutes" |

Submit payload is the full object; dirty state drives Save-enabled and the unsaved-changes prompt.
