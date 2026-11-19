# Phase 1 Data Model — F01-1

## Entity: Inspector (extended)

Platform-scoped, **no `tenant_id`** (pre-existing; constitution §II/§RBAC cross-tenant entity). No new index (table has tens of rows; `base_lat IS NULL` scan is cheap). No CHECK constraint (the lat/lng pair invariant is enforced by the repository in a single write).

| Column (Prisma) | Type | Null | Default | Semantics |
|---|---|---|---|---|
| `address` (existing) | `Json?` | yes | – | Base address. New writes validated by `inspectorBaseAddressSchema`; legacy rows keep their shape, untouched. The create path writes `Prisma.DbNull` where a null is unavoidable, never raw `null`. |
| `base_lat` (new) | `Decimal(10,7)?` | yes | – | Permanent latitude. Null = no coordinates. |
| `base_lng` (new) | `Decimal(10,7)?` | yes | – | Permanent longitude. Always null together with `base_lat`. |
| `base_geocoded_at` (new) | `DateTime?` (timestamp(3)) | yes | – | Last successful geocode. Null when geocoding failed or never ran. |
| `app_installed_at` (new) | `DateTime?` | yes | – | First `standalone` heartbeat. Never overwritten. |
| `app_last_seen_at` (new) | `DateTime?` | yes | – | Last heartbeat. |
| `push_enabled` (new) | `Boolean?` | yes | – | Null = never reported. Before F02, mirrors browser permission (D9). |
| `app_version` (new) | `String? @db.VarChar(40)` | yes | – | Version from the last heartbeat. |

**Invariants**
- Coordinates and `base_geocoded_at` are written and cleared **together**, always in one write. A coordinate for a previous address never survives an address change.
- `app_installed_at = COALESCE(app_installed_at, now)` only on `standalone`; never cleared by a later `browser`.
- The repo maps `Prisma.Decimal` ↔ `number` (`.toNumber()`), like the property repo; entity/DTO use `number | null`.

**Mapping**: `inspector.entity.ts` gains `baseLat/baseLng/baseGeocodedAt/appInstalledAt/appLastSeenAt/pushEnabled/appVersion`; `prisma-inspector.repository.ts` maps the new columns and implements `recordAppState()`.

## Value: InspectorBaseAddress (shared)

Derived from `branchAddressSchema`:

```
street:    string trim min 1 max 200
number:    string trim max 20       optional
complement:string trim max 200      optional
suburb:    string trim min 1 max 100
city:      string trim min 1 max 100
state:     trim+upper, ∈ NSW|VIC|QLD|WA|SA|TAS|ACT|NT   ("Select a state")
postcode:  string trim /^\d{4}$/    ("Postcode must be 4 digits")
country:   literal 'AU' default 'AU'("Only Australian addresses are supported")
```

Zod strip mode drops unknown keys (`latitude`/`longitude` from a client). Structurally compatible with the X02 `GeocodableAddress` (which has `number`/`complement`/`city` optional), so it needs no cast to call `formatGeocodingQuery`.

## Value: InspectorAppState (shared)

```
displayMode:    enum 'standalone' | 'browser'
pushPermission: enum 'granted' | 'denied' | 'default' | 'unsupported'
appVersion:     string trim min 1 max 40
```
Strip mode. `push_enabled` derives as `pushPermission === 'granted'`.

## Repository contract additions (`inspector.repository.ts`)

- `InspectorFilters.missingBaseAddress?: boolean` — when true (AM/OP only), filter to `base_lat IS NULL`.
- `update()` accepts the base fields (`address`, `baseLat`, `baseLng`, `baseGeocodedAt`) and writes them in one call.
- `recordAppState({ id, now, displayMode, pushEnabled, appVersion })` — single `$executeRaw` UPDATE; returns affected count (0 → `InspectorNotFoundError` at the use-case boundary).

## Domain event

`INSPECTOR_EVENTS.BASE_CHANGED = 'inspector.base_changed'`, payload `{ inspectorId: string; hadCoordinates: boolean; hasCoordinates: boolean }`. Emitted after the write by create / OP update / self-update / backfill when the base was stored or changed. No subscriber in F01.

## Field visibility (`inspector-field-visibility.ts`)

`applyInspectorFieldVisibility(dto, actor)`:

| Field | AM/OP | INSP (own) | CL_ADMIN / CL_USER |
|---|---|---|---|
| `address`, `baseLat`, `baseLng`, `baseGeocodedAt` | keep (get **and** list) | keep | **strip** |
| `appInstalledAt`, `appLastSeenAt`, `pushEnabled`, `appVersion` | keep | strip | strip |
| all other fields | unchanged | unchanged | unchanged |
