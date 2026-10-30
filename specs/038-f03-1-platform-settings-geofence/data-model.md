# Data Model — F03-1

## New table: `platform_settings` (PlatformSetting)

Platform-wide configuration. **No `tenant_id`** (documented exception, CLAUDE.md §7 rule 1). Absence of a row ⇒ registry defaults; nothing is seeded.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `uuid()` | PK |
| `key` | `varchar(100)` | no | – | `@unique`; must be a registry key |
| `value_json` | `jsonb` | no | – | the stored value object for the key |
| `updated_by_id` | `uuid` | yes | – | FK → `users.id`, `onDelete: SetNull` |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `@updatedAt` | |

- Relation: `User.platform_settings_updated PlatformSetting[] @relation("PlatformSettingUpdatedBy")`.
- Lifecycle: create-or-update via upsert keyed on `key`; never deleted by the app.

## Extended table: `inspection_executions` (expand-only)

All new columns nullable or defaulted — backward compatible with rows and offline items created before F03.

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `start_accuracy_m` | `Decimal(10,2)` | yes | – | GPS accuracy at check-in (m) |
| `finish_accuracy_m` | `Decimal(10,2)` | yes | – | GPS accuracy at check-out (m) |
| `start_client_at` | `timestamptz` | yes | – | device time at check-in (`clientOccurredAt`) |
| `finish_client_at` | `timestamptz` | yes | – | device time at check-out |
| `finish_geolocation_distance_meters` | `Decimal(10,2)` | yes | – | distance from check-out to property |
| `out_of_radius` | `boolean` | no | `false` | check-in outside radius |
| `out_of_window` | `boolean` | no | `false` | check-in outside slot ± tolerance |
| `finish_out_of_radius` | `boolean` | no | `false` | check-out outside radius |
| `geofence_radius_m` | `int` | yes | – | snapshot of applied radius; written on **every** post-F03 check-in; `NULL` ⇒ pre-F03 row |

New indexes: `@@index([out_of_radius, started_at])`, `@@index([out_of_window, started_at])` (F05/F07 exception queries). Accuracy/distance match the existing `geolocation_distance_meters` type (`Decimal(10,2)`); coordinates stay `Decimal(10,7)`. Still **no `tenant_id`** (unchanged; out of scope).

## Shared registry (not persisted — the source of defaults & validation)

`PLATFORM_SETTINGS_REGISTRY.fieldEvents`:

| Field | Type / rule | Default |
|---|---|---|
| `geofenceRadiusMeters` | int, 50–5000 | 300 |
| `geofenceMode` | `'FLAG' \| 'BLOCK'` (`GeofenceMode`) | `'FLAG'` |
| `checkInWindowToleranceMinutes` | int, 0–240 | 15 |
| `completionReminderEnabled` | boolean | `true` |
| `completionReminderMinutesAfterWindowEnd` | int, 0–720 | 30 |

`section`: `'Field events'` (display label = web `FormSection` title).

Derived types: `PlatformSettingKey = keyof typeof PLATFORM_SETTINGS_REGISTRY`; `PlatformSettingValue<K> = z.infer<registry[K]['schema']>`.

## Domain value shapes (pure, not persisted)

- `evaluateGeofence(input) → { outOfRadius: boolean; effectiveMode: 'FLAG'|'BLOCK'; fallbackReason: 'NO_PROPERTY_COORDINATES'|'NO_ACCURACY'|'POOR_ACCURACY'|null; blocked: boolean }`
- `resolveEffectiveEventTime(clientOccurredAt, serverNow) → { effectiveAt: Date; clientTimePlausible: boolean | null }`
- `isOutOfCheckInWindow({ effectiveAt, scheduledDate, timeSlotStart, timeSlotEnd, toleranceMinutes, timeZone }) → boolean`

## Audit records

| Action | Entity | `tenant_id` | Metadata (no inspector coordinates in new audits) |
|---|---|---|---|
| `platform_setting.updated` | `PlatformSetting` (id = key) | `null` | `before`, `after`, `actor_tenant_id` |
| `inspection.check_in_blocked` (new) | `Appointment` | appointment tenant | `distanceMeters`, `radiusMeters`, `accuracyMeters` |
| `inspection.geolocation_mismatch` (changed) | `Appointment` | appointment tenant | `phase 'START'\|'FINISH'`, `distanceMeters`, `thresholdMeters` (= radius), `accuracyMeters`. START keeps legacy coordinate keys (masked for CL on read); FINISH stores none |
| `inspection.started` / `inspection_execution.started` (changed) | – | appointment tenant | + `accuracyMeters`, `clientOccurredAt`, `outOfRadius`, `outOfWindow`, `geofenceMode`, `geofenceEffectiveMode`, `radiusMeters`, `windowSkipped?` |
| `inspection.finished` / `inspection_execution.finished` (changed) | – | appointment tenant | + `accuracyMeters`, `clientOccurredAt`, `distanceMeters`, `outOfRadius` |

## Domain event

`PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, payload `{ key, before, after, actorId, occurredAt }`, emitted after the `PUT` commit.
