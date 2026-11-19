# Phase 1 — Data Model: F01-3 PWA

This feature introduces **no new persistent entity and no schema change**. The backend fields already exist on `Inspector` (TASK-F01-1). This file documents (a) the fields the PWA consumes/produces over the wire and (b) the only client-side persistent shape (the heartbeat throttle key).

## Consumed server fields (on `Inspector`, via `/v1/inspectors/me*`)

`Inspector` is a **platform-scoped entity with no `tenant_id`** (cross-tenant; CLAUDE.md §7.1). The PWA only ever reads/writes the authenticated inspector's own row, scoped by the INSP token server-side.

| Field (wire, camelCase) | Type | Read by PWA | Written by PWA | Meaning |
|---|---|---|---|---|
| `address` | object \| null (legacy: any shape) | yes (`GET /me`) | yes (`PATCH /me`) | Base address; written via `inspectorBaseAddressSchema`. Legacy rows may not parse. |
| `baseLat` | number \| null | yes | no (stripped if sent) | Permanent latitude; `null` ⇒ no coordinates ⇒ banner shown. |
| `baseLng` | number \| null | yes | no | Permanent longitude (always paired with `baseLat`). |
| `baseGeocodedAt` | string (UTC ISO) \| null | yes | no | Last successful geocode instant. |
| `baseGeocodeFailed` | boolean | yes (write responses only) | no | Transient flag on `PATCH`/create responses → card warning. |

The adoption fields (`appInstalledAt`, `appLastSeenAt`, `pushEnabled`, `appVersion`) are **not** read by the PWA (they are visible to AM/OP in the web, TASK-F01-2); the PWA only *produces* their inputs via the heartbeat.

### Base address shape (`inspectorBaseAddressSchema`, from `@properfy/shared`, TASK-F01-1)

```
street:    string (trim, 1..200, required)
number:    string (trim, ..20, optional)
complement:string (trim, ..200, optional)   // "Unit"
suburb:    string (trim, 1..100, required)
city:      string (trim, 1..100, required)   // PWA sets city = suburb
state:     enum AU_STATES = NSW|VIC|QLD|WA|SA|TAS|ACT|NT (trim, upper)
postcode:  string (/^\d{4}$/)
country:   literal 'AU' (default 'AU', hidden field, still sent)
```

- Whitespace-only text ⇒ empty (trim + min(1)).
- Client-sent `latitude`/`longitude` are silently stripped by Zod strip mode (never persisted).
- Validation messages: "Street is required", "Suburb is required", "Select a state", "Postcode is required", "Postcode must be 4 digits".

## Client-persistent state (`localStorage`)

| Key | Shape | Written when | Cleared when | Notes |
|---|---|---|---|---|
| `properfy.pwa.appStateHeartbeat` | `{ at: number (epochMs), displayMode: 'standalone' \| 'browser' }` | last send returned 204 or 429 | logout (`lib/auth-storage.ts`) | Per-device throttle. All access try/catch; absent ⇒ at most 1 send per app load (module flag). |

## Heartbeat request payload (`POST /v1/inspectors/me/app-state`)

```
displayMode:    'standalone' | 'browser'                       // getIsStandalone() ? standalone : browser
pushPermission: 'granted' | 'denied' | 'default' | 'unsupported' // !('Notification' in window) ? unsupported : Notification.permission
appVersion:     string (1..40)                                 // __APP_VERSION__
```

Response: `204` (no body); `429` when rate-limited (10/min/user, server-side); `400` `VALIDATION_ERROR` on bad payload.

## Derived UI state (not persisted)

| State | Source | Effect |
|---|---|---|
| Banner visibility | `useInspectorMe` loaded AND `baseLat == null` | render banner; variant by `address == null` |
| Banner variant | `address == null` ? v1 : v2 | v1 "Add your base address" / v2 "We couldn't locate…" |
| Card pre-fill vs. legacy notice | `inspectorBaseAddressSchema.safeParse(address)` | parsed ⇒ pre-fill; else ⇒ empty + "incomplete" message + raw value |
| `__APP_VERSION__` | `buildAppVersion(pkg.version, APP_BUILD_SHA)` | footer text + heartbeat `appVersion` |
