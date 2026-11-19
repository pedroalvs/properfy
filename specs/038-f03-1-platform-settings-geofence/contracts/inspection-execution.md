# Contract — Inspection execution (start / finish / detail) changes

## Request (shared) — start & finish gain optional capture fields

```ts
const clientGeoExtras = {
  accuracy: z.number().nonnegative().finite().optional(),            // meters (GeolocationCoordinates.accuracy)
  clientOccurredAt: z.string().datetime({ offset: true }).optional(), // device time of the tap
};
startInspectionSchema  = z.object({ latitude, longitude, ...clientGeoExtras });
finishInspectionSchema = z.object({ latitude, longitude, ...clientGeoExtras });
```

Old bodies (`{latitude, longitude}` only) remain valid (offline-queue compatibility).

## `POST /v1/inspector/appointments/:appointmentId/start` (201)

New response fields (all `optional()` in the schema):

- `startAccuracyMeters: number | null`
- `outOfRadius: boolean`
- `outOfWindow: boolean`
- `geofence: { mode: 'FLAG'|'BLOCK'; effectiveMode: 'FLAG'|'BLOCK'; radiusMeters: number; fallbackReason: 'NO_PROPERTY_COORDINATES'|'NO_ACCURACY'|'POOR_ACCURACY'|null }`

An idempotent return of an **in-progress** execution reports `geofence` with the stored `geofence_radius_m` and the current `effectiveMode`.

**New error** — 422 `GEOFENCE_OUT_OF_RADIUS` (BLOCK, confirmed breach):
message `You are {distance} m from the property. Check-in is only allowed within {radius} m. If you are at the right address, contact operations.`,
`details { distanceMeters, radiusMeters, accuracyMeters }`. Writes nothing, caches no idempotency result.

Unchanged errors: 403 `FORBIDDEN`/`INSPECTOR_NOT_LINKED`, 404 `APPOINTMENT_NOT_FOUND`, 403 `EXECUTION_T1_BLOCKED`, 422 `EXECUTION_TIME_WINDOW_EXCEEDED`, 409 `EXECUTION_ALREADY_FINISHED`, 400 `IDEMPOTENCY_KEY_MISSING`.

## `POST /v1/inspector/appointments/:appointmentId/finish` (200)

New response fields (optional): `finishGeolocationDistanceMeters: number | null`, `finishOutOfRadius: boolean`. Finish never blocks. Distance/flags/accuracy/device-time written in the same transaction as the `SCHEDULED → DONE` transition.

## `GET /v1/inspector/appointments/:appointmentId` (detail)

Adds (optional): `geofence: { radiusMeters: number; mode: 'FLAG'|'BLOCK' }` (read from settings), and in `execution`: `startAccuracyMeters`, `finishAccuracyMeters`, `finishGeolocationDistanceMeters` (`number|null`), `outOfRadius`, `outOfWindow`, `finishOutOfRadius` (`boolean`).

## Check-in order (StartInspectionUseCase)

1 INSP → 2 idempotency → 3 SCHEDULED + assigned (else 404) → 4 T-1 → 4b confirmation → 4c day gate →
5 **existing execution** (finished → 409; in-progress → return it) → 6 distance (if property has coords) →
7 `settings = reader.get('fieldEvents')` → 8 `evaluateGeofence(...)` → if `blocked`: audit `inspection.check_in_blocked` (no coords) + throw `GeofenceOutOfRadiusError` (no write, no idempotency set) →
9 `{ effectiveAt, clientTimePlausible } = resolveEffectiveEventTime(clientOccurredAt, now)`; `clientTimePlausible === false` ⇒ `outOfWindow = false` + `windowSkipped`; else `outOfWindow = isOutOfCheckInWindow({ effectiveAt, …, timeZone: agencyTz })` →
10 create execution with new fields; `geofence_radius_m = settings.geofenceRadiusMeters` **always** →
11 audits (existing + new metadata; `inspection.geolocation_mismatch` when `outOfRadius`, `thresholdMeters = radius`, `phase 'START'`; `windowSkipped` on `inspection.started` when applicable) → 12 idempotency `set`.

## Audit-log read masking

`GET /v1/audit-logs` for `CL_ADMIN` masks coordinate keys to `'[MASKED]'` (`latitude`, `longitude`, `inspectorLatitude`, `inspectorLongitude`, `startLatitude`, `startLongitude`, `finishLatitude`, `finishLongitude`, `propertyLatitude`, `propertyLongitude`), nested + array-aware; non-coordinate values intact; `FULL`-redacted entries untouched; AM/OP unchanged. No contract field change (metadata is already `unknown`).
